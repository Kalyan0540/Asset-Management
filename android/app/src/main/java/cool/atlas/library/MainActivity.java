package cool.atlas.library;

import android.app.*;
import android.os.Bundle;
import android.content.*;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.text.*;
import android.view.*;
import android.widget.*;
import android.util.LruCache;
import org.json.*;
import java.io.*;
import java.util.*;

public final class MainActivity extends Activity {
    private AtlasApp app;
    private LinearLayout root,actions;
    private TextView status;
    private EditText search;
    private Spinner filter;
    private GridView grid;
    private String selectedFilter="all";
    private final List<String> filterIds=new ArrayList<>();
    private List<JSONObject> visible=new ArrayList<>();
    private final LruCache<String,Bitmap> thumbnails=new LruCache<String,Bitmap>(16*1024*1024){@Override protected int sizeOf(String key,Bitmap value){return value.getByteCount();}};
    private static final int IMPORT=10,EXPORT_BACKUP=11,RESTORE_BACKUP=12;
    private final int background=Color.rgb(22,23,25),panel=Color.rgb(39,40,45),muted=Color.rgb(162,166,178),gold=Color.rgb(216,180,130);
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);app=(AtlasApp)getApplication();
        if(app.startupError!=null){new AlertDialog.Builder(this).setTitle("Library could not open").setMessage(app.startupError).setPositiveButton("Close",(d,w)->finish()).setCancelable(false).show();return;}
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(background);root.setPadding(dp(16),dp(12),dp(16),dp(8));setContentView(root);
        root.setOnApplyWindowInsetsListener((view,insets)->{root.setPadding(dp(16),dp(12)+insets.getSystemWindowInsetTop(),dp(16),dp(8)+insets.getSystemWindowInsetBottom());return insets;});
        LinearLayout heading=row();TextView title=label("atlas.",28,Color.WHITE);heading.addView(title,new LinearLayout.LayoutParams(0,dp(54),1));
        Button menu=button("Library",this::libraryMenu);heading.addView(menu);root.addView(heading);
        status=label("Personal library · Stored on this phone",12,muted);root.addView(status);
        search=new EditText(this);search.setSingleLine(true);search.setTextSize(15);search.setHint("Search titles, tags and notes");search.setContentDescription("Search library");root.addView(search,new LinearLayout.LayoutParams(-1,dp(54)));
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){refreshItems();}public void afterTextChanged(Editable e){}});
        actions=row();actions.addView(button("Import files",()->pickFiles()),new LinearLayout.LayoutParams(0,dp(52),1));actions.addView(button("New note",this::newNote),new LinearLayout.LayoutParams(0,dp(52),1));root.addView(actions);
        filter=new Spinner(this);filter.setContentDescription("Filter collection");root.addView(filter,new LinearLayout.LayoutParams(-1,dp(48)));
        filter.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> p){}public void onItemSelected(AdapterView<?> p,View v,int n,long id){if(n<filterIds.size()){selectedFilter=filterIds.get(n);refreshItems();}}});
        grid=new GridView(this);grid.setNumColumns(GridView.AUTO_FIT);grid.setColumnWidth(dp(156));grid.setHorizontalSpacing(dp(10));grid.setVerticalSpacing(dp(10));grid.setStretchMode(GridView.STRETCH_COLUMN_WIDTH);grid.setContentDescription("Library items");root.addView(grid,new LinearLayout.LayoutParams(-1,0,1));
        grid.setOnItemClickListener((p,v,n,id)->{if(!app.busy)details(visible.get(n));});
        if(saved!=null){search.setText(saved.getString("query",""));selectedFilter=saved.getString("filter","all");}
        refresh();if(saved==null)receive(getIntent());
    }
    @Override protected void onResume(){super.onResume();if(root!=null){app.active=new java.lang.ref.WeakReference<>(this);refresh();}}
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);if(search!=null){state.putString("query",search.getText().toString());state.putString("filter",selectedFilter);}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);receive(intent);}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private LinearLayout row(){LinearLayout view=new LinearLayout(this);view.setOrientation(LinearLayout.HORIZONTAL);view.setGravity(Gravity.CENTER_VERTICAL);return view;}
    private TextView label(String text,int size,int color){TextView v=new TextView(this);v.setText(text);v.setTextSize(size);v.setTextColor(color);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
    private Button button(String title,Runnable click){Button b=new Button(this);b.setText(title);b.setTextColor(gold);b.setAllCaps(false);b.setOnClickListener(v->click.run());return b;}
    private EditText field(String hint,String value,boolean multiline){EditText v=new EditText(this);v.setHint(hint);v.setContentDescription(hint);v.setText(value);v.setTextSize(15);v.setSingleLine(!multiline);if(multiline){v.setMinLines(3);v.setGravity(Gravity.TOP);}return v;}
    private void error(Exception error){new AlertDialog.Builder(this).setTitle("Atlas could not complete this step").setMessage(error.getMessage()).setPositiveButton("OK",null).show();}
    private void message(String text){new AlertDialog.Builder(this).setTitle("Atlas").setMessage(text).setPositiveButton("OK",null).show();}
    private void refresh(){
        if(grid==null)return;
        try {
            filterIds.clear();Collections.addAll(filterIds,"all","notes","favorites","trash");List<String> labels=new ArrayList<>(Arrays.asList("All items","Notes","Favorites","Trash"));
            for(JSONObject c:app.store.collections()){filterIds.add(c.getString("id"));labels.add(c.getString("name"));}
            filter.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));int n=filterIds.indexOf(selectedFilter);filter.setSelection(Math.max(0,n));
            for(int i=0;i<actions.getChildCount();i++)actions.getChildAt(i).setEnabled(!app.busy);
            status.setText(app.busy?"Working… Keep Atlas open until complete.":"Personal library · Stored on this phone");refreshItems();
        }catch(Exception e){error(e);}
    }
    private void refreshItems(){
        if(grid==null || app.busy)return;
        try {
            String q=search.getText().toString().toLowerCase(Locale.ROOT);List<JSONObject> found=new ArrayList<>();
            for(JSONObject item:app.store.items()){
                if(item.optBoolean("trashed")!=selectedFilter.equals("trash"))continue;
                if(selectedFilter.equals("notes")&&!item.optString("kind").equals("note"))continue;
                if(selectedFilter.equals("favorites")&&!item.optBoolean("favorite"))continue;
                if(!Arrays.asList("all","notes","favorites","trash").contains(selectedFilter)&&!contains(item.optJSONArray("collections"),selectedFilter))continue;
                String hay=item.optString("title")+" "+item.optString("description")+" "+item.optString("body")+" "+item.optJSONArray("tags");
                if(hay.toLowerCase(Locale.ROOT).contains(q))found.add(item);
            }
            visible=found;grid.setAdapter(new Cards());status.setText(found.size()+" items · Stored on this phone"+(found.isEmpty()?" · Import files or create a note":""));
        }catch(Exception e){error(e);}
    }
    private boolean contains(JSONArray values,String value){if(values!=null)for(int i=0;i<values.length();i++)if(value.equals(values.optString(i)))return true;return false;}
    interface Work {String run()throws Exception;}
    private void work(Work task){
        if(app.busy){message("Wait for the current import or backup to finish.");return;}app.busy=true;refresh();
        app.worker.execute(()->{String result=null;Exception problem=null;try{result=task.run();}catch(Exception e){problem=e;}finally{app.busy=false;}
            MainActivity current=app.active==null?null:app.active.get();if(current!=null){final String done=result;final Exception failed=problem;current.runOnUiThread(()->{if(current.isFinishing()||current.isDestroyed())return;current.refresh();if(failed!=null)current.error(failed);else if(done!=null)current.message(done);});}
        });
    }
    private void pickFiles(){Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);startActivityForResult(intent,IMPORT);}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(result!=RESULT_OK||data==null)return;
        if(request==IMPORT){List<Uri> uris=uris(data);for(Uri uri:uris)try{getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(SecurityException ignored){}importUris(uris);}
        else if(data.getData()!=null&&request==EXPORT_BACKUP)work(()->{new BackupTransfer(getContentResolver()).export(app.store,data.getData(),getCacheDir());return "Backup saved and verified. Keep the whole dated folder together. You can restore it in Atlas on your computer.";});
        else if(data.getData()!=null&&request==RESTORE_BACKUP)work(()->{File restored=new BackupTransfer(getContentResolver()).restore(data.getData(),getFilesDir());app.useLibrary(restored);selectedFilter="all";return "Backup restored into a new local library. Your previous library remains on this phone.";});
    }
    private List<Uri> uris(Intent intent){List<Uri> list=new ArrayList<>();if(intent.getClipData()!=null){for(int i=0;i<intent.getClipData().getItemCount();i++){Uri uri=intent.getClipData().getItemAt(i).getUri();if(uri!=null&&!list.contains(uri))list.add(uri);}}else if(intent.getData()!=null)list.add(intent.getData());return list;}
    private void importUris(List<Uri> uris){if(uris.isEmpty())return;work(()->{int imported=0;List<String> errors=new ArrayList<>();for(Uri uri:uris){String name="Imported file";try{if(!"content".equals(uri.getScheme()))throw new IOException("Only shared content files are supported");try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())name=c.getString(0);}InputStream in=getContentResolver().openInputStream(uri);if(in==null)throw new IOException("Cannot read source");app.store.importFile(in,name,getContentResolver().getType(uri));imported++;}catch(Exception e){errors.add(name+": "+e.getMessage());}}return imported+" files imported. Originals were left unchanged."+(errors.isEmpty()?"":"\n\nSkipped:\n"+android.text.TextUtils.join("\n",errors));});}
    private void receive(Intent intent){if(intent==null||app.store==null)return;String action=intent.getAction();if(!Intent.ACTION_SEND.equals(action)&&!Intent.ACTION_SEND_MULTIPLE.equals(action))return;List<Uri> list=new ArrayList<>();if(Intent.ACTION_SEND_MULTIPLE.equals(action)){ArrayList<Uri> shared=intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);if(shared!=null)list.addAll(shared);}else {Uri uri=intent.getParcelableExtra(Intent.EXTRA_STREAM);if(uri!=null)list.add(uri);}if(list.isEmpty())list=uris(intent);if(!list.isEmpty())importUris(list);else {CharSequence text=intent.getCharSequenceExtra(Intent.EXTRA_TEXT);if(text!=null)work(()->{app.store.note("Shared note",text.toString());return "Shared text saved as a note.";});}intent.setAction(null);}
    private void newNote(){LinearLayout fields=new LinearLayout(this);fields.setOrientation(1);fields.setPadding(dp(16),0,dp(16),0);EditText title=field("Title","",false),body=field("Markdown note","",true);fields.addView(title);fields.addView(body);AlertDialog dialog=new AlertDialog.Builder(this).setTitle("New note").setView(fields).setNegativeButton("Cancel",null).setPositiveButton("Create",null).create();dialog.setOnShowListener(d->dialog.getButton(-1).setOnClickListener(v->{try{app.store.note(title.getText().toString(),body.getText().toString());dialog.dismiss();refresh();}catch(Exception e){error(e);}}));dialog.show();}
    private void libraryMenu(){if(app.busy){message("Keep Atlas open while the current operation finishes.");return;}String[] options={"New collection","Back up library","Restore Atlas backup","Libraries on this phone","About this preview"};new AlertDialog.Builder(this).setTitle("Library").setItems(options,(d,n)->{
        if(n==0){EditText name=field("Collection name","",false);AlertDialog create=new AlertDialog.Builder(this).setTitle("New collection").setView(name).setNegativeButton("Cancel",null).setPositiveButton("Create",null).create();create.setOnShowListener(x->create.getButton(-1).setOnClickListener(v->{try{app.store.collection(name.getText().toString());create.dismiss();refresh();}catch(Exception e){error(e);}}));create.show();}
        if(n==1)startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE),EXPORT_BACKUP);
        if(n==2)new AlertDialog.Builder(this).setTitle("Restore a backup").setMessage("Choose the complete dated Atlas backup folder. Atlas verifies originals and opens a separate library. This is a manual transfer, not synchronization.").setNegativeButton("Cancel",null).setPositiveButton("Choose folder",(x,w)->startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE),RESTORE_BACKUP)).show();
        if(n==3){File[] folders=getFilesDir().listFiles(f->f.isDirectory()&&new File(f,"catalog.sqlite").isFile());if(folders==null)return;String[] names=new String[folders.length];for(int i=0;i<folders.length;i++)names[i]=folders[i].getName()+(folders[i].equals(app.store.root)?" (current)":"");new AlertDialog.Builder(this).setTitle("Local libraries").setItems(names,(x,w)->work(()->{app.useLibrary(folders[w]);return "Library opened.";})).show();}
        if(n==4)message("Atlas Android 0.3 preview\n\nAn offline library for files, notes, tags and collections. Backups transfer between Android and desktop manually. Import Eagle on desktop, then transfer an Atlas backup to this phone.\n\nAutomatic sync, graph/table views, AI and MCP on Android, and background share recovery are not yet included. Keep Atlas open until imports finish. This is a test-signed APK, not a Play Store release. Back up before uninstalling.");
    }).show();}
    private void details(JSONObject original){
        try {
            JSONObject item=app.store.get(original.getString("id"));LinearLayout fields=new LinearLayout(this);fields.setOrientation(1);fields.setPadding(dp(18),dp(8),dp(18),dp(12));
            if(item.getString("kind").equals("asset")){
                if(item.getString("mime").startsWith("image/")){ImageView image=new ImageView(this);image.setAdjustViewBounds(true);image.setScaleType(ImageView.ScaleType.FIT_CENTER);fields.addView(image,new LinearLayout.LayoutParams(-1,dp(240)));loadImage(item,image,1024);}
                fields.addView(button("Open original in another app",()->openOriginal(item)));
            }
            EditText title=field("Title",item.getString("title"),false),description=field("Description",item.getString("description"),true),tags=field("Tags (comma separated)",join(item.getJSONArray("tags")),false),body=field("Markdown note",item.optString("body"),true);
            fields.addView(title);fields.addView(description);fields.addView(tags);if(item.getString("kind").equals("note"))fields.addView(body);
            CheckBox favorite=new CheckBox(this);favorite.setText("Favorite");favorite.setChecked(item.optBoolean("favorite"));fields.addView(favorite);
            CheckBox trash=new CheckBox(this);trash.setText("Move to Trash");trash.setChecked(item.optBoolean("trashed"));fields.addView(trash);
            fields.addView(label("Collections",14,muted));List<JSONObject> collections=app.store.collections();List<CheckBox> checks=new ArrayList<>();
            for(JSONObject c:collections){CheckBox check=new CheckBox(this);check.setText(c.getString("name"));check.setChecked(contains(item.optJSONArray("collections"),c.getString("id")));checks.add(check);fields.addView(check);}
            if(item.has("source"))fields.addView(label("Imported source metadata is preserved in backups.",12,muted));
            ScrollView scroll=new ScrollView(this);scroll.addView(fields);
            AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Item details").setView(scroll).setNegativeButton("Close",null).setPositiveButton("Save changes",null).create();
            dialog.setOnShowListener(d->dialog.getButton(-1).setOnClickListener(v->{try{
                LinkedHashSet<String> unique=new LinkedHashSet<>();for(String tag:tags.getText().toString().split(","))if(!tag.trim().isEmpty())unique.add(tag.trim());JSONArray selected=new JSONArray();for(int i=0;i<checks.size();i++)if(checks.get(i).isChecked())selected.put(collections.get(i).getString("id"));
                app.store.edit(item.getString("id"),item.getInt("revision"),title.getText().toString(),description.getText().toString(),body.getText().toString(),new JSONArray(unique),selected,favorite.isChecked(),trash.isChecked());dialog.dismiss();refresh();
            }catch(Exception e){error(e);}}));dialog.show();
        }catch(Exception e){error(e);}
    }
    private String join(JSONArray a){List<String> values=new ArrayList<>();for(int i=0;i<a.length();i++)values.add(a.optString(i));return TextUtils.join(", ",values);}
    private void openOriginal(JSONObject item){try{Uri uri=Uri.parse("content://cool.atlas.library.originals/"+item.getString("id"));Intent view=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,item.getString("mime")).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(view,"Open original"));}catch(Exception e){message("No compatible viewer was found. The original is retained in your library and backups.");}}
    private void loadImage(JSONObject item,ImageView view,int size){String hash=item.optString("hash"),key=hash+":"+size;view.setTag(key);Bitmap cached=thumbnails.get(key);if(cached!=null){view.setImageBitmap(cached);return;}app.worker.execute(()->{try{String path=app.store.blob(hash).getPath();BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeFile(path,options);options.inSampleSize=1;while(options.outWidth/options.inSampleSize>size*2||options.outHeight/options.inSampleSize>size*2)options.inSampleSize*=2;options.inJustDecodeBounds=false;Bitmap bitmap=BitmapFactory.decodeFile(path,options);if(bitmap!=null){thumbnails.put(key,bitmap);runOnUiThread(()->{if(key.equals(view.getTag()))view.setImageBitmap(bitmap);});}}catch(Exception ignored){}});}
    private class Cards extends BaseAdapter {
        public int getCount(){return visible.size();}public Object getItem(int position){return visible.get(position);}public long getItemId(int position){return position;}
        public View getView(int position,View recycled,android.view.ViewGroup parent){JSONObject item=visible.get(position);LinearLayout card=new LinearLayout(MainActivity.this);card.setOrientation(1);card.setBackgroundColor(panel);card.setPadding(dp(12),dp(12),dp(12),dp(12));
            if(item.optString("mime").startsWith("image/")&&item.optString("kind").equals("asset")){ImageView image=new ImageView(MainActivity.this);image.setScaleType(ImageView.ScaleType.CENTER_CROP);image.setContentDescription(item.optString("title"));card.addView(image,new LinearLayout.LayoutParams(-1,dp(112)));loadImage(item,image,256);}
            else {TextView sample=label(item.optString("kind").equals("note")?item.optString("body"):item.optString("mime"),12,muted);sample.setMaxLines(5);card.addView(sample,new LinearLayout.LayoutParams(-1,dp(112)));}
            TextView title=label(item.optString("title"),14,Color.WHITE);title.setSingleLine();title.setEllipsize(TextUtils.TruncateAt.END);card.addView(title,new LinearLayout.LayoutParams(-1,dp(34)));
            TextView tags=label(item.optJSONArray("tags")==null?"":join(item.optJSONArray("tags")),11,gold);tags.setSingleLine();tags.setEllipsize(TextUtils.TruncateAt.END);card.addView(tags,new LinearLayout.LayoutParams(-1,dp(20)));return card;
        }
    }
}
