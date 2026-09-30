package org.freeimpro.teacher;
import java.net.URI;
import java.util.Locale;

public final class TeacherUrlPolicy {
    private final URI origin;
    public TeacherUrlPolicy(String input) {
        try {
            URI uri = new URI(input.trim());
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/") || uri.getPath().equals("/teacher.html")) || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
            origin = new URI("https", null, uri.getHost().toLowerCase(Locale.ROOT), uri.getPort(), "/", null, null);
        } catch (Exception error) { throw new IllegalArgumentException("请输入课堂 HTTPS 地址，例如 https://教师电脑IP:8443/"); }
    }
    public String address() { return origin.toString(); }
    public String page() { return origin.resolve("teacher.html").toString(); }
    private URI allowed(String url) throws Exception {
        URI uri = new URI(url);
        if (!"https".equals(uri.getScheme()) || uri.getRawUserInfo() != null || !origin.getHost().equalsIgnoreCase(uri.getHost()) || port(uri) != port(origin)) throw new IllegalArgumentException();
        return uri;
    }
    private static int port(URI uri) { return uri.getPort() < 0 ? 443 : uri.getPort(); }
    public boolean navigation(String url) { try { URI uri = allowed(url); return uri.getRawPath().equals("/teacher.html") && uri.getRawQuery() == null && uri.getRawFragment() == null; } catch (Exception error) { return false; } }
    public boolean resource(String url) {
        try {
            URI uri = allowed(url); String path = uri.getRawPath();
            if (path.contains("%") || path.contains("..") || path.contains("\\")) return false;
            return navigation(url) || path.startsWith("/api/teacher/") || path.startsWith("/assets/") || path.equals("/icon.svg") || path.equals("/teacher.webmanifest") || path.equals("/connection.json");
        } catch (Exception error) { return false; }
    }
}
