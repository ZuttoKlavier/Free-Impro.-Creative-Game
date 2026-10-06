package org.freeimpro.student;

/** Fallback gesture used only when the loaded document did not initialize. */
final class PullReloadGesture {
    private final float threshold;
    private float startX, startY;
    private boolean tracking;
    PullReloadGesture(float density) { threshold = 80 * density; }
    void begin(float x, float y, int pointers, boolean atTop) { startX = x; startY = y; tracking = pointers == 1 && atTop; }
    boolean move(float x, float y, int pointers, boolean atTop) {
        if (pointers != 1 || !atTop || Math.abs(x - startX) > Math.max(20, Math.abs(y - startY))) cancel();
        return tracking && y - startY >= threshold;
    }
    boolean end(float x, float y, int pointers, boolean atTop) { boolean ready = move(x, y, pointers, atTop); cancel(); return ready; }
    void cancel() { tracking = false; }
}
