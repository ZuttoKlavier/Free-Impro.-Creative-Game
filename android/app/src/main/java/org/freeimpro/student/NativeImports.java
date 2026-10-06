package org.freeimpro.student;

import android.content.ContentResolver;
import android.database.Cursor;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.util.UUID;
import org.json.JSONObject;

/** One user-shared local file, copied into private cache and exposed by token only. */
final class NativeImports {
    private final ContentResolver resolver;
    private final File directory;
    private File pending;
    private String token, name, type;
    private long size, generation;
    NativeImports(ContentResolver resolver, File cacheDirectory) {
        this.resolver = resolver; directory = new File(cacheDirectory, "classroom-imports");
        directory.mkdirs(); File[] stale = directory.listFiles(); if (stale != null) for (File file : stale) file.delete();
    }
    void stage(Uri uri, String suggestedType) throws Exception {
        if (!NativeImportPolicy.contentUri(uri.toString())) throw new IllegalArgumentException();
        String filename = "", providerType = resolver.getType(uri); long reportedSize = -1;
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                filename = cursor.getString(0); if (!cursor.isNull(1)) reportedSize = cursor.getLong(1);
            }
        }
        String mime = NativeImportPolicy.type(filename, providerType == null ? suggestedType : providerType);
        if (mime.isEmpty() || reportedSize == 0 || reportedSize > (mime.equals("application/json") ? NativeImportPolicy.BACKUP_LIMIT : NativeImportPolicy.PHOTO_LIMIT)) throw new IllegalArgumentException();
        final long ticket; synchronized (this) { ticket = ++generation; }
        String id = UUID.randomUUID().toString(); File file = new File(directory, id + ".incoming"); long bytes = 0;
        try {
            try (InputStream input = resolver.openInputStream(uri); FileOutputStream output = new FileOutputStream(file)) {
                if (input == null) throw new IllegalArgumentException();
                byte[] chunk = new byte[48 * 1024]; int count;
                while ((count = input.read(chunk)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new IllegalArgumentException();
                    if (count == 0) continue; bytes += count;
                    if (!NativeImportPolicy.size(mime, bytes)) throw new IllegalArgumentException();
                    output.write(chunk, 0, count);
                }
            }
            if (!NativeImportPolicy.size(mime, bytes)) throw new IllegalArgumentException();
            if (mime.equals("application/json")) {
                try (FileInputStream input = new FileInputStream(file)) {
                    int first; do { first = input.read(); } while (first == ' ' || first == '\n' || first == '\r' || first == '\t');
                    if (first != '{') throw new IllegalArgumentException();
                }
            } else {
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(file.getAbsolutePath(), options);
                if (options.outWidth <= 0 || options.outHeight <= 0 || (long) options.outWidth * options.outHeight > 40_000_000 || !mime.equals(options.outMimeType)) throw new IllegalArgumentException();
            }
            synchronized (this) {
                if (ticket != generation) throw new IllegalArgumentException();
                if (pending != null) pending.delete(); pending = file; token = id; name = filename; type = mime; size = bytes;
            }
        } catch (Exception error) { file.delete(); throw error; }
    }
    synchronized String metadata() {
        if (pending == null) return "";
        try { return new JSONObject().put("token", token).put("name", name).put("type", type).put("size", size).toString(); }
        catch (Exception error) { return ""; }
    }
    synchronized String read(String id, long offset) {
        if (pending == null || id == null || !id.equals(token) || offset < 0 || offset >= size) return "";
        try (RandomAccessFile file = new RandomAccessFile(pending, "r")) {
            file.seek(offset); byte[] bytes = new byte[(int) Math.min(48 * 1024, size - offset)]; file.readFully(bytes); return Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception error) { return ""; }
    }
    synchronized void finish(String id) { if (id != null && id.equals(token)) clear(); }
    synchronized void clear() { generation++; if (pending != null) pending.delete(); pending = null; token = null; name = null; type = null; size = 0; }
}
