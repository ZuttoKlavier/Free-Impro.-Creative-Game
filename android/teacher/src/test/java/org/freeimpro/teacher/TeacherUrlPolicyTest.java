package org.freeimpro.teacher;
import org.junit.Test;
import static org.junit.Assert.*;
public class TeacherUrlPolicyTest {
    private final TeacherUrlPolicy policy = new TeacherUrlPolicy("https://192.168.1.2:8443/");
    @Test public void onlyTeacherPageCanOpen() {
        assertTrue(policy.navigation(policy.page()));
        for (String path : new String[]{"/", "/index.html", "/teacher.html?role=student", "/teacher.html#other", "/connection"}) assertFalse(policy.navigation(policy.address().replaceAll("/$", "") + path));
    }
    @Test public void studentAndOutsideResourcesAreBlocked() {
        assertTrue(policy.resource("https://192.168.1.2:8443/api/teacher/me"));
        assertTrue(policy.resource("https://192.168.1.2:8443/assets/teacher.js"));
        for (String url : new String[]{"https://192.168.1.2:8443/api/student/me", "https://evil.test/teacher.html", "https://192.168.1.2:8444/teacher.html", "intent://teacher", "file:///teacher.html", "https://192.168.1.2:8443/assets/%2e%2e/teacher.html"}) assertFalse(url, policy.resource(url));
    }
    @Test public void invalidAddressesCannotBeSaved() {
        for (String url : new String[]{"http://host/", "https://user@host/", "https://host/elsewhere", "https://host/?a=b"}) assertThrows(IllegalArgumentException.class, () -> new TeacherUrlPolicy(url));
    }
    @Test public void publicClassroomKeepsTeacherOriginBoundary() {
        TeacherUrlPolicy publicPolicy = new TeacherUrlPolicy("https://class.empfreeimpro.xyz/");
        assertEquals("https://class.empfreeimpro.xyz/teacher.html", publicPolicy.page());
        assertTrue(publicPolicy.navigation(publicPolicy.page()));
        assertTrue(publicPolicy.resource("https://class.empfreeimpro.xyz/api/teacher/me"));
        assertTrue(publicPolicy.resource("https://class.empfreeimpro.xyz/assets/teacher.js"));
        for (String url : new String[]{"http://class.empfreeimpro.xyz/teacher.html", "https://class.empfreeimpro.xyz:8443/teacher.html", "https://other.empfreeimpro.xyz/teacher.html", "https://class.empfreeimpro.xyz.evil.test/teacher.html", "https://user@class.empfreeimpro.xyz/teacher.html", "https://class.empfreeimpro.xyz/api/student/me", "https://class.empfreeimpro.xyz/admin.html"}) assertFalse(url, publicPolicy.resource(url));
    }
}
