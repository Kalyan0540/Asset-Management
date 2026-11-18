package cool.atlas.library;

import android.app.Application;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class AtlasApp extends Application {
  public final ExecutorService worker = Executors.newSingleThreadExecutor();
  public LibraryStore store;
  public volatile boolean busy = false;
  public String startupError;
  public java.lang.ref.WeakReference<MainActivity> active;

  @Override
  public void onCreate() {
    super.onCreate();
    try {
      store =
          new LibraryStore(
              new File(
                  getFilesDir(), getSharedPreferences("atlas", 0).getString("library", "Library")));
    } catch (Exception e) {
      startupError = e.getMessage();
    }
  }

  public synchronized void useLibrary(File directory) throws Exception {
    LibraryStore next = new LibraryStore(directory);
    if (!getSharedPreferences("atlas", 0)
        .edit()
        .putString("library", directory.getName())
        .commit()) {
      next.close();
      throw new java.io.IOException("Could not save library location");
    }
    LibraryStore previous = store;
    store = next;
    if (previous != null) previous.close();
  }
}
