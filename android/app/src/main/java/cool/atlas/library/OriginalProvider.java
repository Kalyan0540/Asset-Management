package cool.atlas.library;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import org.json.JSONObject;
import java.io.FileNotFoundException;
/** Grants read-only access to one selected original for an external preview app. */
public final class OriginalProvider extends ContentProvider {
    @Override public boolean onCreate(){return true;}
    private JSONObject item(Uri uri)throws Exception {
        if(uri.getPathSegments().size()!=1)throw new FileNotFoundException();
        JSONObject item=((AtlasApp)getContext().getApplicationContext()).store.get(uri.getLastPathSegment());
        if(!item.getString("kind").equals("asset"))throw new FileNotFoundException();return item;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException {
        if(!"r".equals(mode))throw new FileNotFoundException("Read-only original");
        try{return ParcelFileDescriptor.open(((AtlasApp)getContext().getApplicationContext()).store.blob(item(uri).getString("hash")),ParcelFileDescriptor.MODE_READ_ONLY);}catch(Exception e){throw new FileNotFoundException("Original unavailable");}
    }
    @Override public String getType(Uri uri){try{return item(uri).getString("mime");}catch(Exception e){return "application/octet-stream";}}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){try{JSONObject item=item(uri);MatrixCursor cursor=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});cursor.addRow(new Object[]{item.getString("filename"),item.getLong("size")});return cursor;}catch(Exception e){return null;}}
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String where,String[] args){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String where,String[] args){throw new UnsupportedOperationException();}
}
