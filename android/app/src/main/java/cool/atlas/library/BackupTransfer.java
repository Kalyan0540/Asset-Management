package cool.atlas.library;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** SAF directory transfer. No broad filesystem permission or cloud service. */
public final class BackupTransfer {
    private final ContentResolver resolver;
    public BackupTransfer(ContentResolver resolver){this.resolver=resolver;}
    private Uri root(Uri tree){return DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));}
    private Map<String,Uri> children(Uri directory)throws Exception {
        Uri query=DocumentsContract.buildChildDocumentsUriUsingTree(directory,DocumentsContract.getDocumentId(directory));
        Map<String,Uri> result=new HashMap<>();
        try(Cursor c=resolver.query(query,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){
            if(c==null)throw new IOException("Cannot read backup folder");
            while(c.moveToNext()){String name=c.getString(1);if(result.containsKey(name))throw new IOException("Duplicate names in backup folder");result.put(name,DocumentsContract.buildDocumentUriUsingTree(directory,c.getString(0)));}
        }return result;
    }
    private Uri required(Map<String,Uri> files,String name)throws IOException{Uri uri=files.get(name);if(uri==null)throw new IOException("Backup is missing "+name);return uri;}
    private InputStream read(Uri uri)throws IOException{InputStream in=resolver.openInputStream(uri);if(in==null)throw new IOException("Cannot open backup file");return in;}
    private String text(Uri uri)throws Exception{try(InputStream in=read(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] bytes=new byte[4096];int n;while((n=in.read(bytes))!=-1){if(out.size()+n>1_000_000)throw new IOException("Backup manifest too large");out.write(bytes,0,n);}return out.toString("UTF-8");}}
    public File restore(Uri tree,File filesDir)throws Exception {
        Map<String,Uri> source=children(root(tree));
        JSONObject manifest=new JSONObject(text(required(source,"atlas-backup.json")));
        if(!manifest.getString("format").equals("atlas-backup")||manifest.getInt("version")!=1)throw new IOException("Choose an Atlas backup folder, not an Eagle library");
        File destination=new File(filesDir,"Restored-"+UUID.randomUUID());new File(destination,"blobs").mkdirs();
        LibraryStore candidate=null;
        try {
            LibraryStore.copyVerified(read(required(source,"catalog.sqlite")),new File(destination,"catalog.sqlite"),null);
            LibraryStore.verifyCatalog(new File(destination,"catalog.sqlite"));candidate=new LibraryStore(destination);
            Map<String,Uri> blobs=children(required(source,"blobs"));
            for(String hash:candidate.referencedHashes())LibraryStore.copyVerified(read(required(blobs,hash)),candidate.blob(hash),hash);
            candidate.close();candidate=null;return destination;
        }catch(Exception e){if(candidate!=null)candidate.close();LibraryStore.deleteTree(destination);throw e;}
    }
    private Uri create(Uri parent,String type,String name)throws Exception{Uri result=DocumentsContract.createDocument(resolver,parent,type,name);if(result==null)throw new IOException("Cannot write backup folder");return result;}
    private void copy(File source,Uri target)throws Exception {
        try(InputStream in=new FileInputStream(source);OutputStream out=resolver.openOutputStream(target,"w")){if(out==null)throw new IOException("Cannot write backup");byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}
        java.security.MessageDigest hash=java.security.MessageDigest.getInstance("SHA-256");try(InputStream in=read(target)){byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1)hash.update(bytes,0,n);}
        StringBuilder value=new StringBuilder();for(byte b:hash.digest())value.append(String.format(Locale.ROOT,"%02x",b&255));if(!LibraryStore.digest(source).equals(value.toString()))throw new IOException("Exported file failed verification");
    }
    public void export(LibraryStore store,Uri tree,File cache)throws Exception {
        File snapshot=new File(cache,"Backup-"+UUID.randomUUID());Uri destination=null;
        try {
            store.snapshot(snapshot);
            destination=create(root(tree),DocumentsContract.Document.MIME_TYPE_DIR,"Atlas Backup "+System.currentTimeMillis());
            Uri blobs=create(destination,DocumentsContract.Document.MIME_TYPE_DIR,"blobs");
            copy(new File(snapshot,"catalog.sqlite"),create(destination,"application/octet-stream","catalog.sqlite"));
            File[] files=new File(snapshot,"blobs").listFiles();if(files!=null)for(File file:files)copy(file,create(blobs,"application/octet-stream",file.getName()));
            // Commit marker is written last. An interrupted copy is never a valid backup.
            copy(new File(snapshot,"atlas-backup.json"),create(destination,"application/json","atlas-backup.json"));
        }catch(Exception e){if(destination!=null)try{DocumentsContract.deleteDocument(resolver,destination);}catch(Exception ignored){}throw e;}
        finally{LibraryStore.deleteTree(snapshot);}
    }
}
