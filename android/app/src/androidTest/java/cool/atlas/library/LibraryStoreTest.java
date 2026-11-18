package cool.atlas.library;

import android.test.InstrumentationTestCase;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

public final class LibraryStoreTest extends InstrumentationTestCase {
  private void copyAsset(String path, File target) throws Exception {
    String[] children = getInstrumentation().getContext().getAssets().list(path);
    if (children != null && children.length > 0) {
      target.mkdirs();
      for (String child : children) copyAsset(path + "/" + child, new File(target, child));
    } else {
      LibraryStore.copyVerified(
          getInstrumentation().getContext().getAssets().open(path), target, null);
    }
  }

  public void testDesktopAndroidBackupRoundTrip() throws Exception {
    File root =
        new File(
            getInstrumentation().getTargetContext().getCacheDir(), "interop-" + UUID.randomUUID());
    copyAsset("desktop-backup", root);
    LibraryStore.verifyCatalog(new File(root, "catalog.sqlite"));
    LibraryStore store = new LibraryStore(root);
    try {
      assertEquals(2, store.items().size());
      JSONObject note = null;
      for (JSONObject item : store.items()) {
        if (item.getString("kind").equals("note")) note = item;
        else
          assertEquals(
              item.getString("hash"), LibraryStore.digest(store.blob(item.getString("hash"))));
      }
      assertNotNull(note);
      store.edit(
          note.getString("id"),
          note.getInt("revision"),
          note.getString("title"),
          note.getString("description"),
          "# Edited on Android",
          note.getJSONArray("tags"),
          note.getJSONArray("collections"),
          false,
          false);
      store.note("Android note", "# From phone");
      File backup =
          new File(getInstrumentation().getTargetContext().getFilesDir(), "interop-backup");
      LibraryStore.deleteTree(backup);
      store.snapshot(backup);
    } finally {
      store.close();
      LibraryStore.deleteTree(root);
    }
  }

  public void testNativeScreenOpensOffline() throws Exception {
    android.content.Intent intent =
        new android.content.Intent(getInstrumentation().getTargetContext(), MainActivity.class)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
    android.app.Activity activity = getInstrumentation().startActivitySync(intent);
    getInstrumentation().waitForIdleSync();
    assertNotNull(activity.findViewById(android.R.id.content));
    assertNull(((AtlasApp) activity.getApplication()).startupError);
    getInstrumentation().runOnMainSync(activity::finish);
  }

  public void testPersistenceConflictAndDesktopCompatibleBackup() throws Exception {
    File root =
        new File(
            getInstrumentation().getTargetContext().getCacheDir(), "test-" + UUID.randomUUID());
    LibraryStore store = new LibraryStore(root);
    File backup = new File(root.getParentFile(), "backup-" + UUID.randomUUID());
    try {
      JSONObject note = store.note("Design note", "# Saved offline");
      String id = note.getString("id");
      store.edit(
          id,
          1,
          "Updated note",
          "Description",
          "# Edited",
          new JSONArray().put("work"),
          new JSONArray(),
          true,
          false);
      try {
        store.edit(id, 1, "Stale", "", "lost", new JSONArray(), new JSONArray(), false, false);
        fail("Stale revision must fail");
      } catch (IOException expected) {
      }
      byte[] bytes = "original bytes".getBytes(StandardCharsets.UTF_8);
      JSONObject asset =
          store.importFile(new ByteArrayInputStream(bytes), "reference.txt", "text/plain");
      store.importFile(new ByteArrayInputStream(bytes), "duplicate.txt", "text/plain");
      assertEquals(1, new File(root, "blobs").list().length);
      store.snapshot(backup);
      LibraryStore.verifyCatalog(new File(backup, "catalog.sqlite"));
      store.close();
      store = new LibraryStore(root);
      assertEquals("Updated note", store.get(id).getString("title"));
      LibraryStore restored = new LibraryStore(backup);
      try {
        assertEquals(3, restored.items().size());
        assertEquals(
            asset.getString("hash"), LibraryStore.digest(restored.blob(asset.getString("hash"))));
        assertEquals(2, restored.get(id).getInt("revision"));
      } finally {
        restored.close();
      }
    } finally {
      store.close();
      LibraryStore.deleteTree(root);
      LibraryStore.deleteTree(backup);
    }
  }

  public void testAcceptedShareSurvivesReopenWithTagsAndNestedFolder() throws Exception {
    File root = new File(getInstrumentation().getTargetContext().getCacheDir(), "shares-" + UUID.randomUUID());
    LibraryStore store = new LibraryStore(root);
    try {
      String parent = store.collection("Research").getString("id");
      String folder = store.collection("Links", parent).getString("id");
      ShareInbox.prepare(getInstrumentation().getTargetContext().getContentResolver(), store,
          java.util.Collections.emptyList(), "https://example.org/reference", "Reference",
          "https://example.org/reference", new JSONArray().put("design"), folder);
      assertEquals(1, ShareInbox.pending(store));
      store.close();
      store = new LibraryStore(root);
      assertEquals(1, ShareInbox.flush(store).saved());
      assertEquals(0, ShareInbox.flush(store).saved());
      JSONObject captured = store.items().get(0);
      assertEquals(folder, captured.getJSONArray("collections").getString(0));
      assertEquals("design", captured.getJSONArray("tags").getString(0));
      assertEquals("https://example.org/reference", captured.getString("sourceUrl"));
      assertEquals(1, store.history(captured.getString("id")).size());
    } finally {
      store.close();
      LibraryStore.deleteTree(root);
    }
  }

  public void testMobileModelReturnsReviewableDraftWithoutEditingNote() throws Exception {
    File root = new File(getInstrumentation().getTargetContext().getCacheDir(), "mobile-model-" + UUID.randomUUID());
    LibraryStore store = new LibraryStore(root);
    java.util.concurrent.ExecutorService network = java.util.concurrent.Executors.newSingleThreadExecutor();
    try (java.net.ServerSocket server = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
      server.setSoTimeout(8000);
      java.util.concurrent.Future<?> request = network.submit(() -> {
        try (java.net.Socket socket = server.accept()) {
          socket.setSoTimeout(8000);
          BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
          String method = input.readLine();
          assertTrue(method.startsWith("POST /api/chat "));
          String header;
          int length = 0;
          while ((header = input.readLine()) != null && !header.isEmpty())
            if (header.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:"))
              length = Integer.parseInt(header.substring(header.indexOf(':') + 1).trim());
          char[] body = new char[length];
          int position = 0;
          while (position < length) {
            int read = input.read(body, position, length - position);
            if (read == -1) break;
            position += read;
          }
          assertTrue(new String(body).contains("Keep this note"));
          byte[] response = new JSONObject().put("message", new JSONObject().put("content",
              new JSONObject().put("draft", "Reviewed summary").toString())).toString().getBytes(StandardCharsets.UTF_8);
          OutputStream output = socket.getOutputStream();
          output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + response.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
          output.write(response);
          output.flush();
        }
        return null;
      });
      JSONObject note = store.note("Fixture", "Keep this note");
      MobileModel.Proposal result = MobileModel.generate(store, note, "http://127.0.0.1:" + server.getLocalPort(),
          "test-model", "", "Summarize");
      request.get(2, java.util.concurrent.TimeUnit.SECONDS);
      assertEquals("Reviewed summary", result.draft());
      assertEquals("Keep this note", store.get(note.getString("id")).getString("body"));
      assertEquals(1, store.history(note.getString("id")).size());
    } finally {
      network.shutdownNow();
      store.close();
      LibraryStore.deleteTree(root);
    }
  }

  public void testAndroidFolderUndoKeepsFileAndNestedMembership() throws Exception {
    File root = new File(getInstrumentation().getTargetContext().getCacheDir(), "folders-" + UUID.randomUUID());
    LibraryStore store = new LibraryStore(root);
    try {
      String parent = store.collection("Projects").getString("id");
      String child = store.collection("Design", parent).getString("id");
      JSONObject note = store.captureNote(UUID.randomUUID().toString(), "Reference", "Notes", "", new JSONArray(), child);
      String ticket = store.removeFolder(store.previewRemoval(parent));
      assertEquals(0, store.collections().size());
      assertEquals(0, store.get(note.getString("id")).getJSONArray("collections").length());
      assertEquals(parent, store.restoreFolder(ticket));
      assertEquals(child, store.get(note.getString("id")).getJSONArray("collections").getString(0));
    } finally {
      store.close();
      LibraryStore.deleteTree(root);
    }
  }

  public void testInvalidHashAndFailedCopyDoNotCreateRecords() throws Exception {
    File root =
        new File(
            getInstrumentation().getTargetContext().getCacheDir(), "test-" + UUID.randomUUID());
    LibraryStore store = new LibraryStore(root);
    try {
      try {
        store.blob("../../outside");
        fail("Traversal must fail");
      } catch (IOException expected) {
      }
      try {
        store.importFile(
            new InputStream() {
              public int read() throws IOException {
                throw new IOException("source disconnected");
              }
            },
            "broken.png",
            "image/png");
        fail("Interrupted input must fail");
      } catch (IOException expected) {
      }
      assertEquals(0, store.items().size());
      assertEquals(0, new File(root, "staging").list().length);
    } finally {
      store.close();
      LibraryStore.deleteTree(root);
    }
  }
}
