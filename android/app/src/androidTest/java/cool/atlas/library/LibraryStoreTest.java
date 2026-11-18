package cool.atlas.library;
import android.test.InstrumentationTestCase;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public final class LibraryStoreTest extends InstrumentationTestCase {
    public void testNativeScreenOpensOffline() throws Exception {
        android.content.Intent intent=new android.content.Intent(getInstrumentation().getTargetContext(),MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        android.app.Activity activity=getInstrumentation().startActivitySync(intent);
        getInstrumentation().waitForIdleSync();
        assertNotNull(activity.findViewById(android.R.id.content));
        assertNull(((AtlasApp)activity.getApplication()).startupError);
        getInstrumentation().runOnMainSync(activity::finish);
    }
    public void testPersistenceConflictAndDesktopCompatibleBackup()throws Exception {
        File root=new File(getInstrumentation().getTargetContext().getCacheDir(),"test-"+UUID.randomUUID());
        LibraryStore store=new LibraryStore(root);File backup=new File(root.getParentFile(),"backup-"+UUID.randomUUID());
        try {
            JSONObject note=store.note("Design note","# Saved offline");String id=note.getString("id");
            store.edit(id,1,"Updated note","Description","# Edited",new JSONArray().put("work"),new JSONArray(),true,false);
            try{store.edit(id,1,"Stale","","lost",new JSONArray(),new JSONArray(),false,false);fail("Stale revision must fail");}catch(IOException expected){}
            byte[] bytes="original bytes".getBytes(StandardCharsets.UTF_8);
            JSONObject asset=store.importFile(new ByteArrayInputStream(bytes),"reference.txt","text/plain");
            store.importFile(new ByteArrayInputStream(bytes),"duplicate.txt","text/plain");
            assertEquals(1,new File(root,"blobs").list().length);
            store.snapshot(backup);LibraryStore.verifyCatalog(new File(backup,"catalog.sqlite"));
            store.close();store=new LibraryStore(root);assertEquals("Updated note",store.get(id).getString("title"));
            LibraryStore restored=new LibraryStore(backup);try{assertEquals(3,restored.items().size());assertEquals(asset.getString("hash"),LibraryStore.digest(restored.blob(asset.getString("hash"))));assertEquals(2,restored.get(id).getInt("revision"));}finally{restored.close();}
        }finally{store.close();LibraryStore.deleteTree(root);LibraryStore.deleteTree(backup);}
    }
    public void testInvalidHashAndFailedCopyDoNotCreateRecords()throws Exception {
        File root=new File(getInstrumentation().getTargetContext().getCacheDir(),"test-"+UUID.randomUUID());LibraryStore store=new LibraryStore(root);
        try {
            try{store.blob("../../outside");fail("Traversal must fail");}catch(IOException expected){}
            try{store.importFile(new InputStream(){public int read()throws IOException{throw new IOException("source disconnected");}},"broken.png","image/png");fail("Interrupted input must fail");}catch(IOException expected){}
            assertEquals(0,store.items().size());assertEquals(0,new File(root,"staging").list().length);
        }finally{store.close();LibraryStore.deleteTree(root);}
    }
}
