# Bluetooth library feasibility probe

2026-10-06: tested `bless==0.3.0` (MIT) and `bleak==3.0.2` (MIT), based on the upstream [Bless release](https://github.com/kevincar/bless/tree/v0.3.0), [versioned example](https://github.com/kevincar/bless/blob/v0.3.0/examples/server.py) and [Bleak release](https://github.com/hbldh/bleak/tree/v3.0.2). Dependencies are isolated from the classroom app.

```sh
python3 -m venv /tmp/empvc-ble-probe
/tmp/empvc-ble-probe/bin/python -m pip install -r experiments/bluetooth-feasibility/requirements.txt
/tmp/empvc-ble-probe/bin/python experiments/bluetooth-feasibility/probe.py
```

The probe calls real macOS CoreBluetooth-backed Bless service and characteristic objects, then writes/reads packet bytes through the characteristic. It does not start a peripheral manager, advertise, pair, scan or use a physical radio. Nine packet tests cover MTU 20/185/512, 50 interleaved sessions, duplicate retry, missing packets, corrupted data, malformed manifests, bounds, expiration and releasing all 50 occupied slots. Repeated copies of an already received frame cannot prolong a stalled session. The probe writes `results.json` only after all checks succeed.

An actual integration failure was reproduced when combining the default-branch example's `GATTAttributePermissions.writable` with release 0.3.0, which provides `writeable`: it raises `AttributeError`. The versioned example and this probe use `writeable`; no upstream package is patched. This is a source/version mismatch, not evidence that pinned Bless cannot transfer data.

The packet receiver is an independent laboratory implementation, not copied upstream code. It accepts pre-registered test manifests; it does not authenticate students or expose any endpoint. The product still needs an Android sender, Windows/macOS receiver application, classroom-scoped identity, authenticated manifests, acknowledgment/reconnect handling, fair transfer queues and physical device tests. Windows installation also has platform-specific dependencies in upstream `setup.py`, which have not been validated here. **A23 remains incomplete; this experiment is not connected to the production classroom.**
