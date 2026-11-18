package cool.atlas.library;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;
import org.json.*;

/** Private spool for accepted Android shares. Each entry has a stable ID for safe retries. */
final class ShareInbox {
  record Result(int saved, List<String> failures) {}

  static boolean webUrl(String source) {
    try {
      java.net.URI url = new java.net.URI(source);
      return ("https".equalsIgnoreCase(url.getScheme()) || "http".equalsIgnoreCase(url.getScheme()))
          && url.getHost() != null && url.getUserInfo() == null;
    } catch (Exception invalid) {
      return false;
    }
  }

  private static File parent(LibraryStore store) {
    return new File(store.root, "capture-inbox");
  }
  static int pending(LibraryStore store) {
    File[] jobs = parent(store).listFiles(file -> file.isDirectory() && new File(file, "capture.json").isFile());
    return jobs == null ? 0 : jobs.length;
  }
  static String prepare(ContentResolver resolver, LibraryStore store, List<Uri> sources, String text,
      String title, String source, JSONArray tags, String folder) throws Exception {
    if (!source.isEmpty() && !webUrl(source)) throw new IOException("Enter a valid source link");
    if (title.trim().isEmpty() || title.length() > 250) throw new IOException("Enter a title of 1–250 characters");
    if (text.length() > 1_000_000) throw new IOException("Shared text is too long");
    if (tags.length() > 100) throw new IOException("Use at most 100 tags");
    for (int i = 0; i < tags.length(); i++)
      if (tags.getString(i).length() > 80) throw new IOException("Tags must be at most 80 characters");
    File job = new File(parent(store), UUID.randomUUID().toString());
    if (!job.mkdirs()) throw new IOException("Could not prepare capture");
    JSONArray entries = new JSONArray();
    List<String> failures = new ArrayList<>();
    try {
      for (Uri uri : sources) {
        String name = "Shared file";
        File staged = null;
        try {
          if (!"content".equals(uri.getScheme())) throw new IOException("Source is unavailable");
          try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) name = cursor.getString(0);
          }
          String id = UUID.randomUUID().toString();
          staged = new File(job, id);
          InputStream input = resolver.openInputStream(uri);
          if (input == null) throw new IOException("Could not open the shared file");
          LibraryStore.copyVerified(input, staged, null);
          entries.put(new JSONObject().put("id", id).put("name", sources.size() == 1 ? title : name)
              .put("mime", resolver.getType(uri)));
        } catch (Exception failed) {
          if (staged != null) staged.delete();
          failures.add(name + ": " + failed.getMessage());
        }
      }
      if (sources.isEmpty()) entries.put(new JSONObject().put("id", UUID.randomUUID().toString()).put("note", true).put("name", title));
      if (entries.length() == 0) throw new IOException(String.join("\n", failures));
      JSONObject manifest = new JSONObject().put("titles", entries).put("text", text)
          .put("source", source).put("tags", tags).put("folder", folder);
      File marker = new File(job, "capture.tmp");
      try (FileOutputStream out = new FileOutputStream(marker)) {
        out.write(manifest.toString().getBytes(StandardCharsets.UTF_8));
        out.getFD().sync();
      }
      Files.move(marker.toPath(), new File(job,"capture.json").toPath(), StandardCopyOption.ATOMIC_MOVE);
      return String.join("\n", failures);
    } finally {
      if (!new File(job, "capture.json").isFile()) delete(job);
    }
  }

  static Result flush(LibraryStore store) {
    File[] jobs = parent(store).listFiles(File::isDirectory);
    List<String> failures = new ArrayList<>();
    int saved = 0;
    if (jobs != null) for (File job : jobs) {
      File marker = new File(job, "capture.json");
      if (!marker.isFile()) {
        delete(job);
        continue;
      }
      try {
        JSONObject manifest = new JSONObject(new String(Files.readAllBytes(marker.toPath()), StandardCharsets.UTF_8));
        JSONArray entries = manifest.getJSONArray("titles");
        for (int i=0; i<entries.length(); i++) {
          JSONObject entry = entries.getJSONObject(i);
          String id = UUID.fromString(entry.getString("id")).toString();
          String name = entry.getString("name"), source = manifest.getString("source");
          JSONArray tags = manifest.getJSONArray("tags");
          String folder = manifest.getString("folder");
          if (store.findExisting(id) != null) { saved++; continue; }
          if (entry.optBoolean("note"))
            store.captureNote(id, name, manifest.getString("text"), source, tags, folder);
          else
            store.captureFile(id, new FileInputStream(new File(job,id)), name,
                entry.optString("mime", "application/octet-stream"), source, tags, folder);
          saved++;
        }
        delete(job);
      } catch (Exception failed) {
        failures.add("Capture pending: " + failed.getMessage());
      }
    }
    return new Result(saved, failures);
  }

  private static void delete(File file) {
    File[] children = file.listFiles();
    if (children != null) for (File child : children) child.delete();
    file.delete();
  }
}
