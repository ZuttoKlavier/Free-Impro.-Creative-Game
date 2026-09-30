package org.freeimpro.student;
import org.junit.Test;
import static org.junit.Assert.*;
public class UrlPolicyTest {
    private final UrlPolicy policy = new UrlPolicy("https://192.168.1.20:8443/");
    @Test public void permitsOnlyClassroomPages() {
        assertTrue(policy.navigation("https://192.168.1.20:8443/"));
        assertTrue(policy.navigation("https://192.168.1.20:8443/?class=123456"));
        for (String path : new String[]{"/connection", "/api/student/me", "/?class=abc", "/?next=https://example.com", "/%2e%2e/", "/#outside"}) assertFalse(path, policy.navigation("https://192.168.1.20:8443" + path));
    }
    @Test public void blocksSchemesPortsUserInfoAndLookalikeHosts() {
        for (String url : new String[]{"https://192.168.1.20.evil.test:8443/", "https://192.168.1.20:8443@evil.test/", "https://user@192.168.1.20:8443/", "https://192.168.1.20:8444/", "http://192.168.1.20:8443/", "intent://browser/#Intent;end", "file:///sdcard/index.html", "content://settings/", "javascript:alert(1)", "data:text/html,<h1>outside</h1>", "blob:https://192.168.1.20:8443/id"}) { assertFalse(url, policy.navigation(url)); assertFalse(url, policy.resource(url)); }
    }
    @Test public void limitsRequestsIncludingServiceWorkers() {
        assertTrue(policy.resource("https://192.168.1.20:8443/assets/app-123.js")); assertTrue(policy.resource("https://192.168.1.20:8443/api/student/me")); assertTrue(policy.resource("https://192.168.1.20:8443/student-sw.js"));
        for (String path : new String[]{"/teacher.html", "/teacher.webmanifest", "/api/teacher/me", "/connection/ca.crt", "/connection.json", "/.env", "/assets/../connection", "/assets/%2e%2e/connection", "/assets/a%2fb"}) assertFalse(path, policy.resource("https://192.168.1.20:8443" + path));
    }
    @Test public void rejectsInvalidConfiguration() {
        for (String url : new String[]{"http://192.168.1.20/", "https://user@server/", "https://server/settings", "https://server/?class=123456", "intent://server/"}) assertThrows(IllegalArgumentException.class, () -> new UrlPolicy(url));
    }
    @Test public void hostNormalizationDoesNotDependOnDeviceLanguage() {
        java.util.Locale previous = java.util.Locale.getDefault();
        try {
            java.util.Locale.setDefault(new java.util.Locale("tr", "TR"));
            UrlPolicy named = new UrlPolicy("https://CLASSI.example:8443/");
            assertEquals("https://classi.example:8443/", named.address());
            assertTrue(named.navigation("https://classi.example:8443/"));
        } finally { java.util.Locale.setDefault(previous); }
    }
}
