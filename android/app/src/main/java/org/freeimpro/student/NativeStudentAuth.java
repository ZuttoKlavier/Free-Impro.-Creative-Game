package org.freeimpro.student;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** One native-owned proof and one browser handoff. No URL or verifier is supplied by JavaScript. */
final class NativeStudentAuth {
    static final String PUBLIC_ORIGIN = "https://class.empfreeimpro.xyz/";
    static final long TIMEOUT_MS = 300000;
    private static final SecureRandom RANDOM = new SecureRandom();
    private Pending pending;

    static final class Pending {
        final String id, origin, provider, mode, challenge;
        final int generation;
        final long expires;
        private final String verifier;
        String handoffId;
        boolean launched, leftApp, consuming;
        Pending(String id, String origin, String provider, String mode, int generation, long now) {
            this.id = id; this.origin = origin; this.provider = provider; this.mode = mode; this.generation = generation;
            this.expires = now + TIMEOUT_MS;
            byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
            verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            try { challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII))); }
            catch (Exception error) { throw new IllegalStateException("Native proof unavailable", error); }
        }
        String codeVerifier() { return verifier; }
    }

    static boolean requestId(String value) {
        return value != null && value.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}");
    }
    static boolean provider(String value) { return "wechat".equals(value); }
    synchronized Pending begin(String id, String origin, String provider, String mode, int generation, long now) {
        if (pending != null || !requestId(id) || !PUBLIC_ORIGIN.equals(origin) || !provider(provider) || !("login".equals(mode) || "link".equals(mode))) return null;
        pending = new Pending(id, origin, provider, mode, generation, now); return pending;
    }
    synchronized Pending current() { return pending; }
    synchronized boolean active(Pending value, int generation, long now) {
        return value != null && pending == value && value.generation == generation && now < value.expires;
    }
    static boolean browserURL(String value, String origin, String handoffId) {
        if (!PUBLIC_ORIGIN.equals(origin) || !hexToken(handoffId) || value == null) return false;
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && "class.empfreeimpro.xyz".equals(uri.getRawAuthority()) && uri.getRawUserInfo() == null && uri.getPort() == -1 && "/api/student/account/native/open".equals(uri.getRawPath()) && ("handoffId=" + handoffId).equals(uri.getRawQuery()) && uri.getRawFragment() == null;
        } catch (Exception error) { return false; }
    }
    synchronized boolean handoff(Pending value, String id, String url, int generation, long now) {
        if (!active(value, generation, now) || !browserURL(url, value.origin, id)) return false;
        value.handoffId = id; value.launched = true; return true;
    }
    static boolean hexToken(String value) { return value != null && value.matches("[a-f0-9]{64}"); }
    static String callbackTicket(String value) {
        if (value == null || !value.matches("freeimprostudent://auth/callback\\?ticket=[a-f0-9]{64}")) return null;
        return value.substring(value.indexOf("ticket=") + 7);
    }
    synchronized String callback(Pending value, String url, int generation, long now) {
        String ticket = callbackTicket(url);
        if (!active(value, generation, now) || !value.launched || value.consuming || ticket == null) return null;
        value.consuming = true; return ticket;
    }
    synchronized Pending cancel(String id) {
        if (pending == null || id != null && !pending.id.equals(id)) return null;
        Pending result = pending; pending = null; return result;
    }
    synchronized boolean finish(Pending value, int generation, long now) {
        if (!active(value, generation, now) || !value.consuming) return false;
        pending = null; return true;
    }
    synchronized void leftApp() { if (pending != null && pending.launched) pending.leftApp = true; }
    synchronized boolean returnedWithoutCallback(Pending value) { return pending == value && value.launched && value.leftApp && !value.consuming; }
}
