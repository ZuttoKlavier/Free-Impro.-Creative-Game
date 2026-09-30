package org.freeimpro.student;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    private WebView web;
    private UrlPolicy policy;
    private SharedPreferences prefs;
    private AdminLock admin;
    private LocalExports exports;
    private PermissionRequest permission;
    private ValueCallback<Uri[]> chooser;
    private AlertDialog chooserDialog;
    private boolean visible;
    private boolean requestingPermissions;
    private boolean mainPageFailed;
    private TextView status;
    private Button reconnect;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("classroom", MODE_PRIVATE); admin = new AdminLock(prefs);
        policy = new UrlPolicy(prefs.getString("address", BuildConfig.CLASSROOM_URL));
        exports = new LocalExports(getContentResolver());
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setFitsSystemWindows(true);
        LinearLayout toolbar = new LinearLayout(this); status = new TextView(this); status.setText("声音课堂 · 学生客户端"); status.setPadding(20, 12, 8, 12);
        Button settings = new Button(this); settings.setText("教师设置"); settings.setOnClickListener(v -> verifyAdmin());
        reconnect = new Button(this); reconnect.setText("重新连接"); reconnect.setVisibility(View.GONE);
        reconnect.setOnClickListener(v -> web.loadUrl(policy.address()));
        toolbar.addView(status, new LinearLayout.LayoutParams(0, -2, 1)); toolbar.addView(reconnect); toolbar.addView(settings);
        layout.addView(toolbar); web = new WebView(this); layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(layout);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setJavaScriptCanOpenWindowsAutomatically(false); s.setSupportMultipleWindows(true);
        s.setGeolocationEnabled(false); s.setMediaPlaybackRequiresUserGesture(true); s.setSafeBrowsingEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " FreeImproStudent/1");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setOnLongClickListener(v -> true); web.setLongClickable(false);
        web.setDownloadListener((url, agent, disposition, mime, length) -> notice("请使用作品库中的导出功能，文件会保存在本机 Download/FreeImpro。"));
        web.addJavascriptInterface(exports, "FreeImproFiles");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { boolean blocked = !policy.navigation(request.getUrl().toString()); if (blocked) notice("学生客户端只允许课堂内的功能。"); return blocked; }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                mainPageFailed = false; reconnect.setVisibility(View.GONE); cancelFileChooser(); denyPendingMedia();
                if (!policy.navigation(url)) { view.stopLoading(); connectionFailed("已拦截课堂外页面"); }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return policy.resource(request.getUrl().toString()) ? null : denied(); }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); connectionFailed("证书验证失败，请教师检查课堂地址与证书"); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) connectionFailed("未连接课堂；确认 Wi-Fi 后点重新连接"); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { if (request.isForMainFrame()) connectionFailed("课堂服务暂不可用，请稍后重新连接"); }
            @Override public void onPageFinished(WebView view, String url) { if (!mainPageFailed && policy.navigation(url)) status.setText("声音课堂 · 学生客户端"); }
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
    }
    private static WebResourceResponse denied() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    private void connectionFailed(String message) { mainPageFailed = true; status.setText(message); reconnect.setVisibility(View.VISIBLE); }
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
        if (!visible || requestingPermissions || !policy.sameOrigin(request.getOrigin().toString()) || !policy.navigation(web.getUrl())) { request.deny(); return; }
        denyPendingMedia(); permission = request;
        List<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            String androidPermission = resource.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) ? Manifest.permission.RECORD_AUDIO : resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? Manifest.permission.CAMERA : null;
            if (androidPermission == null) { request.deny(); permission = null; return; }
            if (checkSelfPermission(androidPermission) != PackageManager.PERMISSION_GRANTED) needed.add(androidPermission);
        }
        if (needed.isEmpty()) { request.grant(request.getResources()); permission = null; }
        else {
            requestingPermissions = true;
            try { requestPermissions(needed.toArray(new String[0]), 10); }
            catch (RuntimeException error) { requestingPermissions = false; denyPendingMedia(); notice("无法请求相机或麦克风权限，请重新打开学生客户端。"); }
        }
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != 10) return;
        requestingPermissions = false;
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
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                UrlPolicy next = new UrlPolicy(address.getText().toString().trim()); String secret = pin.getText().toString();
                if (first || !secret.isEmpty()) { if (!secret.equals(confirm.getText().toString())) throw new IllegalArgumentException("两次管理码不一致。"); admin.create(secret); }
                if (!policy.address().equals(next.address())) notice("课堂地址已更换。原地址的本地作品仍保留，需要先在原地址备份后导入新地址。");
                policy = next; prefs.edit().putString("address", policy.address()).commit(); dialog.dismiss(); web.loadUrl(policy.address());
            } catch (Exception e) { address.setError(e.getMessage()); }
        })); dialog.show();
    }
    @Override public void onBackPressed() { if (web != null) web.evaluateJavascript("document.getElementById('studio-tab')?.click()", null); }
    @Override protected void onStart() { super.onStart(); visible = true; }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onStop() {
        visible = false; cancelFileChooser(); denyPendingMedia();
        // Runtime permission dialogs can pause this activity while it remains visible.
        // Only leaving the visible application cancels an in-progress media capture.
        if (web != null) { web.evaluateJavascript("window.dispatchEvent(new Event('freeimpro-background'))", null); web.onPause(); }
        super.onStop();
    }
    @Override protected void onDestroy() { visible = false; cancelFileChooser(); denyPendingMedia(); exports.abort(); web.removeJavascriptInterface("FreeImproFiles"); web.destroy(); super.onDestroy(); }
}
