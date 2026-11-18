package cool.atlas.library;

import android.app.*;
import android.content.*;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.*;
import android.util.LruCache;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.util.*;
import org.json.*;

public final class MainActivity extends Activity {
  private AtlasApp app;
  private LinearLayout root, actions;
  private TextView status;
  private EditText search;
  private Spinner filter;
  private GridView grid;
  private String selectedFilter = "all", selectedType = "", sortOrder = "Newest";
  private boolean listView;
  private Runnable flushEditor;
  private final Handler editorHandler = new Handler(Looper.getMainLooper());
  private static final List<String> SCOPES = Arrays.asList("all", "notes", "favorites", "uncategorized", "untagged", "trash");
  private final List<String> filterIds = new ArrayList<>();
  private List<JSONObject> visible = new ArrayList<>();
  private final LruCache<String, Bitmap> thumbnails =
      new LruCache<String, Bitmap>(16 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap value) {
          return value.getByteCount();
        }
      };
  private static final int IMPORT = 10, EXPORT_BACKUP = 11, RESTORE_BACKUP = 12, PHOTO = 13, EXPORT_ITEM = 14, NOTE_IMAGES = 15;
  private EditText noteImagesTarget;
  private JSONArray noteImageTags;
  private JSONObject exporting;
  private final int background = Color.rgb(22, 23, 25),
      panel = Color.rgb(39, 40, 45),
      muted = Color.rgb(162, 166, 178),
      gold = Color.rgb(216, 180, 130);

  @Override
  public void onCreate(Bundle saved) {
    super.onCreate(saved);
    app = (AtlasApp) getApplication();
    if (app.startupError != null) {
      new AlertDialog.Builder(this)
          .setTitle("Library could not open")
          .setMessage(app.startupError)
          .setPositiveButton("Close", (d, w) -> finish())
          .setCancelable(false)
          .show();
      return;
    }
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(background);
    root.setPadding(dp(16), dp(12), dp(16), dp(8));
    setContentView(root);
    root.setOnApplyWindowInsetsListener(
        (view, insets) -> {
          root.setPadding(
              dp(16),
              dp(12) + insets.getSystemWindowInsetTop(),
              dp(16),
              dp(8) + insets.getSystemWindowInsetBottom());
          return insets;
        });
    LinearLayout heading = row();
    TextView title = label("atlas.", 28, Color.WHITE);
    heading.addView(title, new LinearLayout.LayoutParams(0, dp(54), 1));
    Button menu = button("Library", this::libraryMenu);
    heading.addView(menu);
    root.addView(heading);
    status = label("Personal library · Stored on this phone", 12, muted);
    root.addView(status);
    search = new EditText(this);
    search.setSingleLine(true);
    search.setTextSize(15);
    search.setHint("Search titles, tags and notes");
    search.setContentDescription("Search library");
    root.addView(search, new LinearLayout.LayoutParams(-1, dp(54)));
    search.addTextChangedListener(
        new TextWatcher() {
          public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

          public void onTextChanged(CharSequence s, int start, int before, int count) {
            refreshItems();
          }

          public void afterTextChanged(Editable e) {}
        });
    actions = row();
    actions.addView(
        button("Import files", () -> pickFiles()), new LinearLayout.LayoutParams(0, dp(52), 1));
    actions.addView(button("New note", this::newNote), new LinearLayout.LayoutParams(0, dp(52), 1));
    root.addView(actions);
    LinearLayout browse = row();
    Button display = button("List", () -> {
      listView = !listView;
      ((Button) browse.getChildAt(0)).setText(listView ? "Grid" : "List");
      grid.setNumColumns(listView ? 1 : GridView.AUTO_FIT);
      refreshItems();
    });
    browse.addView(display, new LinearLayout.LayoutParams(0, dp(48), 1));
    browse.addView(button("Filters", this::filterMenu), new LinearLayout.LayoutParams(0, dp(48), 1));
    browse.addView(button("Photos", this::pickPhotos), new LinearLayout.LayoutParams(0, dp(48), 1));
    root.addView(browse);
    filter = new Spinner(this);
    filter.setContentDescription("Filter collection");
    root.addView(filter, new LinearLayout.LayoutParams(-1, dp(48)));
    filter.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View v, int n, long id) {
            if (n < filterIds.size()) {
              selectedFilter = filterIds.get(n);
              refreshItems();
            }
          }
        });
    grid = new GridView(this);
    grid.setNumColumns(GridView.AUTO_FIT);
    grid.setColumnWidth(dp(156));
    grid.setHorizontalSpacing(dp(10));
    grid.setVerticalSpacing(dp(10));
    grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);
    grid.setContentDescription("Library items");
    root.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1));
    grid.setOnItemClickListener(
        (p, v, n, id) -> {
          if (app.busy) return;
          JSONObject item = visible.get(n);
          if (item.optString("kind").equals("folder")) { selectedFilter = item.optString("id"); refresh(); }
          else details(item);
        });
    if (saved != null) {
      search.setText(saved.getString("query", ""));
      selectedFilter = saved.getString("filter", "all");
    }
    refresh();
    if (saved == null) {
      if (ShareInbox.pending(app.store) > 0) finishCaptures();
      receive(getIntent());
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (root != null) {
      app.active = new java.lang.ref.WeakReference<>(this);
      refresh();
    }
  }

  @Override
  protected void onStop() {
    if (flushEditor != null) flushEditor.run();
    super.onStop();
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    super.onSaveInstanceState(state);
    if (search != null) {
      state.putString("query", search.getText().toString());
      state.putString("filter", selectedFilter);
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    receive(intent);
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private LinearLayout row() {
    LinearLayout view = new LinearLayout(this);
    view.setOrientation(LinearLayout.HORIZONTAL);
    view.setGravity(Gravity.CENTER_VERTICAL);
    return view;
  }

  private TextView label(String text, int size, int color) {
    TextView v = new TextView(this);
    v.setText(text);
    v.setTextSize(size);
    v.setTextColor(color);
    v.setGravity(Gravity.CENTER_VERTICAL);
    return v;
  }

  private Button button(String title, Runnable click) {
    Button b = new Button(this);
    b.setText(title);
    b.setTextColor(gold);
    b.setAllCaps(false);
    b.setOnClickListener(v -> click.run());
    return b;
  }

  private EditText field(String hint, String value, boolean multiline) {
    EditText v = new EditText(this);
    v.setHint(hint);
    v.setContentDescription(hint);
    v.setText(value);
    v.setTextSize(15);
    v.setSingleLine(!multiline);
    if (multiline) {
      v.setMinLines(3);
      v.setGravity(Gravity.TOP);
    }
    return v;
  }

  private void error(Exception error) {
    new AlertDialog.Builder(this)
        .setTitle("Atlas could not complete this step")
        .setMessage(error.getMessage())
        .setPositiveButton("OK", null)
        .show();
  }

  private void message(String text) {
    new AlertDialog.Builder(this)
        .setTitle("Atlas")
        .setMessage(text)
        .setPositiveButton("OK", null)
        .show();
  }

  private void refresh() {
    if (grid == null) return;
    try {
      filterIds.clear();
      filterIds.addAll(SCOPES);
      List<String> labels = new ArrayList<>(Arrays.asList("All items", "Notes", "Favorites", "Uncategorized", "Untagged", "Trash"));
      for (JSONObject c : app.store.collections()) {
        filterIds.add(c.getString("id"));
        labels.add(c.getString("name"));
      }
      for (JSONObject saved : app.store.smartFolders()) {
        filterIds.add("smart:" + saved.getString("id"));
        labels.add("Smart · " + saved.getString("name"));
      }
      filter.setAdapter(
          new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
      int n = filterIds.indexOf(selectedFilter);
      filter.setSelection(Math.max(0, n));
      for (int i = 0; i < actions.getChildCount(); i++) actions.getChildAt(i).setEnabled(!app.busy);
      status.setText(
          app.busy
              ? "Working… Keep Atlas open until complete."
              : "Personal library · Stored on this phone");
      refreshItems();
    } catch (Exception e) {
      error(e);
    }
  }

  private void refreshItems() {
    if (grid == null || app.busy) return;
    try {
      String q = search.getText().toString().toLowerCase(Locale.ROOT);
      List<JSONObject> found = new ArrayList<>();
      JSONObject smartFolder = null;
      if (selectedFilter.startsWith("smart:"))
        for (JSONObject candidate : app.store.smartFolders())
          if (candidate.getString("id").equals(selectedFilter.substring(6))) smartFolder = candidate;
      if (!SCOPES.contains(selectedFilter) && smartFolder == null && q.isEmpty() && selectedType.isEmpty()) {
        for (JSONObject folder : app.store.collections())
          if (selectedFilter.equals(folder.optString("parentId", "")))
            found.add(folder.put("kind", "folder"));
      }
      List<JSONObject> matches = new ArrayList<>();
      for (JSONObject item : app.store.items()) {
        if (item.optBoolean("trashed") != selectedFilter.equals("trash")) continue;
        if (selectedFilter.equals("notes") && !item.optString("kind").equals("note")) continue;
        if (selectedFilter.equals("favorites") && !item.optBoolean("favorite")) continue;
        if (selectedFilter.equals("uncategorized") && item.getJSONArray("collections").length() > 0) continue;
        if (selectedFilter.equals("untagged") && item.getJSONArray("tags").length() > 0) continue;
        if (!selectedType.isEmpty() && !selectedType.equals(type(item))) continue;
        if (smartFolder != null && !app.store.matchesSmartFolder(item, smartFolder)) continue;
        if (smartFolder == null && !SCOPES.contains(selectedFilter)
            && !contains(item.optJSONArray("collections"), selectedFilter)) continue;
        String hay =
            item.optString("title")
                + " "
                + item.optString("description")
                + " "
                + item.optString("body")
                + " "
                + item.optJSONArray("tags");
        if (hay.toLowerCase(Locale.ROOT).contains(q)) matches.add(item);
      }
      if (sortOrder.equals("Name")) matches.sort(Comparator.comparing(item -> item.optString("title"), String.CASE_INSENSITIVE_ORDER));
      else if (sortOrder.equals("Largest")) matches.sort(Comparator.comparingLong((JSONObject item) -> item.optLong("size")).reversed());
      else matches.sort(Comparator.comparing((JSONObject item) -> item.optString("createdAt")).reversed());
      found.addAll(matches);
      visible = found;
      grid.setAdapter(new Cards());
      status.setText(
          found.size()
              + " items · Stored on this phone"
              + (found.isEmpty() ? " · Import files or create a note" : ""));
    } catch (Exception e) {
      error(e);
    }
  }

  private boolean contains(JSONArray values, String value) {
    if (values != null)
      for (int i = 0; i < values.length(); i++) if (value.equals(values.optString(i))) return true;
    return false;
  }

  interface Work {
    String run() throws Exception;
  }

  private void work(Work task) {
    if (app.busy) {
      message("Wait for the current import or backup to finish.");
      return;
    }
    app.busy = true;
    refresh();
    app.worker.execute(
        () -> {
          String result = null;
          Exception problem = null;
          try {
            result = task.run();
          } catch (Exception e) {
            problem = e;
          } finally {
            app.busy = false;
          }
          MainActivity current = app.active == null ? null : app.active.get();
          if (current != null) {
            final String done = result;
            final Exception failed = problem;
            current.runOnUiThread(
                () -> {
                  if (current.isFinishing() || current.isDestroyed()) return;
                  current.refresh();
                  if (failed != null) current.error(failed);
                  else if (done != null) current.message(done);
                });
          }
        });
  }

  private String type(JSONObject item) {
    if (item.optString("kind").equals("note")) return "md";
    String name = item.optString("filename");
    int dot = name.lastIndexOf('.');
    return dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "file";
  }

  private void filterMenu() {
    LinearLayout controls = new LinearLayout(this);
    controls.setOrientation(LinearLayout.VERTICAL);
    controls.setPadding(dp(16), 0, dp(16), 0);
    try {
      TreeSet<String> types = new TreeSet<>();
      for (JSONObject item : app.store.items()) if (!item.optBoolean("trashed")) types.add(type(item));
      List<String> names = new ArrayList<>();
      names.add("All types");
      names.addAll(types);
      String[] orders = {"Newest", "Name", "Largest"};
      Spinner fileTypes = new Spinner(this);
      fileTypes.setContentDescription("File type");
      fileTypes.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, names));
      fileTypes.setSelection(Math.max(0, names.indexOf(selectedType)));
      Spinner sorting = new Spinner(this);
      sorting.setContentDescription("Sort items");
      sorting.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, orders));
      sorting.setSelection(Arrays.asList(orders).indexOf(sortOrder));
      controls.addView(fileTypes);
      controls.addView(sorting);
      new AlertDialog.Builder(this).setTitle("Filters and sorting").setView(controls).setNegativeButton("Cancel", null)
          .setPositiveButton("Apply", (dialog, which) -> {
            selectedType = fileTypes.getSelectedItemPosition() == 0 ? "" : (String) fileTypes.getSelectedItem();
            sortOrder = (String) sorting.getSelectedItem();
            refreshItems();
          }).show();
    } catch (Exception failed) { error(failed); }
  }

  private void pickPhotos() {
    if (android.os.Build.VERSION.SDK_INT >= 33) {
      Intent photo = new Intent(android.provider.MediaStore.ACTION_PICK_IMAGES)
          .setType("image/*").putExtra(android.provider.MediaStore.EXTRA_PICK_IMAGES_MAX, 20);
      try { startActivityForResult(photo, PHOTO); return; }
      catch (ActivityNotFoundException ignored) { }
    }
    startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*")
        .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true), PHOTO);
  }

  private void pickFiles() {
    Intent intent =
        new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .setType("*/*")
            .addCategory(Intent.CATEGORY_OPENABLE)
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
    startActivityForResult(intent, IMPORT);
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (result != RESULT_OK || data == null) return;
    if (request == NOTE_IMAGES && noteImagesTarget != null) {
      final EditText target = noteImagesTarget;
      final JSONArray tags = noteImageTags;
      noteImagesTarget = null;
      noteImageTags = null;
      List<Uri> images = uris(data);
      work(() -> {
        StringBuilder embeds = new StringBuilder();
        List<String> skipped = new ArrayList<>();
        for (Uri uri : images) {
          try {
            String mime = getContentResolver().getType(uri);
            if (mime == null || !mime.startsWith("image/")) continue;
            String name = "Embedded image";
            try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
              if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) name = cursor.getString(0);
            }
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) throw new IOException("Image unavailable");
            JSONObject asset = app.store.captureFile(UUID.randomUUID().toString(), in, name, mime, "", tags, "");
            embeds.append("\n\n![").append(asset.getString("title").replace("]", ""))
                .append("](atlas:").append(asset.getString("id")).append(")\n");
          } catch (Exception failed) { skipped.add(failed.getMessage()); }
        }
        if (embeds.length() > 0) runOnUiThread(() -> {
          if (!target.isAttachedToWindow()) return;
          int position = Math.max(0, target.getSelectionEnd());
          target.getText().insert(position, embeds.toString());
        });
        return skipped.isEmpty() ? null : "Some images could not be added: " + String.join(", ", skipped);
      });
    } else if (request == PHOTO) {
      reviewShare(uris(data), "", "");
    } else if (request == EXPORT_ITEM && exporting != null && data.getData() != null) {
      JSONObject item = exporting;
      exporting = null;
      work(() -> {
        try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "w")) {
          if (out == null) throw new IOException("Could not open destination");
          if (item.optString("kind").equals("note"))
            out.write(item.optString("body").getBytes(java.nio.charset.StandardCharsets.UTF_8));
          else try (InputStream in = new FileInputStream(app.store.blob(item.getString("hash")))) {
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
          }
        }
        return "File exported.";
      });
    } else if (request == IMPORT) {
      List<Uri> uris = uris(data);
      for (Uri uri : uris)
        try {
          getContentResolver()
              .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
        }
      importUris(uris);
    } else if (data.getData() != null && request == EXPORT_BACKUP)
      work(
          () -> {
            new BackupTransfer(getContentResolver())
                .export(app.store, data.getData(), getCacheDir());
            return "Backup saved and verified. Keep the whole dated folder together. You can"
                       + " restore it in Atlas on your computer.";
          });
    else if (data.getData() != null && request == RESTORE_BACKUP)
      work(
          () -> {
            File restored =
                new BackupTransfer(getContentResolver()).restore(data.getData(), getFilesDir());
            app.useLibrary(restored);
            selectedFilter = "all";
            return "Backup restored into a new local library. Your previous library remains on this"
                       + " phone.";
          });
  }

  private List<Uri> uris(Intent intent) {
    List<Uri> list = new ArrayList<>();
    if (intent.getClipData() != null) {
      for (int i = 0; i < intent.getClipData().getItemCount(); i++) {
        Uri uri = intent.getClipData().getItemAt(i).getUri();
        if (uri != null && !list.contains(uri)) list.add(uri);
      }
    } else if (intent.getData() != null) list.add(intent.getData());
    return list;
  }

  private void importUris(List<Uri> uris) {
    if (uris.isEmpty()) return;
    work(
        () -> {
          int imported = 0;
          List<String> errors = new ArrayList<>();
          for (Uri uri : uris) {
            String name = "Imported file";
            try {
              if (!"content".equals(uri.getScheme()))
                throw new IOException("Only shared content files are supported");
              try (Cursor c =
                  getContentResolver()
                      .query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
              }
              InputStream in = getContentResolver().openInputStream(uri);
              if (in == null) throw new IOException("Cannot read source");
              app.store.importFile(in, name, getContentResolver().getType(uri));
              imported++;
            } catch (Exception e) {
              errors.add(name + ": " + e.getMessage());
            }
          }
          return imported
              + " files imported. Originals were left unchanged."
              + (errors.isEmpty()
                  ? ""
                  : "\n\nSkipped:\n" + android.text.TextUtils.join("\n", errors));
        });
  }

  private void receive(Intent intent) {
    if (intent == null || app.store == null) return;
    String action = intent.getAction();
    if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
    List<Uri> list = new ArrayList<>();
    if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
      ArrayList<Uri> shared = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      if (shared != null) list.addAll(shared);
    } else {
      Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (uri != null) list.add(uri);
    }
    if (list.isEmpty()) list = uris(intent);
    CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
    reviewShare(list, text == null ? "" : text.toString(), Objects.toString(intent.getStringExtra(Intent.EXTRA_SUBJECT), ""));
    intent.setAction(null);
  }

  private void finishCaptures() {
    final LibraryStore library = app.store;
    work(() -> captureMessage(ShareInbox.flush(library), ""));
  }

  private String captureMessage(ShareInbox.Result result, String skipped) {
    String warnings = String.join("\n", result.failures());
    String issues = skipped.isEmpty() ? warnings : skipped + "\n" + warnings;
    return result.saved() + " items saved to Atlas." + (issues.trim().isEmpty() ? "" : "\n\n" + issues);
  }

  private JSONArray tagValues(String value) {
    LinkedHashSet<String> tags = new LinkedHashSet<>();
    for (String tag : value.split(",")) if (!tag.trim().isEmpty()) tags.add(tag.trim());
    return new JSONArray(tags);
  }

  private void reviewShare(List<Uri> candidates, String text, String subject) {
    List<Uri> files = new ArrayList<>();
    for (Uri uri : candidates) if (uri != null && "content".equals(uri.getScheme()) && !files.contains(uri)) files.add(uri);
    if (files.isEmpty() && text.trim().isEmpty()) return;
    if (files.size() > 60) { message("Share up to 60 files at once."); return; }
    String lastLine = text.trim().substring(text.trim().lastIndexOf('\n') + 1).trim();
    String link = ShareInbox.webUrl(lastLine) ? lastLine : "";
    boolean bookmark = !link.isEmpty() && text.trim().equals(link);
    String noteText = bookmark ? link : ("> " + text.replace("\n", "\n> "));
    LinearLayout contents = new LinearLayout(this);
    contents.setOrientation(LinearLayout.VERTICAL);
    contents.setPadding(dp(18), 0, dp(18), dp(12));
    String fallback = files.isEmpty() ? (bookmark ? Uri.parse(link).getHost() : "Shared excerpt") : "Shared file";
    if (files.size() == 1) {
      try (Cursor cursor = getContentResolver().query(files.get(0), new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
        if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) fallback = cursor.getString(0);
      } catch (Exception ignored) { }
    }
    String caption = subject.trim().isEmpty() || !files.isEmpty() ? fallback : subject.trim();
    EditText title = field("Title", caption.substring(0, Math.min(caption.length(), 250)), false);
    EditText source = field("Source URL", link, false);
    EditText tags = field("Tags (comma separated)", getPreferences(0).getString("captureTags", ""), false);
    if (files.size() == 1) {
      Uri uri = files.get(0);
      ImageView image = new ImageView(this);
      image.setScaleType(ImageView.ScaleType.FIT_CENTER);
      app.worker.execute(() -> {
        try {
          BitmapFactory.Options size = new BitmapFactory.Options();
          size.inJustDecodeBounds = true;
          try (InputStream input = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(input, null, size); }
          if (size.outWidth < 1 || size.outHeight < 1) return;
          size.inJustDecodeBounds = false;
          size.inSampleSize = 1;
          while (Math.max(size.outWidth, size.outHeight) / size.inSampleSize > 640) size.inSampleSize *= 2;
          try (InputStream input = getContentResolver().openInputStream(uri)) {
            Bitmap thumbnail = BitmapFactory.decodeStream(input, null, size);
            if (thumbnail != null) runOnUiThread(() -> {
              image.setImageBitmap(thumbnail);
              image.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(140)));
            });
          }
        } catch (Exception ignored) { }
      });
      contents.addView(image, new LinearLayout.LayoutParams(-1, 0));
    }
    if (!files.isEmpty()) contents.addView(label(files.size() + " files", 14, muted));
    else contents.addView(label(text.substring(0, Math.min(text.length(), 260)), 14, muted));
    if (files.size() < 2) contents.addView(title);
    contents.addView(source);
    contents.addView(tags);
    try {
      List<JSONObject> folders = app.store.collections();
      List<String> labels = new ArrayList<>();
      labels.add("Uncategorized");
      for (JSONObject folder : folders) labels.add(folder.getString("name"));
      Spinner destination = new Spinner(this);
      destination.setContentDescription("Save to folder");
      destination.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
      for (int i = 0; i < folders.size(); i++)
        if (folders.get(i).optString("id").equals(getPreferences(0).getString("captureFolder", "")))
          destination.setSelection(i + 1);
      contents.addView(destination);
      ScrollView scroll = new ScrollView(this);
      scroll.addView(contents);
      AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Save to Atlas").setView(scroll)
          .setNegativeButton("Cancel", null)
          .setPositiveButton(files.isEmpty() ? (bookmark ? "Save link" : "Save note") : "Save files", null).create();
      dialog.setOnShowListener(ignored -> dialog.getButton(-1).setOnClickListener(view -> {
        if (app.busy) { message("Wait for the current operation to finish, then save."); return; }
        String name = title.getText().toString().trim(), url = source.getText().toString().trim(), tagText = tags.getText().toString();
        if (name.isEmpty() || name.length() > 250) { title.setError("Use 1–250 characters"); return; }
        if (!url.isEmpty() && !ShareInbox.webUrl(url)) { source.setError("Enter a valid website address"); return; }
        int choice = destination.getSelectedItemPosition();
        String folder = choice <= 0 ? "" : folders.get(choice - 1).optString("id");
        LibraryStore library = app.store;
        getPreferences(0).edit().putString("captureTags", tagText).putString("captureFolder", folder).apply();
        dialog.dismiss();
        work(() -> {
          String skipped = ShareInbox.prepare(getContentResolver(), library, files, noteText, name, url, tagValues(tagText), folder);
          return captureMessage(ShareInbox.flush(library), skipped);
        });
      }));
      dialog.show();
    } catch (Exception failed) { error(failed); }
  }

  private void newNote() {
    LinearLayout fields = new LinearLayout(this);
    fields.setOrientation(LinearLayout.VERTICAL);
    fields.setPadding(dp(16), 0, dp(16), 0);
    EditText title = field("Title", "", false), body = field("Markdown note", "", true);
    fields.addView(title);
    fields.addView(body);
    AlertDialog dialog =
        new AlertDialog.Builder(this)
            .setTitle("New note")
            .setView(fields)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create", null)
            .create();
    dialog.setOnShowListener(
        d ->
            dialog
                .getButton(-1)
                .setOnClickListener(
                    v -> {
                      try {
                        app.store.note(title.getText().toString(), body.getText().toString());
                        dialog.dismiss();
                        refresh();
                      } catch (Exception e) {
                        error(e);
                      }
                    }));
    dialog.show();
  }

  private void libraryMenu() {
    if (app.busy) {
      message("Keep Atlas open while the current operation finishes.");
      return;
    }
    String[] options = {
      "New collection",
      "Back up library",
      "Restore Atlas backup",
      "Libraries on this phone",
      "About this preview", "Retry pending captures", "New subfolder", "New Smart Folder"
    };
    new AlertDialog.Builder(this)
        .setTitle("Library")
        .setItems(
            options,
            (d, n) -> {
              if (n == 0) {
                EditText name = field("Collection name", "", false);
                AlertDialog create =
                    new AlertDialog.Builder(this)
                        .setTitle("New collection")
                        .setView(name)
                        .setNegativeButton("Cancel", null)
                        .setPositiveButton("Create", null)
                        .create();
                create.setOnShowListener(
                    x ->
                        create
                            .getButton(-1)
                            .setOnClickListener(
                                v -> {
                                  try {
                                    app.store.collection(name.getText().toString());
                                    create.dismiss();
                                    refresh();
                                  } catch (Exception e) {
                                    error(e);
                                  }
                                }));
                create.show();
              }
              if (n == 1)
                startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), EXPORT_BACKUP);
              if (n == 2)
                new AlertDialog.Builder(this)
                    .setTitle("Restore a backup")
                    .setMessage(
                        "Choose the complete dated Atlas backup folder. Atlas verifies originals"
                            + " and opens a separate library. This is a manual transfer, not"
                            + " synchronization.")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton(
                        "Choose folder",
                        (x, w) ->
                            startActivityForResult(
                                new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), RESTORE_BACKUP))
                    .show();
              if (n == 3) {
                File[] folders =
                    getFilesDir()
                        .listFiles(f -> f.isDirectory() && new File(f, "catalog.sqlite").isFile());
                if (folders == null) return;
                String[] names = new String[folders.length];
                for (int i = 0; i < folders.length; i++)
                  names[i] =
                      folders[i].getName()
                          + (folders[i].equals(app.store.root) ? " (current)" : "");
                new AlertDialog.Builder(this)
                    .setTitle("Local libraries")
                    .setItems(
                        names,
                        (x, w) ->
                            work(
                                () -> {
                                  app.useLibrary(folders[w]);
                                  return "Library opened.";
                                }))
                    .show();
              }
              if (n == 5) { if (ShareInbox.pending(app.store) == 0) message("No pending captures."); else finishCaptures(); }
              if (n == 6) newSubfolder();
              if (n == 7) newSmartFolder();
              if (n == 4)
                message(
                    "Atlas Android 0.4 preview\n\n"
                        + "An offline library for files, notes, tags and folders. Share images, links and text into Atlas"
                        + " or transfer a verified backup between Android and desktop.");
            })
        .show();
  }

  private void newSmartFolder() {
    LinearLayout options = new LinearLayout(this);
    options.setOrientation(LinearLayout.VERTICAL);
    options.setPadding(dp(16),0,dp(16),0);
    EditText name = field("Name", "", false);
    EditText value = field("Match text", "", false);
    String[] fields = {"Name", "Tag", "File type"};
    String[] keys = {"name", "tag", "type"};
    Spinner fieldChoice = new Spinner(this);
    fieldChoice.setContentDescription("Filter field");
    fieldChoice.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, fields));
    options.addView(name);
    options.addView(fieldChoice);
    options.addView(value);
    AlertDialog dialog = new AlertDialog.Builder(this).setTitle("New Smart Folder").setView(options)
        .setNegativeButton("Cancel",null).setPositiveButton("Create",null).create();
    dialog.setOnShowListener(ignored -> dialog.getButton(-1).setOnClickListener(view -> {
      try {
        selectedFilter = "smart:" + app.store.saveSmartFolder(name.getText().toString(),
            keys[fieldChoice.getSelectedItemPosition()], value.getText().toString());
        dialog.dismiss();
        refresh();
      } catch (Exception failed) { value.setError(failed.getMessage()); }
    }));
    dialog.show();
  }

  private void newSubfolder() {
    if (SCOPES.contains(selectedFilter) || selectedFilter.startsWith("smart:")) { message("Open the parent folder first."); return; }
    EditText name = field("Folder name", "", false);
    new AlertDialog.Builder(this).setTitle("New subfolder").setView(name).setNegativeButton("Cancel", null)
        .setPositiveButton("Create", (dialog, which) -> {
          try { app.store.collection(name.getText().toString(), selectedFilter); refresh(); }
          catch (Exception failed) { error(failed); }
        }).show();
  }

  private void details(JSONObject original) {
    try {
      JSONObject item = app.store.get(original.getString("id"));
      LinearLayout fields = new LinearLayout(this);
      fields.setOrientation(LinearLayout.VERTICAL);
      fields.setPadding(dp(18), dp(8), dp(18), dp(12));
      if (item.getString("kind").equals("asset")) {
        if (item.getString("mime").startsWith("image/")) {
          ImageView image = new ImageView(this);
          image.setAdjustViewBounds(true);
          image.setScaleType(ImageView.ScaleType.FIT_CENTER);
          fields.addView(image, new LinearLayout.LayoutParams(-1, dp(240)));
          loadImage(item, image, 1024);
        }
        fields.addView(button("Open original in another app", () -> openOriginal(item)));
      }
      EditText title = field("Title", item.getString("title"), false),
          description = field("Description", item.getString("description"), true),
          tags = field("Tags (comma separated)", join(item.getJSONArray("tags")), false),
          body = field("Markdown note", item.optString("body"), true);
      fields.addView(title);
      fields.addView(description);
      EditText source = field("Source link", item.optString("sourceUrl"), false);
      fields.addView(source);
      fields.addView(tags);
      RatingBar rating = new RatingBar(this, null, android.R.attr.ratingBarStyleSmall);
      rating.setNumStars(5);
      rating.setStepSize(1);
      rating.setRating(item.optInt("rating"));
      rating.setIsIndicator(false);
      rating.setContentDescription("Rating");
      fields.addView(rating, new LinearLayout.LayoutParams(-2, dp(48)));
      if (item.getString("kind").equals("note")) {
        fields.addView(body);
        LinearLayout documentActions = row();
        documentActions.addView(button("Link an item", () -> linkItem(body, item)), new LinearLayout.LayoutParams(0, dp(48), 1));
        documentActions.addView(button("Read note", () -> readNote(item, body.getText().toString())), new LinearLayout.LayoutParams(0, dp(48), 1));
        fields.addView(documentActions);
        fields.addView(button("Add images to note", () -> {
          noteImagesTarget = body;
          noteImageTags = tagValues(tags.getText().toString());
          startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*")
              .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true), NOTE_IMAGES);
        }));
      }
      CheckBox favorite = new CheckBox(this);
      favorite.setText("Favorite");
      favorite.setChecked(item.optBoolean("favorite"));
      fields.addView(favorite);
      CheckBox trash = new CheckBox(this);
      trash.setText("Move to Trash");
      trash.setChecked(item.optBoolean("trashed"));
      fields.addView(trash);
      fields.addView(label("Collections", 14, muted));
      List<JSONObject> collections = app.store.collections();
      List<CheckBox> checks = new ArrayList<>();
      for (JSONObject c : collections) {
        CheckBox check = new CheckBox(this);
        check.setText(c.getString("name"));
        check.setChecked(contains(item.optJSONArray("collections"), c.getString("id")));
        checks.add(check);
        fields.addView(check);
      }
      if (item.has("source"))
        fields.addView(label("Imported source metadata is preserved in backups.", 12, muted));
      ScrollView scroll = new ScrollView(this);
      scroll.addView(fields);
      TextView saveState = label("", 12, muted);
      fields.addView(saveState);
      final JSONObject[] saved = {item};
      final boolean[] persisted = {true}, conflict = {false};
      String draftKey = app.store.root.getName() + ":" + item.getString("id");
      android.content.SharedPreferences drafts = getSharedPreferences("item-drafts", MODE_PRIVATE);
      String pending = drafts.getString(draftKey, "");
      if (!pending.isEmpty()) {
        JSONObject draft = new JSONObject(pending);
        conflict[0] = draft.optInt("revision") != item.getInt("revision");
        if (!conflict[0]) {
          title.setText(draft.optString("title"));
          description.setText(draft.optString("description"));
          body.setText(draft.optString("body"));
          tags.setText(draft.optString("tagText"));
          source.setText(draft.optString("sourceUrl"));
          rating.setRating(draft.optInt("rating"));
          favorite.setChecked(draft.optBoolean("favorite"));
          trash.setChecked(draft.optBoolean("trashed"));
          for (int i=0; i<checks.size(); i++)
            checks.get(i).setChecked(contains(draft.optJSONArray("collections"), collections.get(i).getString("id")));
          saveState.setText("Recovered an unsaved draft");
        } else {
          saveState.setText("A draft conflicts with another edit");
          fields.addView(button("Review conflicting draft", () -> new AlertDialog.Builder(this)
              .setTitle("Unsaved draft").setMessage(draft.optString("title") + "\n\n" + draft.optString("body"))
              .setNeutralButton("Copy draft text", (dialog, which) -> ((android.content.ClipboardManager)
                  getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Atlas draft", draft.optString("body"))))
              .setNegativeButton("Keep draft", null)
              .setPositiveButton("Use saved version", (dialog, which) -> {
                drafts.edit().remove(draftKey).apply();
                conflict[0] = false;
                saveState.setText("Saved version retained");
              }).show()));
        }
      }
      class Changes {
        JSONObject snapshot() throws JSONException {
          JSONArray chosen = new JSONArray();
          for (int i = 0; i < checks.size(); i++)
            if (checks.get(i).isChecked()) chosen.put(collections.get(i).getString("id"));
          return new JSONObject().put("title", title.getText().toString())
              .put("description", description.getText().toString()).put("body", body.getText().toString())
              .put("tagText", tags.getText().toString()).put("collections", chosen)
              .put("favorite", favorite.isChecked()).put("trashed", trash.isChecked())
              .put("sourceUrl", source.getText().toString().trim())
              .put("rating", (int) rating.getRating()).put("revision", saved[0].getInt("revision"));
        }
        void save() {
          if (conflict[0]) return;
          try {
            JSONObject draft = snapshot(), previous = saved[0];
            JSONArray nextTags = draft.getString("tagText").equals(join(previous.getJSONArray("tags")))
                ? previous.getJSONArray("tags") : tagValues(draft.getString("tagText"));
            Set<String> oldFolders = new HashSet<>(), newFolders = new HashSet<>();
            JSONArray prior = previous.getJSONArray("collections"), next = draft.getJSONArray("collections");
            for (int n=0; n<prior.length(); n++) oldFolders.add(prior.getString(n));
            for (int n=0; n<next.length(); n++) newFolders.add(next.getString(n));
            boolean changed = !oldFolders.equals(newFolders) || !nextTags.toString().equals(previous.getJSONArray("tags").toString());
            for (String key : Arrays.asList("title","description","body","sourceUrl","rating","favorite","trashed"))
              if (!draft.optString(key).equals(previous.optString(key, key.equals("rating") ? "0" : ""))) changed = true;
            if (changed) saved[0] = app.store.edit(previous.getString("id"), draft.getInt("revision"),
                draft.getString("title"), draft.getString("description"), draft.getString("body"), nextTags, next,
                draft.getBoolean("favorite"), draft.getBoolean("trashed"), draft.getString("sourceUrl"), draft.getInt("rating"));
            persisted[0] = true;
            drafts.edit().remove(draftKey).apply();
            saveState.setText(changed ? "Saved" : "");
          } catch (Exception failed) {
            persisted[0] = false;
            saveState.setText("Draft kept · " + failed.getMessage());
          }
        }
      }
      Changes changes = new Changes();
      Runnable save = changes::save;
      Runnable queue = () -> {
        if (conflict[0]) { saveState.setText("Review the conflicting draft before editing"); return; }
        try {
          drafts.edit().putString(draftKey, changes.snapshot().toString()).apply();
          saveState.setText("Saving…");
          editorHandler.removeCallbacks(save);
          editorHandler.postDelayed(save, 400);
        } catch (Exception failed) { saveState.setText(failed.getMessage()); }
      };
      TextWatcher watcher = new TextWatcher() {
        public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
        public void onTextChanged(CharSequence text, int start, int before, int count) { queue.run(); }
        public void afterTextChanged(Editable text) {}
      };
      for (EditText text : Arrays.asList(title, description, source, tags, body)) text.addTextChangedListener(watcher);
      for (CheckBox check : checks) check.setOnCheckedChangeListener((button, checked) -> queue.run());
      favorite.setOnCheckedChangeListener((button, checked) -> queue.run());
      trash.setOnCheckedChangeListener((button, checked) -> queue.run());
      rating.setOnRatingBarChangeListener((bar, value, fromUser) -> queue.run());
      fields.addView(button("Export file", () -> exportItem(saved[0])));
      AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Item details").setView(scroll)
          .setNegativeButton("Done", null).create();
      fields.addView(button("Connections", () -> {
        editorHandler.removeCallbacks(save);
        save.run();
        if (persisted[0]) { dialog.dismiss(); connections(saved[0]); }
      }));
      fields.addView(button("Revision history", () -> {
        editorHandler.removeCallbacks(save);
        save.run();
        if (persisted[0]) { dialog.dismiss(); revisionHistory(saved[0]); }
      }));
      dialog.setOnShowListener(ignored -> dialog.getButton(-2).setOnClickListener(view -> {
        editorHandler.removeCallbacks(save);
        save.run();
        dialog.dismiss();
        if (!persisted[0]) message("The edit remains a draft. Reopen this item to finish it.");
      }));
      dialog.setOnDismissListener(ignored -> {
        editorHandler.removeCallbacks(save);
        save.run();
        flushEditor = null;
        refresh();
      });
      flushEditor = save;
      dialog.show();
      if (!pending.isEmpty()) save.run();
    } catch (Exception e) {
      error(e);
    }
  }

  private void exportItem(JSONObject item) {
    exporting = item;
    boolean note = "note".equals(item.optString("kind"));
    startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
        .setType(note ? "text/markdown" : item.optString("mime","application/octet-stream"))
        .putExtra(Intent.EXTRA_TITLE, note ? item.optString("title") + ".md" : item.optString("filename")), EXPORT_ITEM);
  }

  private void linkItem(EditText body, JSONObject note) {
    try {
      List<JSONObject> targets = new ArrayList<>();
      for (JSONObject candidate : app.store.items())
        if (!candidate.optBoolean("trashed") && !candidate.optString("id").equals(note.optString("id"))) targets.add(candidate);
      if (targets.isEmpty()) { message("Import or create another item first."); return; }
      boolean[] picked = new boolean[targets.size()];
      String[] titles = new String[targets.size()];
      for (int i=0; i<targets.size(); i++) titles[i] = targets.get(i).optString("title");
      int from = Math.max(0, body.getSelectionStart()), to = Math.max(from, body.getSelectionEnd());
      new AlertDialog.Builder(this).setTitle("Link Atlas items")
          .setMultiChoiceItems(titles, picked, (dialog, index, checked) -> picked[index] = checked)
          .setNegativeButton("Cancel", null)
          .setPositiveButton("Insert", (dialog, which) -> {
            StringBuilder links = new StringBuilder();
            for (int i=0; i<targets.size(); i++) if (picked[i]) {
              JSONObject target = targets.get(i);
              links.append("\n");
              if (target.optString("mime").startsWith("image/")) links.append("!");
              links.append("[").append(target.optString("title").replace("]", "").replace("[", ""))
                  .append("](atlas:").append(target.optString("id")).append(")\n");
            }
            if (links.length() > 0) body.getText().replace(from, to, links.toString());
          }).show();
    } catch (Exception failed) { error(failed); }
  }

  private void readNote(JSONObject item, String text) {
    LinearLayout blocks = new LinearLayout(this);
    blocks.setOrientation(LinearLayout.VERTICAL);
    blocks.setPadding(dp(16), 0, dp(16), dp(12));
    ScrollView scroll = new ScrollView(this);
    scroll.addView(blocks);
    AlertDialog dialog = new AlertDialog.Builder(this).setTitle(item.optString("title"))
        .setView(scroll).setPositiveButton("Done",null).create();
    java.util.regex.Pattern links = java.util.regex.Pattern.compile("(!?)\\[([^\\]]*)\\]\\(atlas:([a-fA-F0-9-]{36})\\)");
    boolean code = false;
    for (String line : text.split("\n", -1)) {
      if (line.startsWith("```")) { code = !code; continue; }
      java.util.regex.Matcher link = links.matcher(line);
      if (!code && link.find()) {
        try {
          JSONObject target = app.store.get(link.group(3));
          if (target.optBoolean("trashed")) throw new IOException("Unavailable");
          if ("!".equals(link.group(1)) && target.optString("mime").startsWith("image/")) {
            ImageView image = new ImageView(this);
            image.setContentDescription(target.optString("title"));
            image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            blocks.addView(image, new LinearLayout.LayoutParams(-1, dp(190)));
            loadImage(target, image, 1024);
          }
          blocks.addView(button(target.optString("title"), () -> {
            dialog.dismiss();
            if (flushEditor != null) flushEditor.run();
            connections(target);
          }));
        } catch (Exception missing) { blocks.addView(label(link.group(2) + " (unavailable)",14,muted)); }
      } else {
        String stripped = code ? line : line.replaceFirst("^#{1,6} +", "").replaceFirst("^[-*] ", "• ");
        TextView row = label(stripped, !code && line.startsWith("# ") ? 22 : !code && line.startsWith("##") ? 18 : 15, Color.WHITE);
        if (code) row.setTypeface(android.graphics.Typeface.MONOSPACE);
        blocks.addView(row);
      }
    }
    dialog.show();
  }

  private void connections(JSONObject item) {
    try {
      String id = item.optString("id");
      JSONArray outbound = item.optJSONArray("relations");
      List<JSONObject> found = new ArrayList<>();
      List<String> labels = new ArrayList<>();
      for (JSONObject candidate : app.store.items()) {
        String targetId = candidate.optString("id");
        if (id.equals(targetId) || candidate.optBoolean("trashed")) continue;
        boolean outgoing = item.optString("body").contains("atlas:" + targetId) || linked(outbound, targetId);
        boolean incoming = candidate.optString("body").contains("atlas:" + id) || linked(candidate.optJSONArray("relations"), id);
        if (outgoing || incoming) {
          found.add(candidate);
          labels.add((outgoing ? "→ " : "← ") + candidate.optString("title"));
        }
      }
      AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle("Connections · " + item.optString("title"))
          .setPositiveButton("Done", null);
      if (found.isEmpty()) dialog.setMessage("No connected items yet.");
      else dialog.setItems(labels.toArray(new String[0]), (view, index) -> details(found.get(index)));
      dialog.show();
    } catch (Exception failed) { error(failed); }
  }

  private boolean linked(JSONArray edges, String target) {
    if (edges != null) for (int i=0; i<edges.length(); i++) {
      JSONObject edge = edges.optJSONObject(i);
      if (edge != null && target.equals(edge.optString("target"))) return true;
    }
    return false;
  }

  private void revisionHistory(JSONObject item) {
    try {
      List<JSONObject> history = app.store.history(item.getString("id"));
      String[] revisions = new String[history.size()];
      for (int i=0; i<history.size(); i++)
        revisions[i] = "v" + history.get(i).optInt("revision") + " · " + history.get(i).optString("historyAction");
      new AlertDialog.Builder(this).setTitle("Revision history").setNegativeButton("Done", null)
          .setItems(revisions, (dialog, index) -> {
            if (index == 0) return;
            new AlertDialog.Builder(this).setTitle("Restore " + revisions[index] + "?")
                .setMessage("Atlas will save it as a new revision.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Restore", (view, which) -> {
                  try { details(app.store.restore(item.optString("id"), history.get(index).optInt("revision"), item.optInt("revision"))); }
                  catch (Exception failed) { error(failed); }
                }).show();
          }).show();
    } catch (Exception failed) { error(failed); }
  }

  private String join(JSONArray a) {
    List<String> values = new ArrayList<>();
    for (int i = 0; i < a.length(); i++) values.add(a.optString(i));
    return TextUtils.join(", ", values);
  }

  private void openOriginal(JSONObject item) {
    try {
      Uri uri = Uri.parse("content://cool.atlas.library.originals/" + item.getString("id"));
      Intent view =
          new Intent(Intent.ACTION_VIEW)
              .setDataAndType(uri, item.getString("mime"))
              .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      startActivity(Intent.createChooser(view, "Open original"));
    } catch (Exception e) {
      message(
          "No compatible viewer was found. The original is retained in your library and backups.");
    }
  }

  private void loadImage(JSONObject item, ImageView view, int size) {
    String hash = item.optString("hash"), key = hash + ":" + size;
    view.setTag(key);
    Bitmap cached = thumbnails.get(key);
    if (cached != null) {
      view.setImageBitmap(cached);
      return;
    }
    app.worker.execute(
        () -> {
          try {
            String path = app.store.blob(hash).getPath();
            Bitmap bitmap;
            if (item.optString("mime").startsWith("video/")) {
              android.media.MediaMetadataRetriever retriever = new android.media.MediaMetadataRetriever();
              try {
                retriever.setDataSource(path);
                bitmap = android.os.Build.VERSION.SDK_INT >= 27
                    ? retriever.getScaledFrameAtTime(250_000, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC, size, size)
                    : retriever.getFrameAtTime(250_000, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
              } finally { retriever.release(); }
            } else {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, options);
            options.inSampleSize = 1;
            while (options.outWidth / options.inSampleSize > size * 2
                || options.outHeight / options.inSampleSize > size * 2) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            bitmap = BitmapFactory.decodeFile(path, options);
            }
            if (bitmap != null) {
              thumbnails.put(key, bitmap);
              runOnUiThread(
                  () -> {
                    if (key.equals(view.getTag())) view.setImageBitmap(bitmap);
                  });
            }
          } catch (Exception ignored) {
          }
        });
  }

  private class Cards extends BaseAdapter {
    public int getCount() {
      return visible.size();
    }

    public Object getItem(int position) {
      return visible.get(position);
    }

    public long getItemId(int position) {
      return position;
    }

    public View getView(int position, View recycled, android.view.ViewGroup parent) {
      JSONObject item = visible.get(position);
      LinearLayout card = new LinearLayout(MainActivity.this);
      card.setOrientation(LinearLayout.VERTICAL);
      card.setBackgroundColor(panel);
      card.setPadding(dp(12), dp(12), dp(12), dp(12));
      if ((item.optString("mime").startsWith("image/") || item.optString("mime").startsWith("video/")) && item.optString("kind").equals("asset")) {
        ImageView image = new ImageView(MainActivity.this);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        image.setContentDescription(item.optString("title"));
        card.addView(image, new LinearLayout.LayoutParams(-1, dp(listView ? 48 : 112)));
        loadImage(item, image, 256);
      } else {
        TextView sample =
            label(
                item.optString("kind").equals("note")
                    ? item.optString("body")
                    : "folder".equals(item.optString("kind")) ? "Folder" : item.optString("mime"),
                12,
                muted);
        sample.setMaxLines(5);
        card.addView(sample, new LinearLayout.LayoutParams(-1, dp(listView ? 48 : 112)));
      }
      TextView title = label(item.optString("title"), 14, Color.WHITE);
      title.setSingleLine();
      title.setEllipsize(TextUtils.TruncateAt.END);
      card.addView(title, new LinearLayout.LayoutParams(-1, dp(34)));
      TextView tags =
          label(item.optJSONArray("tags") == null ? "" : join(item.optJSONArray("tags")), 11, gold);
      tags.setSingleLine();
      tags.setEllipsize(TextUtils.TruncateAt.END);
      card.addView(tags, new LinearLayout.LayoutParams(-1, dp(20)));
      return card;
    }
  }
}
