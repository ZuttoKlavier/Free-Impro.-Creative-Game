package org.freeimpro.student;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.view.View;
import android.view.MotionEvent;
import android.webkit.*;
import android.widget.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import java.util.ArrayList;
import java.util.List;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.ResultPoint;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.CameraPreview;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private WebView web;
    private UrlPolicy policy;
    private SharedPreferences prefs;
    private AdminLock admin;
    private LocalExports exports;
    private NativeImports imports;
    private final ExecutorService importWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService authWorker = Executors.newSingleThreadExecutor();
    private final NativeStudentAuth studentAuth = new NativeStudentAuth();
    private PullReloadGesture fallbackPull;
    private int pageGeneration;
    private volatile boolean pageTrusted;
    private final NativeScanSession scans = new NativeScanSession();
    private AlertDialog scanDialog;
    private AlertDialog settingsDialog;
    private DecoratedBarcodeView scanner;
    private PermissionRequest permission;
    private ValueCallback<Uri[]> chooser;
    private AlertDialog chooserDialog;
    private volatile boolean visible;
    private final NativePermissionGate permissions = new NativePermissionGate();
    private boolean mainPageFailed;
    private TextView status;
    private LinearLayout failureActions;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("classroom", MODE_PRIVATE); admin = new AdminLock(prefs);
        policy = new UrlPolicy(prefs.getString("address", BuildConfig.CLASSROOM_URL));
        exports = new LocalExports(getContentResolver(), () -> visible && pageTrusted);
        imports = new NativeImports(getContentResolver(), getCacheDir());
        fallbackPull = new PullReloadGesture(getResources().getDisplayMetrics().density);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setFitsSystemWindows(true);
        LinearLayout toolbar = new LinearLayout(this); status = new TextView(this); status.setText("声音课堂 · 学生客户端"); status.setPadding(20, 12, 8, 12);
        toolbar.addView(status); layout.addView(toolbar); toolbar.setVisibility(View.GONE); web = new WebView(this); layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(layout);
        failureActions = new LinearLayout(this); failureActions.setVisibility(View.GONE);
        Button failureSettings = new Button(this); failureSettings.setText("连接设置"); failureSettings.setOnClickListener(v -> { if (visible && mainPageFailed && settingsDialog == null) verifyAdmin(); });
        failureActions.addView(failureSettings); layout.addView(failureActions);
        // A failed navigation has no page script to handle pull-to-refresh.
        web.setOnTouchListener((v, event) -> {
            if (!mainPageFailed) return false;
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                fallbackPull.begin(event.getX(), event.getY(), event.getPointerCount(), web.getScrollY() == 0);
            } else if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
                status.setText(fallbackPull.move(event.getX(), event.getY(), event.getPointerCount(), web.getScrollY() == 0) ? "下拉刷新 · 松开刷新" : "暂时无法打开；确认 Wi-Fi 后下拉刷新");
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                if (fallbackPull.end(event.getX(), event.getY(), event.getPointerCount(), web.getScrollY() == 0)) {
                    if (admin.configured()) web.loadUrl(policy.address()); else verifyAdmin();
                }
            } else if (event.getActionMasked() == MotionEvent.ACTION_CANCEL || event.getActionMasked() == MotionEvent.ACTION_POINTER_DOWN) fallbackPull.cancel();
            return false;
        });
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        // Honor the page viewport on tablets and when its app window resizes.
        s.setUseWideViewPort(true); s.setLoadWithOverviewMode(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setJavaScriptCanOpenWindowsAutomatically(false); s.setSupportMultipleWindows(true);
        s.setGeolocationEnabled(false); s.setMediaPlaybackRequiresUserGesture(true); s.setSafeBrowsingEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " FreeImproStudent/1");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setOnLongClickListener(v -> true); web.setLongClickable(false);
        web.setDownloadListener((url, agent, disposition, mime, length) -> notice("请使用作品库中的导出功能，文件会保存在本机 Download/FreeImpro。"));
        web.addJavascriptInterface(exports, "FreeImproFiles");
        web.addJavascriptInterface(new StudentBridge(), "FreeImproAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { boolean blocked = !policy.navigation(request.getUrl().toString()); if (blocked) notice("学生客户端只允许课堂内的功能。"); return blocked; }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                cancelStudentAuth(null, "页面已更新，请重新登录。", false);
                pageGeneration++; pageTrusted = false; mainPageFailed = false; fallbackPull.cancel(); toolbar.setVisibility(View.GONE); failureActions.setVisibility(View.GONE); cancelFileChooser(); denyPendingMedia(); cancelScan(); exports.abort();
                if (!policy.navigation(url)) { view.stopLoading(); connectionFailed("已拦截课堂外页面"); }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return policy.resource(request.getUrl().toString()) ? null : denied(); }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); connectionFailed("证书验证失败，请教师检查课堂地址与证书"); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) connectionFailed("未连接课堂；确认 Wi-Fi 后下拉刷新"); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { if (request.isForMainFrame()) connectionFailed("课堂服务暂不可用，请稍后重新连接"); }
            @Override public void onPageFinished(WebView view, String url) { if (!mainPageFailed && policy.navigation(url)) checkPageReady(pageGeneration, 50); }
        });
        ServiceWorkerController controller = ServiceWorkerController.getInstance();
        controller.getServiceWorkerWebSettings().setAllowFileAccess(false); controller.getServiceWorkerWebSettings().setAllowContentAccess(false);
        controller.setServiceWorkerClient(new ServiceWorkerClient() { @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return policy.resource(request.getUrl().toString()) ? null : denied(); } });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message result) { notice("学生客户端不打开新窗口。"); return false; }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) { callback.invoke(origin, false, false); }
            @Override public void onPermissionRequest(PermissionRequest request) { runOnUiThread(() -> askMedia(request)); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if (permission == request) permission = null; }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                cancelFileChooser(); chooser = callback;
                if (!visible || !policy.navigation(view.getUrl()) || params.getMode() != FileChooserParams.MODE_OPEN) { finishFileChooser(callback, null); return true; }
                try {
                    String accepts = String.join(",", params.getAcceptTypes());
                    String mime = accepts.contains("json") ? "application/json" : accepts.contains("audio") ? "audio/wav" : "";
                    List<LocalExports.Item> items = mime.isEmpty() ? java.util.Collections.emptyList() : exports.list(mime);
                    if (items.isEmpty()) { finishFileChooser(callback, null); notice("仅可选择本应用导出的备份或声音；照片请用应用内拍照。"); return true; }
                    chooserDialog = new AlertDialog.Builder(MainActivity.this).setTitle("选择本机课堂文件")
                        .setItems(items.stream().map(LocalExports.Item::name).toArray(String[]::new), (dialog, which) -> finishFileChooser(callback, new Uri[]{items.get(which).uri()}))
                        .setOnDismissListener(dialog -> finishFileChooser(callback, null)).create();
                    chooserDialog.show();
                } catch (RuntimeException error) { finishFileChooser(callback, null); notice("暂时无法读取本机课堂文件，请检查存储空间后重试。"); }
                return true;
            }
        });
        if (admin.configured()) web.loadUrl(policy.address()); else configure(true);
        if (!receiveStudentAuth(getIntent())) receiveSharedFile(getIntent());
    }
    private void checkPageReady(int generation, int attempts) {
        if (generation != pageGeneration || mainPageFailed) return;
        web.evaluateJavascript("document.documentElement.dataset.studentReady === 'true'", result -> {
            if (generation != pageGeneration || mainPageFailed) return;
            if ("true".equals(result)) { pageTrusted = true; status.setText("声音课堂 · 学生客户端"); nativeImportChanged(); }
            else if (attempts > 0) web.postDelayed(() -> checkPageReady(generation, attempts - 1), 200);
            else connectionFailed("页面尚未准备好，请下拉刷新后重试。");
        });
    }
    private boolean trustedPage() { return visible && pageTrusted && policy.navigation(web.getUrl()); }
    public final class StudentBridge {
        @JavascriptInterface public void settings() { runOnUiThread(() -> { if (trustedPage() && scans.id() == null && chooserDialog == null && settingsDialog == null) verifyAdmin(); }); }
        @JavascriptInterface public boolean beginStudentAuth(String id, String provider, String mode) {
            if (!visible || !pageTrusted || !NativeStudentAuth.requestId(id) || !NativeStudentAuth.provider(provider)) return false;
            runOnUiThread(() -> MainActivity.this.beginStudentAuth(id, provider, mode)); return true;
        }
        @JavascriptInterface public void cancelStudentAuth(String id) {
            if (NativeStudentAuth.requestId(id)) runOnUiThread(() -> MainActivity.this.cancelStudentAuth(id, "登录已取消，可以重新选择登录方式。", true));
        }
        @JavascriptInterface public boolean scanClassroom(String id) { if (!visible || !pageTrusted || !NativeImportPolicy.requestId(id)) return false; runOnUiThread(() -> startScan(id)); return true; }
        @JavascriptInterface public void cancelScanRequest(String id) { runOnUiThread(() -> { if (id != null && id.equals(scans.id())) cancelScan(); }); }
        @JavascriptInterface public String pendingImport() { return visible && pageTrusted ? imports.metadata() : ""; }
        @JavascriptInterface public String readImport(String id, long offset) { return visible && pageTrusted ? imports.read(id, offset) : ""; }
        @JavascriptInterface public void finishImport(String id) { if (visible && pageTrusted) imports.finish(id); }
    }
    private static final class AccountReply {
        final JSONObject body;
        final List<String> cookies;
        AccountReply(JSONObject body, List<String> cookies) { this.body = body; this.cookies = cookies; }
    }
    private AccountReply authPost(NativeStudentAuth.Pending flow, String action, JSONObject body, String cookies) throws Exception {
        // TLS uses the existing Android network security policy. Never follow
        // an API redirect, downgrade HTTPS, or send the private proof to a provider.
        HttpsURLConnection connection = (HttpsURLConnection) new URL(flow.origin + "api/student/account/native/" + action).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
        connection.setRequestMethod("POST"); connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Origin", flow.origin.substring(0, flow.origin.length() - 1));
        connection.setRequestProperty("User-Agent", "FreeImproStudent/1 NativeAuth");
        if (cookies != null && !cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
        byte[] encoded = body.toString().getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(encoded.length);
        try {
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(encoded); }
            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) throw new IllegalStateException("登录响应地址异常，请重新登录。");
            InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) throw new IllegalStateException("账号服务暂不可用，请稍后重试。");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = stream) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 65536) throw new IllegalStateException("账号服务响应异常，请重新登录。");
                    bytes.write(buffer, 0, count);
                }
            }
            JSONObject response = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            if (code < 200 || code >= 300) throw new IllegalStateException(response.optString("error", "账号验证未完成，请重新登录。"));
            List<String> receivedCookies = new ArrayList<>();
            for (java.util.Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                if (header.getKey() != null && "set-cookie".equalsIgnoreCase(header.getKey()) && header.getValue() != null) receivedCookies.addAll(header.getValue());
            }
            return new AccountReply(response, receivedCookies);
        } finally { connection.disconnect(); }
    }
    private String authCookies(NativeStudentAuth.Pending flow) { return CookieManager.getInstance().getCookie(flow.origin + "api/student/me"); }
    private void authReply(String id, int generation, JSONObject result, String error) {
        if (web == null || !pageTrusted || generation != pageGeneration || !NativeStudentAuth.requestId(id)) return;
        try {
            JSONObject detail = new JSONObject().put("id", id).put("error", error == null ? "" : error);
            if (result != null) detail.put("result", result);
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('freeimpro-native-auth-result',{detail:" + detail + "}))", null);
        } catch (Exception ignored) {}
    }
    private String authError(Exception error) {
        return error instanceof IllegalStateException && error.getMessage() != null ? error.getMessage() : "登录暂时无法完成，请检查网络后重试。";
    }
    private void beginStudentAuth(String id, String provider, String mode) {
        if (!trustedPage() || scans.id() != null || permissions.busy() || chooserDialog != null || settingsDialog != null) { authReply(id, pageGeneration, null, "请先关闭当前窗口，再登录。"); return; }
        NativeStudentAuth.Pending flow = studentAuth.begin(id, policy.address(), provider, mode, pageGeneration, System.currentTimeMillis());
        if (flow == null) { authReply(id, pageGeneration, null, studentAuth.current() != null ? "请先完成或取消当前登录。" : "微信授权需要教师配置正式 HTTPS 课堂地址。"); return; }
        String cookies = authCookies(flow);
        web.postDelayed(() -> { if (studentAuth.current() == flow) cancelStudentAuth(flow.id, "登录已超时，请重新选择登录方式。", true); }, NativeStudentAuth.TIMEOUT_MS);
        authWorker.execute(() -> {
            try {
                AccountReply reply = authPost(flow, "start", new JSONObject().put("provider", flow.provider).put("mode", flow.mode).put("codeChallenge", flow.challenge), cookies);
                String handoffId = reply.body.optString("handoffId"), browserURL = reply.body.optString("browserURL");
                runOnUiThread(() -> {
                    if (!trustedPage() || !studentAuth.handoff(flow, handoffId, browserURL, pageGeneration, System.currentTimeMillis())) {
                        if (NativeStudentAuth.hexToken(handoffId)) { flow.handoffId = handoffId; revokeStudentAuth(flow); }
                        if (studentAuth.current() == flow) cancelStudentAuth(flow.id, "登录已取消或授权地址异常，请重新登录。", true);
                        return;
                    }
                    try {
                        Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(browserURL)); browser.addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(browser);
                    } catch (RuntimeException error) { cancelStudentAuth(flow.id, "没有可用的浏览器，请先安装系统浏览器后重试。", true); }
                });
            } catch (Exception error) { runOnUiThread(() -> { if (studentAuth.current() == flow) cancelStudentAuth(flow.id, authError(error), true); }); }
        });
    }
    private boolean receiveStudentAuth(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null || !"freeimprostudent".equals(intent.getData().getScheme())) return false;
        NativeStudentAuth.Pending flow = studentAuth.current();
        String ticket = studentAuth.callback(flow, intent.getData().toString(), pageGeneration, System.currentTimeMillis());
        if (ticket == null) { notice("登录回调已过期或无效，请重新登录。"); return true; }
        String cookies = authCookies(flow);
        authWorker.execute(() -> {
            try {
                AccountReply reply = authPost(flow, "consume", new JSONObject().put("ticket", ticket).put("codeVerifier", flow.codeVerifier()), cookies);
                JSONObject user = reply.body.optJSONObject("user");
                if (user == null || !"student".equals(user.optString("role")) || user.optString("id").isEmpty()) throw new IllegalStateException("账号登录结果异常，请重新登录。");
                runOnUiThread(() -> {
                    if (!trustedPage() || !studentAuth.active(flow, pageGeneration, System.currentTimeMillis())) { if (studentAuth.current() == flow) cancelStudentAuth(flow.id, "登录已取消，请重新登录。", true); return; }
                    // Apply only student cookies, under the same configured
                    // WebView origin, before notifying the student page.
                    CookieManager manager = CookieManager.getInstance();
                    for (String cookie : reply.cookies) {
                        String name = cookie.substring(0, Math.max(0, cookie.indexOf('=')));
                        if ("fi_session_student".equals(name) || name.startsWith("fi_student_auth.") || name.startsWith("__Secure-fi_student_auth.")) manager.setCookie(flow.origin + "api/student/me", cookie);
                    }
                    manager.flush();
                    if (studentAuth.finish(flow, pageGeneration, System.currentTimeMillis())) authReply(flow.id, flow.generation, reply.body, null);
                });
            } catch (Exception error) { runOnUiThread(() -> { if (studentAuth.current() == flow) cancelStudentAuth(flow.id, authError(error), true); }); }
        });
        return true;
    }
    private void revokeStudentAuth(NativeStudentAuth.Pending flow) {
        if (flow.handoffId == null || authWorker.isShutdown()) return;
        String cookies = authCookies(flow);
        authWorker.execute(() -> { try { authPost(flow, "cancel", new JSONObject().put("handoffId", flow.handoffId).put("codeVerifier", flow.codeVerifier()), cookies); } catch (Exception ignored) {} });
    }
    private void cancelStudentAuth(String id, String error, boolean notify) {
        NativeStudentAuth.Pending flow = studentAuth.cancel(id);
        if (flow == null) return;
        revokeStudentAuth(flow);
        if (notify) authReply(flow.id, flow.generation, null, error);
    }
    private void scanReply(String id, String value, String error) {
        if (!NativeImportPolicy.requestId(id) || !visible || (!pageTrusted && !value.isEmpty())) return;
        try {
            String detail = new JSONObject().put("id", id).put("value", value).put("error", error).toString();
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('freeimpro-android-result',{detail:" + detail + "}))", null);
        } catch (Exception ignored) {}
    }
    private void startScan(String id) {
        if (!NativeImportPolicy.requestId(id) || !trustedPage()) return;
        if (scans.id() != null || permissions.busy() || chooserDialog != null || settingsDialog != null) { scanReply(id, "", "请先关闭当前窗口。"); return; }
        scans.begin(id); denyPendingMedia();
        web.evaluateJavascript("window.dispatchEvent(new Event('freeimpro-background'))", null);
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissions.begin(11);
            try { requestPermissions(new String[]{Manifest.permission.CAMERA}, 11); }
            catch (RuntimeException error) { permissions.finish(11); finishScan("", "无法请求相机权限，可以手动填写课堂码。"); }
            return;
        }
        showScanner();
    }
    private void showScanner() {
        if (scans.id() == null || !trustedPage()) { cancelScan(); return; }
        final long session = scans.generation();
        try {
            scanner = new DecoratedBarcodeView(this); scanner.setDecoderFactory(new DefaultDecoderFactory(Collections.singletonList(BarcodeFormat.QR_CODE)));
            scanner.setStatusText("对准教师展示的课堂二维码");
            scanDialog = new AlertDialog.Builder(this).setTitle("扫描课堂码").setView(scanner).setNegativeButton("取消", (dialog, which) -> finishScan(session, "", "")).create();
            scanDialog.setOnCancelListener(dialog -> finishScan(session, "", "")); scanDialog.setOnDismissListener(dialog -> finishScan(session, "", ""));
            scanner.getBarcodeView().addStateListener(new CameraPreview.StateListener() {
                public void previewSized() {} public void previewStarted() {} public void previewStopped() {} public void cameraClosed() {}
                public void cameraError(Exception error) { finishScan(session, "", "相机无法打开，请检查相机权限后重试。"); }
            });
            scanner.decodeContinuous(new BarcodeCallback() {
                @Override public void barcodeResult(BarcodeResult result) {
                    if (!scans.active(session)) return;
                    String code = policy.classroomCode(result.getText());
                    if (code.isEmpty()) { scanner.setStatusText("这不是当前教师的课堂二维码，请重新扫描。"); return; }
                    finishScan(session, code, "");
                }
                @Override public void possibleResultPoints(List<ResultPoint> points) {}
            });
            scanDialog.show(); scanDialog.getWindow().setLayout(-1, Math.round(Math.min(420 * getResources().getDisplayMetrics().density, getResources().getDisplayMetrics().heightPixels * .85f))); scanner.resume();
        } catch (Exception error) { finishScan("", "相机无法打开，请检查相机权限后重试。"); }
    }
    private void finishScan(String value, String error) {
        finishScan(scans.generation(), value, error);
    }
    private void finishScan(long session, String value, String error) {
        String id = scans.finish(session); if (id == null) return;
        if (scanner != null) { scanner.pause(); scanner = null; }
        AlertDialog dialog = scanDialog; scanDialog = null; if (dialog != null) dialog.dismiss();
        if (id != null) scanReply(id, value, error);
    }
    private void cancelScan() { finishScan("", ""); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); if (!receiveStudentAuth(intent)) receiveSharedFile(intent); }
    private void receiveSharedFile(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        final Uri uri; final String mime;
        try { uri = intent.getParcelableExtra(Intent.EXTRA_STREAM); mime = intent.getType(); }
        catch (RuntimeException error) { notice("分享文件无效，请重新选择本地备份或照片。"); return; }
        if (uri == null || (intent.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0 || !NativeImportPolicy.contentUri(uri.toString())) { notice("仅可接收分享的本地 JSON 备份或照片。"); return; }
        importWorker.execute(() -> {
            try { imports.stage(uri, mime); runOnUiThread(() -> { notice("文件已收到，请在“我的”确认导入。"); nativeImportChanged(); }); }
            catch (Exception error) { notice("无法读取这个文件。请选择 250 MB 以内的 JSON 备份或 10 MB 以内的 JPG、PNG、WebP 照片。"); }
        });
    }
    private void nativeImportChanged() { if (visible && pageTrusted) web.evaluateJavascript("window.dispatchEvent(new Event('freeimpro-android-import'))", null); }
    private static WebResourceResponse denied() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    private void connectionFailed(String message) {
        cancelStudentAuth(null, "课堂连接已中断，请重新登录。", true);
        pageTrusted = false; mainPageFailed = true; cancelScan(); cancelFileChooser(); denyPendingMedia(); exports.abort();
        web.evaluateJavascript("window.dispatchEvent(new Event('freeimpro-background'))", null);
        status.setText(message); ((View) status.getParent()).setVisibility(View.VISIBLE); failureActions.setVisibility(View.VISIBLE);
    }
    private void notice(String value) { runOnUiThread(() -> Toast.makeText(this, value, Toast.LENGTH_LONG).show()); }
    private void finishFileChooser(ValueCallback<Uri[]> expected, Uri[] result) {
        if (chooser != expected) return;
        chooser = null;
        AlertDialog dialog = chooserDialog; chooserDialog = null;
        if (dialog != null) dialog.dismiss();
        expected.onReceiveValue(result);
    }
    private void cancelFileChooser() { if (chooser != null) finishFileChooser(chooser, null); }
    private void denyPendingMedia() { PermissionRequest current = permission; permission = null; if (current != null) current.deny(); }
    private void askMedia(PermissionRequest request) {
        if (!visible || permissions.busy() || scans.id() != null || !policy.sameOrigin(request.getOrigin().toString()) || !policy.navigation(web.getUrl())) { request.deny(); return; }
        denyPendingMedia(); permission = request;
        List<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            String androidPermission = resource.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) ? Manifest.permission.RECORD_AUDIO : resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? Manifest.permission.CAMERA : null;
            if (androidPermission == null) { request.deny(); permission = null; return; }
            if (checkSelfPermission(androidPermission) != PackageManager.PERMISSION_GRANTED) needed.add(androidPermission);
        }
        if (needed.isEmpty()) { request.grant(request.getResources()); permission = null; }
        else {
            this.permissions.begin(10);
            try { requestPermissions(needed.toArray(new String[0]), 10); }
            catch (RuntimeException error) { this.permissions.finish(10); denyPendingMedia(); notice("无法请求相机或麦克风权限，请重新打开学生客户端。"); }
        }
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == 11) {
            if (!this.permissions.finish(11)) return;
            if (scans.id() == null) return;
            if (visible && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) showScanner();
            else finishScan("", "未开启相机权限，可以手动输入课堂码。");
            return;
        }
        if (code != 10) return;
        if (!this.permissions.finish(10)) return;
        if (permission != null) {
            PermissionRequest current = permission; permission = null;
            if (results.length > 0 && java.util.Arrays.stream(results).allMatch(value -> value == PackageManager.PERMISSION_GRANTED)) askMedia(current); else current.deny();
        }
    }
    private EditText input(String hint, boolean password) { EditText field = new EditText(this); field.setHint(hint); field.setSingleLine(); if (password) field.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD); return field; }
    private void verifyAdmin() {
        if (!admin.configured()) { configure(true); return; }
        EditText pin = input("教师管理码", true);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("教师设置").setView(pin).setNegativeButton("取消", null).setPositiveButton("验证", null).create();
        settingsDialog = dialog; dialog.setOnDismissListener(d -> { if (settingsDialog == dialog) settingsDialog = null; });
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try { if (!admin.verify(pin.getText().toString())) { pin.setError("管理码不正确"); return; } dialog.dismiss(); configure(false); } catch (Exception e) { pin.setError(e.getMessage()); }
        })); dialog.show();
    }
    private void configure(boolean first) {
        LinearLayout fields = new LinearLayout(this); fields.setPadding(24, 8, 24, 8); fields.setOrientation(LinearLayout.VERTICAL);
        TextView text = new TextView(this); text.setText("由教师配置课堂地址。本应用限制内部链接与窗口；学生自有设备仍可使用 Home 和系统应用切换。"); fields.addView(text);
        EditText address = input("https://教师电脑IP:8443/", false); address.setText(policy.address()); fields.addView(address);
        EditText pin = input(first ? "设置 6–12 位教师管理码" : "新管理码（留空保留）", true), confirm = input("再次输入管理码", true); fields.addView(pin); fields.addView(confirm);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle(first ? "首次设置 · 请交给教师" : "课堂连接设置").setView(fields).setNegativeButton("取消", null).setPositiveButton("保存并连接", null).create();
        settingsDialog = dialog; dialog.setOnDismissListener(d -> {
            if (settingsDialog == dialog) settingsDialog = null;
            if (!admin.configured()) connectionFailed("请交给教师完成首次设置，再连接课堂。");
        });
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                UrlPolicy next = new UrlPolicy(address.getText().toString().trim()); String secret = pin.getText().toString();
                if (first || !secret.isEmpty()) { if (!secret.equals(confirm.getText().toString())) throw new IllegalArgumentException("两次管理码不一致。"); admin.create(secret); }
                if (!policy.address().equals(next.address())) notice("课堂地址已更换。原地址的本地作品仍保留，需要先在原地址备份后导入新地址。");
                pageTrusted = false; exports.abort(); policy = next; prefs.edit().putString("address", policy.address()).commit(); dialog.dismiss(); web.loadUrl(policy.address());
            } catch (Exception e) { address.setError(e.getMessage()); }
        })); dialog.show();
    }
    @Override public void onBackPressed() { cancelStudentAuth(null, "登录已取消，可以重新选择登录方式。", true); if (web != null) web.evaluateJavascript("document.getElementById('studio-tab')?.click()", null); }
    @Override protected void onStart() { super.onStart(); visible = true; }
    @Override protected void onResume() {
        super.onResume(); if (web != null) {
            web.onResume(); nativeImportChanged();
            NativeStudentAuth.Pending flow = studentAuth.current();
            if (flow != null) web.postDelayed(() -> { if (studentAuth.returnedWithoutCallback(flow)) cancelStudentAuth(flow.id, "授权已取消，可以重新选择登录方式。", true); }, 800);
        }
    }
    @Override protected void onPause() { studentAuth.leftApp(); if (scanner != null) cancelScan(); super.onPause(); }
    @Override protected void onStop() {
        cancelScan(); visible = false; cancelFileChooser(); denyPendingMedia(); fallbackPull.cancel(); if (settingsDialog != null) settingsDialog.dismiss();
        // Runtime permission dialogs can pause this activity while it remains visible.
        // Only leaving the visible application cancels an in-progress media capture.
        if (web != null) { web.evaluateJavascript("window.dispatchEvent(new Event('freeimpro-background'))", null); web.onPause(); }
        super.onStop();
    }
    @Override protected void onDestroy() { cancelStudentAuth(null, "登录已取消。", false); authWorker.shutdown(); visible = false; pageTrusted = false; pageGeneration++; cancelScan(); cancelFileChooser(); denyPendingMedia(); exports.abort(); imports.clear(); importWorker.shutdownNow(); web.removeJavascriptInterface("FreeImproFiles"); web.removeJavascriptInterface("FreeImproAndroid"); web.destroy(); super.onDestroy(); }
}
