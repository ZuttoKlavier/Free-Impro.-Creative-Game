package org.freeimpro.student;

import java.net.URI;

/** Exact classroom origin and fixed app routes. Never dispatch a URI to another app. */
public final class UrlPolicy {
    private final URI origin;
    public UrlPolicy(String address) {
        try {
            URI parsed = new URI(address);
            String host = parsed.getHost();
            if (!"https".equals(parsed.getScheme()) || host == null || parsed.getRawUserInfo() != null || parsed.getRawQuery() != null || parsed.getRawFragment() != null || !(parsed.getPath().isEmpty() || parsed.getPath().equals("/")) || parsed.getPort() == 0 || parsed.getPort() > 65535) throw new IllegalArgumentException();
            origin = new URI("https", null, host.toLowerCase(java.util.Locale.ROOT), parsed.getPort(), "/", null, null);
        } catch (Exception e) { throw new IllegalArgumentException("请输入完整的课堂 HTTPS 地址，不包含账号、路径或课堂码。"); }
    }
    public String address() { return origin.toString(); }
    private static int port(URI uri) { return uri.getPort() < 0 ? 443 : uri.getPort(); }
    public boolean sameOrigin(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && uri.getRawUserInfo() == null && origin.getHost().equalsIgnoreCase(uri.getHost()) && port(origin) == port(uri);
        } catch (Exception e) { return false; }
    }
    public boolean navigation(String value) {
        if (!sameOrigin(value)) return false;
        try {
            URI uri = new URI(value);
            return (uri.getRawPath().equals("/") || uri.getRawPath().equals("/index.html") || uri.getRawPath().isEmpty()) && (uri.getRawQuery() == null || uri.getRawQuery().matches("class=[0-9]{6}")) && uri.getRawFragment() == null;
        } catch (Exception e) { return false; }
    }
    public boolean resource(String value) {
        if (!sameOrigin(value)) return false;
        try {
            URI uri = new URI(value); String path = uri.getRawPath();
            if (path.contains("%") || path.contains("\\") || path.contains("..")) return false;
            return navigation(value) || path.startsWith("/assets/") || path.startsWith("/api/student/") || path.equals("/student-sw.js") || path.equals("/icon.svg") || path.equals("/manifest.webmanifest");
        } catch (Exception e) { return false; }
    }
}
