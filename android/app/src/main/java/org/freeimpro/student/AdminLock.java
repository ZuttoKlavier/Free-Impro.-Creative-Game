package org.freeimpro.student;

import android.content.SharedPreferences;
import android.util.Base64;
import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

final class AdminLock {
    private final SharedPreferences prefs;
    AdminLock(SharedPreferences prefs) { this.prefs = prefs; }
    boolean configured() { return prefs.contains("pin_hash"); }
    private byte[] hash(String pin, byte[] salt) throws Exception { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(new PBEKeySpec(pin.toCharArray(), salt, 120000, 256)).getEncoded(); }
    void create(String pin) throws Exception {
        if (!pin.matches("[0-9]{6,12}")) throw new IllegalArgumentException("教师管理码需要 6–12 位数字。");
        byte[] salt = new byte[16]; new SecureRandom().nextBytes(salt);
        prefs.edit().putString("pin_salt", Base64.encodeToString(salt, Base64.NO_WRAP)).putString("pin_hash", Base64.encodeToString(hash(pin, salt), Base64.NO_WRAP)).putInt("attempts", 0).remove("locked_until").commit();
    }
    boolean verify(String pin) throws Exception {
        long remaining = prefs.getLong("locked_until", 0) - System.currentTimeMillis();
        if (remaining > 0) throw new IllegalArgumentException("尝试次数过多，请稍后再试。");
        boolean valid = configured() && MessageDigest.isEqual(hash(pin, Base64.decode(prefs.getString("pin_salt", ""), Base64.NO_WRAP)), Base64.decode(prefs.getString("pin_hash", ""), Base64.NO_WRAP));
        int attempts = valid ? 0 : prefs.getInt("attempts", 0) + 1;
        prefs.edit().putInt("attempts", attempts >= 5 ? 0 : attempts).putLong("locked_until", attempts >= 5 ? System.currentTimeMillis() + 60000 : 0).commit();
        return valid;
    }
}
