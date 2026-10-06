package org.freeimpro.student;

import org.junit.Test;
import static org.junit.Assert.*;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.BitMatrix;
import com.journeyapps.barcodescanner.Decoder;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import java.util.Collections;

public class NativeStudentTest {
    private RGBLuminanceSource barcode(String value, BarcodeFormat format) throws Exception {
        BitMatrix matrix = new MultiFormatWriter().encode(value, format, 400, 400);
        int[] pixels = new int[matrix.getWidth() * matrix.getHeight()];
        for (int y = 0; y < matrix.getHeight(); y++) for (int x = 0; x < matrix.getWidth(); x++) pixels[y * matrix.getWidth() + x] = matrix.get(x, y) ? 0xff000000 : 0xffffffff;
        return new RGBLuminanceSource(matrix.getWidth(), matrix.getHeight(), pixels);
    }
    @Test public void embeddedQrDecoderReallyDecodesCoreGeneratedCodesAndRestrictsFormat() throws Exception {
        Decoder decoder = new DefaultDecoderFactory(Collections.singletonList(BarcodeFormat.QR_CODE)).createDecoder(Collections.emptyMap());
        UrlPolicy policy = new UrlPolicy("https://192.168.1.20:8443/");
        for (String value : new String[]{"123456", "https://192.168.1.20:8443/?class=123456", "https://outside.test/?class=123456"}) {
            Result result = decoder.decode(barcode(value, BarcodeFormat.QR_CODE));
            assertNotNull(result); assertEquals(value, result.getText()); assertEquals(BarcodeFormat.QR_CODE, result.getBarcodeFormat());
            assertEquals(value.contains("outside") ? "" : "123456", policy.classroomCode(result.getText()));
        }
        assertNull(decoder.decode(barcode("123456", BarcodeFormat.CODE_128)));
    }
    @Test public void cancelledCameraCallbacksCannotCompleteOrCancelTheNextScan() {
        NativeScanSession scans = new NativeScanSession();
        long first = scans.begin("same-request"); assertEquals("same-request", scans.finish(first));
        long second = scans.begin("same-request");
        assertFalse(scans.active(first)); assertNull(scans.finish(first)); assertTrue(scans.active(second)); assertEquals("same-request", scans.id());
        assertEquals("same-request", scans.finish(second)); assertNull(scans.finish(second)); assertFalse(scans.active(second));
    }
    @Test public void scanPermissionRemainsReservedAfterCancellationUntilItsOwnResult() {
        NativePermissionGate permissions = new NativePermissionGate();
        NativeScanSession scans = new NativeScanSession(); long scan = scans.begin("camera");
        assertTrue(permissions.begin(11)); scans.finish(scan);
        assertTrue(permissions.busy()); assertFalse(permissions.begin(10)); assertFalse(permissions.begin(11));
        assertFalse(permissions.finish(10)); assertTrue(permissions.busy());
        assertTrue(permissions.finish(11)); assertFalse(permissions.busy()); assertNull(scans.id());
        assertTrue(permissions.begin(10)); assertFalse(permissions.finish(11)); assertFalse(permissions.begin(11)); assertTrue(permissions.finish(10));
    }
    @Test public void backgroundOrUntrustedPagesCannotCreateOrPublishExports() {
        LocalExports exports = new LocalExports(null, () -> false);
        assertEquals("", exports.begin("backup.json", "application/json"));
        assertFalse(exports.append("token", "e30=")); assertFalse(exports.finish("token"));
    }
    @Test public void qrCannotChangeOriginOrOpenOtherApps() {
        UrlPolicy policy = new UrlPolicy("https://192.168.1.20:8443/");
        assertEquals("123456", policy.classroomCode("https://192.168.1.20:8443/?class=123456"));
        assertEquals("123456", policy.classroomCode("123456"));
        for (String value : new String[]{"https://evil.test/?class=123456", "http://192.168.1.20:8443/?class=123456", "https://192.168.1.20:8443/?class=123456&next=outside", "https://192.168.1.20:8443/?class=%31%32%33%34%35%36", "https://192.168.1.20:8443/teacher.html?class=123456", "intent://scan", "https://192.168.1.20:8443/?class=123456#outside"}) assertEquals(value, "", policy.classroomCode(value));
    }
    @Test public void fallbackReloadRequiresReleaseBeyondThreshold() {
        PullReloadGesture gesture = new PullReloadGesture(2);
        gesture.begin(10, 10, 1, true); assertFalse(gesture.move(10, 169, 1, true)); assertFalse(gesture.end(10, 169, 1, true));
        gesture.begin(10, 10, 1, true); assertTrue(gesture.move(10, 170, 1, true)); assertFalse(gesture.end(10, 160, 1, true));
        gesture.begin(10, 10, 1, true); assertTrue(gesture.move(10, 180, 1, true)); assertTrue(gesture.end(10, 180, 1, true));
    }
    @Test public void fallbackCancelsMultiTouchHorizontalAndInterruptedPulls() {
        PullReloadGesture gesture = new PullReloadGesture(1);
        gesture.begin(0, 0, 1, true); gesture.move(0, 100, 2, true); assertFalse(gesture.end(0, 100, 1, true));
        gesture.begin(0, 0, 1, true); gesture.move(150, 100, 1, true); assertFalse(gesture.end(0, 150, 1, true));
        gesture.begin(0, 0, 1, true); gesture.cancel(); assertFalse(gesture.end(0, 100, 1, true));
        gesture.begin(0, 0, 1, false); assertFalse(gesture.end(0, 100, 1, true));
    }
    @Test public void importRejectsLinksExecutablesAndOversizedFiles() {
        assertTrue(NativeImportPolicy.contentUri("content://files.provider/document/123"));
        for (String value : new String[]{"file:///sdcard/backup.json", "https://example.test/backup.json", "content://user@files/item", "intent://files", "content:/missing"}) assertFalse(value, NativeImportPolicy.contentUri(value));
        assertEquals("application/json", NativeImportPolicy.type("old-backup.json", "application/octet-stream"));
        for (String name : new String[]{"backup.html", "../backup.json", "file/backup.json", "backup.json\n"}) assertEquals(name, "", NativeImportPolicy.type(name, "application/json"));
        assertEquals("", NativeImportPolicy.type("picture.svg", "image/svg+xml"));
        assertFalse(NativeImportPolicy.size("image/jpeg", NativeImportPolicy.PHOTO_LIMIT + 1));
        assertFalse(NativeImportPolicy.size("application/json", NativeImportPolicy.BACKUP_LIMIT + 1));
        assertFalse(NativeImportPolicy.size("application/json", 0));
    }
}
