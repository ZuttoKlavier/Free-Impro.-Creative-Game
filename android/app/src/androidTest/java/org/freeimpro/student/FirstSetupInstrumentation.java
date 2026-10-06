package org.freeimpro.student;

import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import java.lang.reflect.Field;

/** Device regression for a fresh install. Existing teacher configuration is never reset. */
public final class FirstSetupInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private Object field(MainActivity activity, String name) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true); return field.get(activity);
    }
    private void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private interface UiCheck { void run() throws Exception; }
    private void onUi(UiCheck check) throws Throwable {
        Throwable[] failure = new Throwable[1];
        runOnMainSync(() -> { try { check.run(); } catch (Throwable error) { failure[0] = error; } });
        if (failure[0] != null) throw failure[0];
    }
    @Override public void onStart() {
        Bundle result = new Bundle(); MainActivity activity = null;
        try {
            if (new AdminLock(getTargetContext().getSharedPreferences("classroom", 0)).configured()) {
                result.putString("stream", "SKIPPED: use a fresh test installation; existing teacher settings were preserved.\n");
                finish(-1, result); return;
            }
            Bundle status = new Bundle(); status.putString("id", "InstrumentationTestRunner"); status.putString("class", getClass().getName()); status.putString("test", "firstSetupCancellationCanReopenProtectedSettings"); status.putInt("numtests", 1); status.putInt("current", 1); sendStatus(1, status);
            activity = (MainActivity) startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            MainActivity current = activity; waitForIdleSync();
            onUi(() -> ((AlertDialog) field(current, "settingsDialog")).getButton(AlertDialog.BUTTON_NEGATIVE).performClick());
            waitForIdleSync();
            onUi(() -> {
                require(Boolean.TRUE.equals(field(current, "mainPageFailed")), "Cancelling first setup must expose recovery.");
                require(!Boolean.TRUE.equals(field(current, "pageTrusted")), "A cancelled first setup must not trust the blank page.");
                LinearLayout actions = (LinearLayout) field(current, "failureActions"); require(actions.getVisibility() == View.VISIBLE, "Recovery settings must be visible.");
                ((Button) actions.getChildAt(0)).performClick();
            });
            waitForIdleSync();
            onUi(() -> require(((AlertDialog) field(current, "settingsDialog")).isShowing(), "Recovery must reopen the initial teacher setup."));
            status.putString("stream", "."); sendStatus(0, status); result.putString("stream", "OK (1 test)\n");
        } catch (Throwable error) { result.putString("stream", "FAIL: " + error + "\n"); result.putString("shortMsg", error.toString()); finish(0, result); return; }
        finally { if (activity != null) { MainActivity current = activity; runOnMainSync(current::finish); } }
        finish(-1, result);
    }
}
