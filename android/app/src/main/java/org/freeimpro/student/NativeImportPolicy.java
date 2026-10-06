package org.freeimpro.student;

import java.net.URI;
import java.util.Locale;

/** Shared files are opaque content grants, never paths, links or executable HTML. */
final class NativeImportPolicy {
    static final long BACKUP_LIMIT = 250L * 1024 * 1024;
    static final long PHOTO_LIMIT = 10L * 1024 * 1024;
    static boolean contentUri(String value) {
        try { URI uri = new URI(value); return "content".equals(uri.getScheme()) && uri.getAuthority() != null && !uri.getAuthority().isEmpty() && uri.getRawUserInfo() == null && uri.getRawFragment() == null; }
        catch (Exception e) { return false; }
    }
    static String type(String name, String mime) {
        if (name == null || mime == null || name.length() > 160 || java.util.regex.Pattern.compile("[\\\\/\\p{Cntrl}]").matcher(name).find()) return "";
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".json") && (mime.equals("application/json") || mime.equals("text/json") || mime.equals("text/plain") || mime.equals("application/octet-stream"))) return "application/json";
        return switch (mime) { case "image/jpeg", "image/png", "image/webp" -> mime; default -> ""; };
    }
    static boolean size(String type, long bytes) { return bytes > 0 && bytes <= (type.equals("application/json") ? BACKUP_LIMIT : PHOTO_LIMIT); }
    static boolean requestId(String id) { return id != null && id.matches("[a-fA-F0-9-]{36}"); }
}
