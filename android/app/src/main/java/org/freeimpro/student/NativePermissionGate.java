package org.freeimpro.student;

/** Keep a permission dialog reserved until Android delivers its result, even after cancellation. */
final class NativePermissionGate {
    private int pending;
    boolean busy() { return pending != 0; }
    boolean begin(int request) { if (request == 0 || busy()) return false; pending = request; return true; }
    boolean finish(int request) { if (pending != request || request == 0) return false; pending = 0; return true; }
}
