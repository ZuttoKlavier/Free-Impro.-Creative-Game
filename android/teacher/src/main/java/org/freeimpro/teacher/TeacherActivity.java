package org.freeimpro.teacher;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Message;
import android.net.Uri;
import android.net.http.SslError;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.*;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public final class TeacherActivity extends Activity {
    private WebView web;
    private TeacherUrlPolicy policy;
    private TextView status;
    private LinearLayout layout;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private boolean failed;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        policy = new TeacherUrlPolicy(getPreferences(MODE_PRIVATE).getString("address", BuildConfig.CLASSROOM_URL));
        layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setFitsSystemWindows(true);
        LinearLayout toolbar = new LinearLayout(this); status = new TextView(this); status.setText("声音课堂 · 教师工作台"); status.setPadding(12, 10, 8, 10);
        Button reconnect = new Button(this); reconnect.setText("重新连接"); reconnect.setOnClickListener(v -> web.loadUrl(policy.page()));
        Button settings = new Button(this); settings.setText("课堂地址"); settings.setOnClickListener(v -> settings());
        toolbar.addView(status, new LinearLayout.LayoutParams(0, -2, 1)); toolbar.addView(reconnect); toolbar.addView(settings); layout.addView(toolbar);
        web = new WebView(this); layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(layout);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings options = web.getSettings(); options.setJavaScriptEnabled(true); options.setDomStorageEnabled(true); options.setAllowFileAccess(false); options.setAllowContentAccess(false); options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); options.setSupportMultipleWindows(true); options.setJavaScriptCanOpenWindowsAutomatically(false); options.setGeolocationEnabled(false); options.setUserAgentString(options.getUserAgentString() + " FreeImproTeacher/1");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setOnLongClickListener(v -> true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !policy.navigation(request.getUrl().toString()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return policy.resource(request.getUrl().toString()) ? null : blocked(); }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { failed = false; status.setText("正在连接教师工作台…"); if (!policy.navigation(url)) { view.stopLoading(); failure("教师端不打开其他页面"); } }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); failure("证书不匹配，请核对课堂地址和安装包"); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { if (request.isForMainFrame()) failure("未连接课堂，请检查 Wi-Fi 并重试"); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { if (request.isForMainFrame()) failure("课堂服务暂不可用，请重试"); }
            @Override public void onPageFinished(WebView view, String url) { if (!failed && policy.navigation(url)) status.setText("声音课堂 · 教师工作台"); }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() { @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return policy.resource(request.getUrl().toString()) ? null : blocked(); } });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message message) { return false; }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) { callback.onReceiveValue(null); return true; }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) { if (fullscreen != null) { callback.onCustomViewHidden(); return; } fullscreen = view; fullscreenCallback = callback; layout.setVisibility(View.GONE); addContentView(view, new android.view.ViewGroup.LayoutParams(-1, -1)); }
            @Override public void onHideCustomView() { closeFullscreen(); }
        });
        web.loadUrl(policy.page());
    }
    private static WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
    private void failure(String message) { failed = true; status.setText(message); }
    private void closeFullscreen() { if (fullscreen == null) return; ((android.view.ViewGroup) fullscreen.getParent()).removeView(fullscreen); fullscreen = null; layout.setVisibility(View.VISIBLE); fullscreenCallback.onCustomViewHidden(); fullscreenCallback = null; }
    private void settings() {
        EditText field = new EditText(this); field.setSingleLine(); field.setText(policy.address());
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("教师课堂服务地址").setMessage("修改或重新连接会停止当前演奏。学生与教师使用同一课堂服务。").setView(field).setNegativeButton("取消", null).setPositiveButton("连接", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try { TeacherUrlPolicy next = new TeacherUrlPolicy(field.getText().toString()); if (!getPreferences(MODE_PRIVATE).edit().putString("address", next.address()).commit()) throw new IllegalArgumentException("无法保存地址，请重试"); policy = next; dialog.dismiss(); web.loadUrl(policy.page()); } catch (Exception error) { field.setError(error.getMessage()); }
        })); dialog.show();
    }
    @Override public void onBackPressed() { if (fullscreen != null) closeFullscreen(); else new AlertDialog.Builder(this).setMessage("退出教师端将停止演奏。").setNegativeButton("继续课堂", null).setPositiveButton("退出", (d, w) -> finish()).show(); }
    @Override protected void onStop() { web.evaluateJavascript("window.dispatchEvent(new Event('freeimpro-teacher-background'))", null); super.onStop(); }
    @Override protected void onDestroy() { closeFullscreen(); web.destroy(); super.onDestroy(); }
}
