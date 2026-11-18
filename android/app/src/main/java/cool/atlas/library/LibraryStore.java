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
import org.json.JSONException;

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
      db.execSQL("CREATE TABLE IF NOT EXISTS removed_folders(id TEXT PRIMARY KEY,data TEXT NOT NULL)");
      db.execSQL("CREATE TABLE IF NOT EXISTS smart_folders(id TEXT PRIMARY KEY,data TEXT NOT NULL)");
      db.execSQL("CREATE TABLE IF NOT EXISTS collection_tree(id TEXT PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,parent_id TEXT REFERENCES collections(id),title TEXT NOT NULL)");
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
    try (Cursor c = db.rawQuery("SELECT c.id,c.name,coalesce(t.title,c.name),t.parent_id FROM collections c LEFT JOIN collection_tree t ON c.id=t.id ORDER BY c.name", null)) {
      while (c.moveToNext())
        result.add(new JSONObject().put("id", c.getString(0)).put("name", c.getString(1)).put("title", c.getString(2)).put("parentId", c.isNull(3) ? JSONObject.NULL : c.getString(3)));
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
    return captureNote(UUID.randomUUID().toString(), title, body, "", new JSONArray(), "");
  }

  public synchronized JSONObject captureNote(String id, String title, String body, String source, JSONArray tags, String folder) throws Exception {
    JSONObject previous = findExisting(id);
    if (previous != null) return previous;
    validateText(title, body);
    JSONObject item =
        base(title.trim()).put("id", id).put("sourceUrl", source).put("tags", tags).put("collections", captureFolder(folder))
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
    return edit(id, revision, title, description, body, tags, collections, favorite, trashed, null, null);
  }

  public synchronized JSONObject edit(String id, int revision, String title, String description, String body,
      JSONArray tags, JSONArray collections, boolean favorite, boolean trashed, String sourceUrl, Integer rating) throws Exception {
    validateText(title, body);
    if (sourceUrl != null && !sourceUrl.isEmpty() && !ShareInbox.webUrl(sourceUrl))
      throw new IOException("Use a valid http or https source link");
    if (rating != null && (rating < 0 || rating > 5)) throw new IOException("Rating must be from 0 to 5");
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
    if (sourceUrl != null) item.put("sourceUrl", sourceUrl);
    if (rating != null) item.put("rating", rating);
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
    return collection(name, "");
  }

  public synchronized JSONObject collection(String title, String parentId) throws Exception {
    title = title.trim();
    if (title.isEmpty() || title.length() > 80) throw new IOException("Collection names must contain 1–80 characters");
    String workspaceName = title;
    List<JSONObject> known = collections();
    if (!parentId.isEmpty()) {
      JSONObject parent = null;
      for (JSONObject entry : known) if (entry.getString("id").equals(parentId)) parent = entry;
      if (parent == null) throw new IOException("Parent folder is unavailable");
      workspaceName = parent.getString("name") + " / " + title;
    }
    for (JSONObject entry : known)
      if (title.equals(entry.getString("title")) && parentId.equals(entry.isNull("parentId") ? "" : entry.optString("parentId"))) return entry;
    String id = UUID.randomUUID().toString();
    for (JSONObject entry : known)
      if (workspaceName.equals(entry.getString("name"))) { workspaceName += " [" + id + "]"; break; }
    db.beginTransaction();
    try {
      db.execSQL("INSERT INTO collections VALUES(?,?)", new Object[]{id, workspaceName});
      db.execSQL("INSERT INTO collection_tree VALUES(?,?,?)", new Object[]{id, parentId.isEmpty() ? null : parentId, title});
      db.setTransactionSuccessful();
    } finally { db.endTransaction(); }
    return new JSONObject().put("id", id).put("name", workspaceName).put("title", title);
  }

  synchronized JSONObject findExisting(String id) throws JSONException {
    try (Cursor cursor = db.rawQuery("SELECT data FROM items WHERE id=?", new String[]{id})) {
      return cursor.moveToFirst() ? new JSONObject(cursor.getString(0)) : null;
    }
  }

  synchronized void organizeItems(List<JSONObject> selected, JSONArray tags, String folder, Boolean trashed) throws Exception {
    if (!folder.isEmpty() && captureFolder(folder).length() == 0) throw new IOException("Folder is unavailable");
    db.beginTransaction();
    try {
      for (JSONObject original : selected) {
        JSONObject item = get(original.getString("id"));
        int revision = original.getInt("revision");
        if (item.getInt("revision") != revision) throw new IOException("An item changed. Select the items again.");
        JSONArray targetTags = item.getJSONArray("tags"), memberships = item.getJSONArray("collections");
        for (int i=0;i<tags.length();i++) addUnique(targetTags,tags.getString(i));
        if (!folder.isEmpty()) addUnique(memberships,folder);
        edit(item.getString("id"),revision,item.getString("title"),item.getString("description"),
            item.optString("body"),targetTags,memberships,item.optBoolean("favorite"),trashed == null ? item.optBoolean("trashed") : trashed);
      }
      db.setTransactionSuccessful();
    } finally { db.endTransaction(); }
  }

  synchronized JSONObject previewRemoval(String key) throws Exception {
    List<JSONObject> folders = collections();
    LinkedHashSet<String> ids = new LinkedHashSet<>();
    ids.add(key);
    JSONArray branch = new JSONArray();
    for (JSONObject folder : folders)
      if (key.equals(folder.getString("id"))) branch.put(folder);
    if (branch.length() == 0) throw new IOException("Folder is unavailable");
    for (int index=0;index<branch.length();index++) {
      String id = branch.getJSONObject(index).getString("id");
      for (JSONObject folder : folders) {
        if (id.equals(folder.optString("parentId")) && ids.add(folder.getString("id")))
          branch.put(folder);
      }
    }
    JSONArray memberships = new JSONArray();
    for (JSONObject item : items()) {
      JSONArray old = item.getJSONArray("collections"), affected = new JSONArray();
      for (int i=0;i<old.length();i++) if (ids.contains(old.getString(i))) affected.put(old.getString(i));
      if (affected.length() > 0) memberships.put(new JSONObject().put("id",item.getString("id"))
          .put("revision",item.getInt("revision")).put("folders",affected));
    }
    return new JSONObject().put("branch",branch).put("memberships",memberships);
  }

  synchronized String removeFolder(JSONObject preview) throws Exception {
    JSONArray branch = preview.getJSONArray("branch");
    if (!preview.toString().equals(previewRemoval(branch.getJSONObject(0).getString("id")).toString()))
      throw new IOException("The folder changed. Review deletion again.");
    String ticket = UUID.randomUUID().toString();
    db.beginTransaction();
    try {
      updateFolderMemberships(preview.getJSONArray("memberships"),false);
      for (int index=branch.length()-1;index>=0;index--) {
        String id = branch.getJSONObject(index).getString("id");
        db.execSQL("DELETE FROM collection_tree WHERE id=?",new String[]{id});
        db.execSQL("DELETE FROM collections WHERE id=?",new String[]{id});
      }
      db.execSQL("INSERT INTO removed_folders VALUES(?,?)",new String[]{ticket,preview.toString()});
      db.setTransactionSuccessful();
      return ticket;
    } finally { db.endTransaction(); }
  }

  synchronized String restoreFolder(String ticket) throws Exception {
    try (Cursor rows = db.rawQuery("SELECT data FROM removed_folders WHERE id=?",new String[]{ticket})) {
      if (!rows.moveToFirst()) throw new IOException("Folder undo is unavailable");
      JSONObject preview = new JSONObject(rows.getString(0));
      JSONArray branch = preview.getJSONArray("branch");
      Set<String> names = new HashSet<>(), ids = new HashSet<>();
      for (JSONObject current : collections()) { names.add(current.getString("name")); ids.add(current.getString("id")); }
      db.beginTransaction();
      try {
        for (int i=0;i<branch.length();i++) {
          JSONObject folder = branch.getJSONObject(i);
          String id = folder.getString("id"), name = folder.getString("name");
          String parent = folder.isNull("parentId") ? null : folder.getString("parentId");
          if (parent != null && !ids.contains(parent)) throw new IOException("Restore the parent folder first");
          if (names.contains(name)) name += " [" + id + "]";
          db.execSQL("INSERT INTO collections VALUES(?,?)",new Object[]{id,name});
          db.execSQL("INSERT INTO collection_tree VALUES(?,?,?)",new Object[]{id,parent,folder.getString("title")});
          ids.add(id);
          names.add(name);
        }
        updateFolderMemberships(preview.getJSONArray("memberships"),true);
        db.execSQL("DELETE FROM removed_folders WHERE id=?",new String[]{ticket});
        db.setTransactionSuccessful();
      } finally { db.endTransaction(); }
      return branch.getJSONObject(0).getString("id");
    }
  }

  private void updateFolderMemberships(JSONArray changes, boolean restore) throws Exception {
    for (int i=0;i<changes.length();i++) {
      JSONObject change = changes.getJSONObject(i);
      JSONObject item = get(change.getString("id"));
      LinkedHashSet<String> current = new LinkedHashSet<>();
      JSONArray original = item.getJSONArray("collections"), affected = change.getJSONArray("folders");
      for (int n=0;n<original.length();n++) current.add(original.getString(n));
      for (int n=0;n<affected.length();n++)
        if (restore) current.add(affected.getString(n)); else current.remove(affected.getString(n));
      if (current.size() > 100) throw new IOException("An item already has too many folders");
      item.put("collections",new JSONArray(current)).put("revision",item.getInt("revision")+1)
          .put("updatedAt",Instant.now().toString());
      save(item,restore ? "restore folder" : "remove folder");
    }
  }

  synchronized List<JSONObject> smartFolders() throws Exception {
    List<JSONObject> values = new ArrayList<>();
    try (Cursor rows = db.rawQuery("SELECT data FROM smart_folders ORDER BY rowid", null)) {
      while (rows.moveToNext()) values.add(new JSONObject(rows.getString(0)));
    }
    return values;
  }

  synchronized String saveSmartFolder(String name, String field, String value) throws Exception {
    if (name.trim().isEmpty() || name.length() > 80 || value.trim().isEmpty() || value.length() > 120)
      throw new IOException("Enter a valid name and filter");
    String id = UUID.randomUUID().toString();
    JSONObject rule = new JSONObject().put("field", field).put("operator", "contains").put("value", value.trim());
    JSONObject filter = new JSONObject().put("id", id).put("name", name.trim()).put("match", "all")
        .put("rules", new JSONArray().put(rule));
    db.execSQL("INSERT INTO smart_folders VALUES(?,?)", new Object[]{id, filter.toString()});
    return id;
  }

  private boolean matchesRule(JSONObject item, JSONObject rule) {
    List<String> values = new ArrayList<>();
    String field = rule.optString("field");
    if ("tag".equals(field) || "folder".equals(field)) {
      JSONArray property = item.optJSONArray("tag".equals(field) ? "tags" : "collections");
      if (property != null) for (int n=0;n<property.length();n++) values.add(property.optString(n));
      if (values.isEmpty()) values.add("tag".equals(field) ? "__untagged__" : "__uncategorized__");
    } else if ("type".equals(field)) {
      String name = item.optString("filename"), mime = item.optString("mime");
      values.add(mime);
      values.add(mime.split("/", 2)[0]);
      String ext = "note".equals(item.optString("kind")) ? "md" : name.substring(name.lastIndexOf('.') + 1);
      values.add("jpeg".equalsIgnoreCase(ext) ? "jpg" : ext);
      values.add(ext);
    } else if ("rating".equals(field)) values.add(Integer.toString(item.optInt("rating")));
    else if ("name".equals(field)) values.add(item.optString("title"));
    else if ("color".equals(field)) values.add(item.optString("primaryColor"));
    else if ("shape".equals(field)) {
      JSONObject source = item.optJSONObject("source");
      JSONObject metadata = source == null ? null : source.optJSONObject("metadata");
      if (metadata != null) {
        double width = metadata.optDouble("width"), height = metadata.optDouble("height");
        if (width > 0 && height > 0) values.add(Math.abs(width / height - 1) < 0.04 ? "square" : width > height ? "landscape" : "portrait");
      }
    }
    String needle = rule.optString("value").toLowerCase(Locale.ROOT), op = rule.optString("operator");
    boolean found = false;
    for (String value : values)
      if ("contains".equals(op) ? value.toLowerCase(Locale.ROOT).contains(needle) : value.equalsIgnoreCase(needle)) found = true;
    return "is not".equals(op) ? !found : found;
  }

  boolean matchesSmartFolder(JSONObject item, JSONObject filter) {
    JSONArray rules = filter.optJSONArray("rules");
    if (rules == null || rules.length() == 0) return false;
    boolean any = "any".equals(filter.optString("match"));
    Map<String,Boolean> groups = new HashMap<>();
    for (int n=0;n<rules.length();n++) {
      JSONObject rule = rules.optJSONObject(n);
      if (rule == null) continue;
      boolean match = matchesRule(item, rule);
      if (!any && rule.optBoolean("anyWithinField") && !"is not".equals(rule.optString("operator"))) {
        String field = rule.optString("field");
        groups.put(field, match || Boolean.TRUE.equals(groups.get(field)));
      } else if (match == any) return any;
    }
    return !any && !groups.containsValue(false);
  }

  private JSONArray captureFolder(String id) throws Exception {
    for (JSONObject folder : collections())
      if (folder.getString("id").equals(id)) return new JSONArray().put(id);
    return new JSONArray();
  }

  public synchronized JSONObject importFile(InputStream input, String filename, String mime) throws Exception {
    return captureFile(UUID.randomUUID().toString(), input, filename, mime, "", new JSONArray(), "");
  }

  public synchronized JSONObject captureFile(String id, InputStream input, String filename, String mime,
      String source, JSONArray tags, String folder) throws Exception {
    JSONObject previous = findExisting(id);
    if (previous != null) { input.close(); return previous; }
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
              .put("id", id)
              .put("collections", captureFolder(folder))
              .put("tags", tags)
              .put("sourceUrl", source)
              .put("importedAt", Instant.now().toString())
              .put("kind", "asset")
              .put("filename", filename)
              .put("hash", hash)
              .put("mime", mime == null ? "application/octet-stream" : mime)
              .put("size", blob.length());
      for (JSONObject filter : smartFolders()) {
        if (!matchesSmartFolder(item, filter)) continue;
        String tag = filter.optString("addTag"), destination = filter.optString("addFolder");
        if (!tag.isEmpty()) item.put("tags", addUnique(item.getJSONArray("tags"), tag));
        if (!destination.isEmpty() && captureFolder(destination).length() != 0)
          item.put("collections", addUnique(item.getJSONArray("collections"), destination));
      }
      save(item, "import");
      return item;
    } finally {
      temp.delete();
    }
  }

  private JSONArray addUnique(JSONArray list, String value) {
    if (list.length() >= 100) return list;
    for (int n=0;n<list.length();n++) if (value.equals(list.optString(n))) return list;
    return list.put(value);
  }

  public synchronized List<JSONObject> history(String id) throws Exception {
    List<JSONObject> entries = new ArrayList<>();
    try (Cursor rows = db.rawQuery("SELECT data,action,at FROM history WHERE item_id=? ORDER BY revision DESC", new String[]{id})) {
      while (rows.moveToNext()) entries.add(new JSONObject(rows.getString(0)).put("historyAction",rows.getString(1)).put("historyTime",rows.getString(2)));
    }
    return entries;
  }

  public synchronized JSONObject restore(String id, int revision, int expected) throws Exception {
    JSONObject current = get(id);
    if (current.getInt("revision") != expected) throw new IOException("This item changed. Reopen its history.");
    try (Cursor rows = db.rawQuery("SELECT data FROM history WHERE item_id=? AND revision=?",new String[]{id,Integer.toString(revision)})) {
      if (!rows.moveToFirst()) throw new IOException("Version is unavailable");
      JSONObject value = new JSONObject(rows.getString(0));
      JSONArray memberships = value.getJSONArray("collections");
      Set<String> available = new HashSet<>();
      for (JSONObject folder : collections()) available.add(folder.getString("id"));
      JSONArray restored = new JSONArray();
      for (int index=0; index<memberships.length(); index++)
        if (available.contains(memberships.getString(index))) restored.put(memberships.getString(index));
      value.put("collections", restored).put("revision", expected + 1).put("updatedAt", Instant.now().toString());
      save(value, "restore revision");
      return value;
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
