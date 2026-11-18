package cool.atlas.library;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** Same schema-1 catalog and immutable blobs as Atlas desktop. All writes serialize here. */
public final class LibraryStore implements AutoCloseable {
  public final File root;
  private final SQLiteDatabase db;

  public LibraryStore(File directory) throws Exception {
    root = directory;
    if (!new File(root, "blobs").isDirectory() && !new File(root, "blobs").mkdirs())
      throw new IOException("Cannot create library");
    File staging = new File(root, "staging");
    staging.mkdirs();
    File[] partials = staging.listFiles();
    if (partials != null) for (File f : partials) if (f.isFile()) f.delete();
    db = SQLiteDatabase.openOrCreateDatabase(new File(root, "catalog.sqlite"), null);
    try {
      try (Cursor journal = db.rawQuery("PRAGMA journal_mode=DELETE", null)) {
        if (!journal.moveToFirst() || !"delete".equalsIgnoreCase(journal.getString(0)))
          throw new IOException("Could not prepare library for safe snapshots");
      }
      db.execSQL("PRAGMA synchronous=FULL");
      db.execSQL("CREATE TABLE IF NOT EXISTS schema_info(version INTEGER NOT NULL)");
      try (Cursor c = db.rawQuery("SELECT version FROM schema_info", null)) {
        if (c.moveToFirst()) {
          if (c.getInt(0) != 1) throw new IOException("Unsupported Atlas library version");
        } else db.execSQL("INSERT INTO schema_info VALUES(1)");
      }
      db.execSQL("CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, data TEXT NOT NULL)");
      db.execSQL(
          "CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE)");
      db.execSQL(
          "CREATE TABLE IF NOT EXISTS history(item_id TEXT NOT NULL,revision INTEGER NOT NULL,data"
              + " TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,PRIMARY"
              + " KEY(item_id,revision))");
    } catch (Exception e) {
      db.close();
      throw e;
    }
  }

  public synchronized List<JSONObject> items() throws Exception {
    List<JSONObject> list = new ArrayList<>();
    try (Cursor c = db.rawQuery("SELECT data FROM items ORDER BY rowid DESC", null)) {
      while (c.moveToNext()) list.add(new JSONObject(c.getString(0)));
    }
    return list;
  }

  public synchronized List<JSONObject> collections() throws Exception {
    List<JSONObject> result = new ArrayList<>();
    try (Cursor c = db.rawQuery("SELECT id,name FROM collections ORDER BY name", null)) {
      while (c.moveToNext())
        result.add(new JSONObject().put("id", c.getString(0)).put("name", c.getString(1)));
    }
    return result;
  }

  public synchronized JSONObject get(String id) throws Exception {
    try (Cursor c = db.rawQuery("SELECT data FROM items WHERE id=?", new String[] {id})) {
      if (!c.moveToFirst()) throw new IOException("Item not found");
      return new JSONObject(c.getString(0));
    }
  }

  private JSONObject base(String title) throws Exception {
    String now = Instant.now().toString();
    return new JSONObject()
        .put("id", UUID.randomUUID().toString())
        .put("kind", "note")
        .put("title", title)
        .put("description", "")
        .put("tags", new JSONArray())
        .put("collections", new JSONArray())
        .put("relations", new JSONArray())
        .put("body", "")
        .put("favorite", false)
        .put("trashed", false)
        .put("revision", 1)
        .put("createdAt", now)
        .put("updatedAt", now)
        .put("filename", "")
        .put("mime", "text/markdown")
        .put("size", 0)
        .put("hash", JSONObject.NULL);
  }

  private void save(JSONObject item, String action) throws Exception {
    db.beginTransaction();
    try {
      ContentValues values = new ContentValues();
      values.put("id", item.getString("id"));
      values.put("data", item.toString());
      if (db.insertWithOnConflict("items", null, values, SQLiteDatabase.CONFLICT_REPLACE) < 0)
        throw new IOException("Cannot save item");
      db.execSQL(
          "INSERT INTO history VALUES(?,?,?,?,?,?)",
          new Object[] {
            item.getString("id"),
            item.getInt("revision"),
            item.toString(),
            action,
            "android",
            item.getString("updatedAt")
          });
      db.setTransactionSuccessful();
    } finally {
      db.endTransaction();
    }
  }

  public synchronized JSONObject note(String title, String body) throws Exception {
    validateText(title, body);
    JSONObject item =
        base(title.trim())
            .put("body", body)
            .put("size", body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
    save(item, "create note");
    return item;
  }

  public synchronized JSONObject edit(
      String id,
      int revision,
      String title,
      String description,
      String body,
      JSONArray tags,
      JSONArray collections,
      boolean favorite,
      boolean trashed)
      throws Exception {
    validateText(title, body);
    if (description.length() > 20000 || tags.length() > 100 || collections.length() > 100)
      throw new IOException("Too many tags or collections, or description is too long");
    for (int n = 0; n < tags.length(); n++)
      if (tags.getString(n).trim().isEmpty() || tags.getString(n).length() > 80)
        throw new IOException("Tags must contain 1–80 characters");
    Set<String> known = new HashSet<>();
    for (JSONObject c : collections()) known.add(c.getString("id"));
    for (int n = 0; n < collections.length(); n++)
      if (!known.contains(collections.getString(n))) throw new IOException("Unknown collection");
    JSONObject item = get(id);
    if (item.getInt("revision") != revision)
      throw new IOException("This item changed. Reopen it before saving your changes.");
    item.put("title", title.trim())
        .put("description", description)
        .put("tags", tags)
        .put("collections", collections)
        .put("favorite", favorite)
        .put("trashed", trashed)
        .put("revision", revision + 1)
        .put("updatedAt", Instant.now().toString());
    if (item.getString("kind").equals("note"))
      item.put("body", body)
          .put("size", body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
    save(item, "edit");
    return item;
  }

  private void validateText(String title, String body) throws IOException {
    if (title.trim().isEmpty() || title.trim().length() > 250 || body.length() > 1_000_000)
      throw new IOException(
          "Use a title of 1–250 characters and a note below one million characters");
  }

  public synchronized JSONObject collection(String name) throws Exception {
    name = name.trim();
    if (name.isEmpty() || name.length() > 80)
      throw new IOException("Collection names must contain 1–80 characters");
    for (JSONObject c : collections()) if (c.getString("name").equals(name)) return c;
    String id = UUID.randomUUID().toString();
    db.execSQL("INSERT INTO collections VALUES(?,?)", new Object[] {id, name});
    return new JSONObject().put("id", id).put("name", name);
  }

  public synchronized JSONObject importFile(InputStream input, String filename, String mime)
      throws Exception {
    filename = filename.replace('\\', '/');
    filename = filename.substring(filename.lastIndexOf('/') + 1).replaceAll("[\\x00-\\x1f]", "");
    if (filename.trim().isEmpty()) filename = "Imported file";
    if (filename.length() > 250) filename = filename.substring(0, 250);
    File temp = new File(root, "staging/" + UUID.randomUUID());
    try {
      String hash = copyVerified(input, temp, null);
      File blob = blob(hash);
      if (blob.exists()) {
        if (!digest(blob).equals(hash)) throw new IOException("Existing original is damaged");
        temp.delete();
      } else Files.move(temp.toPath(), blob.toPath(), StandardCopyOption.ATOMIC_MOVE);
      JSONObject item =
          base(filename)
              .put("kind", "asset")
              .put("filename", filename)
              .put("hash", hash)
              .put("mime", mime == null ? "application/octet-stream" : mime)
              .put("size", blob.length());
      save(item, "import");
      return item;
    } finally {
      temp.delete();
    }
  }

  public File blob(String hash) throws IOException {
    if (hash == null || !hash.matches("[a-f0-9]{64}"))
      throw new IOException("Invalid original file reference");
    return new File(root, "blobs/" + hash);
  }

  public static String digest(File file) throws Exception {
    MessageDigest hash = MessageDigest.getInstance("SHA-256");
    try (InputStream in = new FileInputStream(file)) {
      byte[] bytes = new byte[65536];
      int n;
      while ((n = in.read(bytes)) != -1) hash.update(bytes, 0, n);
    }
    return hex(hash.digest());
  }

  private static String hex(byte[] bytes) {
    StringBuilder b = new StringBuilder();
    for (byte v : bytes) b.append(String.format(Locale.ROOT, "%02x", v & 255));
    return b.toString();
  }

  public static String copyVerified(InputStream input, File destination, String expected)
      throws Exception {
    MessageDigest hash = MessageDigest.getInstance("SHA-256");
    try (InputStream in = input;
        FileOutputStream out = new FileOutputStream(destination)) {
      byte[] bytes = new byte[65536];
      int n;
      while ((n = in.read(bytes)) != -1) {
        out.write(bytes, 0, n);
        hash.update(bytes, 0, n);
      }
      out.getFD().sync();
    }
    String value = hex(hash.digest());
    if ((expected != null && !expected.equals(value)) || !digest(destination).equals(value))
      throw new IOException("Original file failed verification");
    return value;
  }

  public synchronized Set<String> referencedHashes() throws Exception {
    Set<String> result = new HashSet<>();
    try (Cursor c =
        db.rawQuery("SELECT data FROM items UNION ALL SELECT data FROM history", null)) {
      while (c.moveToNext()) {
        JSONObject i = new JSONObject(c.getString(0));
        UUID.fromString(i.getString("id"));
        if (i.getInt("revision") < 1) throw new IOException("Invalid revision");
        if (i.getString("kind").equals("asset")) {
          String h = i.getString("hash");
          blob(h);
          result.add(h);
        } else if (!i.getString("kind").equals("note"))
          throw new IOException("Unsupported item type");
      }
    }
    return result;
  }

  public synchronized void snapshot(File destination) throws Exception {
    if (destination.exists()) throw new IOException("Backup destination already exists");
    if (!new File(destination, "blobs").mkdirs()) throw new IOException("Cannot create backup");
    try {
      // DELETE journal mode plus synchronized operations keeps this committed copy stable.
      copyVerified(
          new FileInputStream(new File(root, "catalog.sqlite")),
          new File(destination, "catalog.sqlite"),
          null);
      Set<String> hashes = referencedHashes();
      for (String hash : hashes)
        copyVerified(new FileInputStream(blob(hash)), new File(destination, "blobs/" + hash), hash);
      JSONObject manifest =
          new JSONObject()
              .put("format", "atlas-backup")
              .put("version", 1)
              .put("createdAt", Instant.now().toString())
              .put("items", items().size())
              .put("files", hashes.size());
      try (FileOutputStream out =
          new FileOutputStream(new File(destination, "atlas-backup.json"))) {
        out.write(manifest.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        out.getFD().sync();
      }
    } catch (Exception e) {
      deleteTree(destination);
      throw e;
    }
  }

  public static void verifyCatalog(File catalog) throws Exception {
    SQLiteDatabase check =
        SQLiteDatabase.openDatabase(catalog.getPath(), null, SQLiteDatabase.OPEN_READONLY);
    try (Cursor c = check.rawQuery("PRAGMA integrity_check", null);
        Cursor s = check.rawQuery("SELECT version FROM schema_info", null)) {
      if (!c.moveToFirst() || !"ok".equals(c.getString(0)) || !s.moveToFirst() || s.getInt(0) != 1)
        throw new IOException("Damaged or incompatible Atlas backup");
    } finally {
      check.close();
    }
  }

  public static void deleteTree(File file) {
    File[] children = file.listFiles();
    if (children != null) for (File child : children) deleteTree(child);
    file.delete();
  }

  @Override
  public synchronized void close() {
    db.close();
  }
}
