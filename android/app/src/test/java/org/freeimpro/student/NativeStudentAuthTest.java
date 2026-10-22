package org.freeimpro.student;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

public class NativeStudentAuthTest {
    private static final String REQUEST = "4ad26cf8-7ca9-4bcc-8a22-a7cffd3a004f";
    private static final String OTHER = "54c5e440-2b05-4335-ab51-71d40e1a6e27";
    private static final String HANDOFF = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String TICKET = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final String OPEN = NativeStudentAuth.PUBLIC_ORIGIN + "api/student/account/native/open?handoffId=" + HANDOFF;
    private static final String CALLBACK = "freeimprostudent://auth/callback?ticket=" + TICKET;
    private NativeStudentAuth.Pending start(NativeStudentAuth auth) {
        return auth.begin(REQUEST, NativeStudentAuth.PUBLIC_ORIGIN, "wechat", "login", 7, 1000);
    }
    @Test public void nativeProofIsUnpredictableAndChallengeActuallyHashesVerifier() throws Exception {
        NativeStudentAuth auth = new NativeStudentAuth(); NativeStudentAuth.Pending first = start(auth);
        assertNotNull(first); assertTrue(first.codeVerifier().matches("[A-Za-z0-9_-]{43}"));
        assertEquals(32, Base64.getUrlDecoder().decode(first.codeVerifier()).length);
        assertEquals(Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(first.codeVerifier().getBytes(StandardCharsets.US_ASCII))), first.challenge);
        auth.cancel(REQUEST); NativeStudentAuth.Pending second = start(auth);
        assertNotEquals(first.codeVerifier(), second.codeVerifier()); assertNotEquals(first.challenge, second.challenge);
    }
    @Test public void onlyExplicitProvidersAndFixedConfiguredPublicOriginCanStart() {
        for (String origin : new String[]{"https://192.168.1.20:8443/", "https://evil.test/", "http://class.empfreeimpro.xyz/", "https://class.empfreeimpro.xyz:444/", "https://class.empfreeimpro.xyz.evil.test/"}) assertNull(new NativeStudentAuth().begin(REQUEST, origin, "wechat", "login", 7, 1000));
        assertNull(new NativeStudentAuth().begin(REQUEST, NativeStudentAuth.PUBLIC_ORIGIN, "https://evil.test/", "login", 7, 1000));
        assertNull(new NativeStudentAuth().begin(REQUEST, NativeStudentAuth.PUBLIC_ORIGIN, "wechat", "admin", 7, 1000));
        assertNull(new NativeStudentAuth().begin("------------------------------------", NativeStudentAuth.PUBLIC_ORIGIN, "wechat", "login", 7, 1000));
        NativeStudentAuth auth = new NativeStudentAuth();
        assertFalse(NativeStudentAuth.provider("apple")); assertTrue(NativeStudentAuth.provider("wechat"));
        assertNull(auth.begin(REQUEST, NativeStudentAuth.PUBLIC_ORIGIN, "apple", "login", 7, 1000));
        assertNull(auth.begin(REQUEST, NativeStudentAuth.PUBLIC_ORIGIN, "apple", "link", 7, 1000));
        assertNull(auth.current());
        assertNotNull(auth.begin(REQUEST, NativeStudentAuth.PUBLIC_ORIGIN, "wechat", "link", 7, 1000));
    }
    @Test public void browserHandoffCannotLaunchArbitraryOriginsPathsOrQueries() {
        assertTrue(NativeStudentAuth.browserURL(OPEN, NativeStudentAuth.PUBLIC_ORIGIN, HANDOFF));
        for (String url : new String[]{OPEN.replace("https:", "http:"), OPEN.replace("class.empfreeimpro.xyz", "evil.test"), OPEN.replace("class.empfreeimpro.xyz", "class.empfreeimpro.xyz:443"), OPEN.replace("native/open", "native/consume"), OPEN + "&next=https://evil.test", OPEN + "#redirect", OPEN.replace("handoffId=", "handoffId=%61"), OPEN.replace(HANDOFF, TICKET), OPEN.replace("native/open", "native/%6fpen"), OPEN.replace("class.empfreeimpro.xyz", "user@class.empfreeimpro.xyz")}) assertFalse(url, NativeStudentAuth.browserURL(url, NativeStudentAuth.PUBLIC_ORIGIN, HANDOFF));
        assertFalse(NativeStudentAuth.browserURL(OPEN, "https://evil.test/", HANDOFF));
    }
    @Test public void callbackMustBeExactAndCannotBeAcceptedBeforeLaunchingOrTwice() {
        NativeStudentAuth auth = new NativeStudentAuth(); NativeStudentAuth.Pending flow = start(auth);
        assertNull(auth.callback(flow, CALLBACK, 7, 1100));
        assertTrue(auth.handoff(flow, HANDOFF, OPEN, 7, 1100));
        for (String url : new String[]{CALLBACK + "&ticket=" + TICKET, CALLBACK + "#data", CALLBACK.replace("auth/callback", "evil/callback"), CALLBACK.replace("auth/callback", "auth:123/callback"), CALLBACK.replace("/callback", "/callback/"), CALLBACK.replace("/callback", "/%63allback"), CALLBACK.replace("ticket=", "other="), CALLBACK.replace("freeimprostudent:", "https:"), CALLBACK.replace(TICKET, "short"), CALLBACK.replace(TICKET, TICKET.toUpperCase())}) assertNull(url, auth.callback(flow, url, 7, 1200));
        assertEquals(TICKET, auth.callback(flow, CALLBACK, 7, 1200));
        assertNull(auth.callback(flow, CALLBACK, 7, 1200)); assertTrue(auth.finish(flow, 7, 1200)); assertNull(auth.current());
    }
    @Test public void cancellationPageChangesExpiryAndLateCallbacksCannotRestoreOldFlow() {
        NativeStudentAuth auth = new NativeStudentAuth(); NativeStudentAuth.Pending first = start(auth);
        assertTrue(auth.handoff(first, HANDOFF, OPEN, 7, 1100));
        assertNull(auth.cancel(OTHER)); assertSame(first, auth.current());
        assertNull(auth.begin(OTHER, NativeStudentAuth.PUBLIC_ORIGIN, "wechat", "login", 7, 1100));
        assertNull(auth.callback(first, CALLBACK, 8, 1200));
        assertSame(first, auth.cancel(REQUEST)); assertNull(auth.callback(first, CALLBACK, 7, 1200));
        NativeStudentAuth.Pending next = start(auth);
        assertFalse(auth.handoff(first, HANDOFF, OPEN, 7, 1200)); assertNull(auth.callback(first, CALLBACK, 7, 1200)); assertSame(next, auth.current());
        assertFalse(auth.active(next, 7, 1000 + NativeStudentAuth.TIMEOUT_MS));
        assertFalse(auth.handoff(next, HANDOFF, OPEN, 7, 1000 + NativeStudentAuth.TIMEOUT_MS));
        assertFalse(auth.finish(first, 7, 1200)); assertSame(next, auth.cancel(null));
    }
    @Test public void browserBackClearsBusyButAnActualCallbackKeepsConsumeAlive() {
        NativeStudentAuth auth = new NativeStudentAuth(); NativeStudentAuth.Pending flow = start(auth);
        assertFalse(auth.returnedWithoutCallback(flow));
        auth.handoff(flow, HANDOFF, OPEN, 7, 1100); assertFalse(auth.returnedWithoutCallback(flow));
        auth.leftApp(); assertTrue(auth.returnedWithoutCallback(flow));
        assertEquals(TICKET, auth.callback(flow, CALLBACK, 7, 1200)); assertFalse(auth.returnedWithoutCallback(flow));
        auth.cancel(null); assertFalse(auth.returnedWithoutCallback(flow)); assertFalse(auth.finish(flow, 7, 1200));
    }
}
