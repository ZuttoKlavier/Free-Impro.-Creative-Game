package org.freeimpro.student;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/** Scoped exports only. No arbitrary paths, intents, URL opening or file reading bridge. */
final class LocalExports {
    record Item(String name, Uri uri) {}
    private final ContentResolver resolver;
    private OutputStream stream; private Uri pending; private String token; private long size;
    LocalExports(ContentResolver resolver) { this.resolver = resolver; }
    @JavascriptInterface public synchronized String begin(String name, String mime) {
        abort();
        if (name == null || !("application/json".equals(mime) || "audio/wav".equals(mime))) return "";
        String clean = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (clean.trim().isEmpty() || clean.length() > 120 || !(clean.endsWith(".json") && mime.equals("application/json") || clean.endsWith(".wav") && mime.equals("audio/wav"))) return "";
        try {
            ContentValues values = new ContentValues(); values.put(MediaStore.Downloads.DISPLAY_NAME, clean); values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/FreeImpro"); values.put(MediaStore.Downloads.IS_PENDING, 1);
            pending = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (pending == null) throw new java.io.IOException("Unable to create export");
            stream = resolver.openOutputStream(pending);
            if (stream == null) throw new java.io.IOException("Unable to open export");
            size = 0; token = java.util.UUID.randomUUID().toString(); return token;
        } catch (Exception e) { abort(); return ""; }
    }
    @JavascriptInterface public synchronized boolean append(String id, String encoded) {
        if (stream == null || id == null || !id.equals(token)) return false;
        if (encoded == null || encoded.length() > 90000) { abort(); return false; }
        try { byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP); size += bytes.length; if (size > 250L * 1024 * 1024) throw new IllegalArgumentException(); stream.write(bytes); return true; }
        catch (Exception e) { abort(); return false; }
    }
    @JavascriptInterface public synchronized boolean finish(String id) {
        if (stream == null || id == null || !id.equals(token)) return false;
        try {
            stream.close(); ContentValues values = new ContentValues(); values.put(MediaStore.Downloads.IS_PENDING, 0);
            if (resolver.update(pending, values, null, null) != 1) throw new java.io.IOException("Unable to publish export");
            stream = null; pending = null; token = null; return true;
        }
        catch (Exception e) { abort(); return false; }
    }
    @JavascriptInterface public synchronized void cancel(String id) { if (id != null && id.equals(token)) abort(); }
    synchronized void abort() {
        try { if (stream != null) stream.close(); } catch (Exception ignored) {}
        try { if (pending != null) resolver.delete(pending, null, null); } catch (Exception ignored) {}
        stream = null; pending = null; token = null;
    }
    List<Item> list(String mime) {
        List<Item> result = new ArrayList<>();
        String where = MediaStore.Downloads.RELATIVE_PATH + "=? AND " + MediaStore.Downloads.IS_PENDING + "=0 AND " + MediaStore.Downloads.OWNER_PACKAGE_NAME + "=?";
        try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, new String[]{MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME, MediaStore.Downloads.MIME_TYPE}, where, new String[]{Environment.DIRECTORY_DOWNLOADS + "/FreeImpro/", "org.freeimpro.student"}, MediaStore.Downloads.DATE_ADDED + " DESC")) {
            while (cursor != null && cursor.moveToNext()) if (mime.equals(cursor.getString(2))) result.add(new Item(cursor.getString(1), android.content.ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cursor.getLong(0))));
        }
        return result;
    }
}
