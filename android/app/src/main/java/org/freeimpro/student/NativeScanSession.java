package org.freeimpro.student;

/** A camera callback belongs to exactly one request, including reused request IDs. */
final class NativeScanSession {
    private long generation;
    private String id;
    long begin(String request) { id = request; return ++generation; }
    String id() { return id; }
    long generation() { return generation; }
    boolean active(long expected) { return id != null && expected == generation; }
    String finish(long expected) {
        if (!active(expected)) return null;
        String finished = id; id = null; generation++; return finished;
    }
}
