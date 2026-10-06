"""Call real Bless macOS GATT objects without starting a radio or advertising."""
import asyncio
import hashlib
import importlib.metadata
import json
import random
import struct
import sys
import unittest
from pathlib import Path

from transfer import HEADER, Receiver, chunks


class PacketTests(unittest.TestCase):
    def manifest(self, receiver, data, transfer_id=b'fixture1', packet_size=20):
        receiver.register(transfer_id, len(data), hashlib.sha256(data).hexdigest(), packet_size)
        return chunks(data, transfer_id, packet_size)

    def test_legacy_and_negotiated_mtu(self):
        data = b'bounded sample and transparent image' * 100
        for packet_size in (20, 185, 512):
            receiver = Receiver()
            frames = self.manifest(receiver, data, packet_size=packet_size)
            self.assertTrue(all(len(frame) <= packet_size for frame in frames))
            for frame in frames: receiver.write(frame)
            self.assertEqual(receiver.finish(b'fixture1'), data)

    def test_50_interleaved_transfers_do_not_mix_students(self):
        receiver, expected, packets = Receiver(), {}, []
        for index in range(50):
            transfer_id = index.to_bytes(8, 'big')
            data = json.dumps({'requestId': index, 'audio': str(index) * 100, 'image': 'photo'}).encode()
            expected[transfer_id] = data
            packets.extend(self.manifest(receiver, data, transfer_id, 185))
        random.Random(42).shuffle(packets)
        for frame in packets: receiver.write(frame)
        for transfer_id, data in expected.items(): self.assertEqual(receiver.finish(transfer_id), data)
        self.assertEqual(receiver.pending, {})

    def test_missing_packets_and_idempotent_retries(self):
        receiver, data = Receiver(), b'original sound and image' * 10
        frames = self.manifest(receiver, data)
        for frame in frames[:-1]: receiver.write(frame); receiver.write(frame)
        with self.assertRaises(ValueError): receiver.finish(b'fixture1')
        receiver.write(frames[-1])
        self.assertEqual(receiver.finish(b'fixture1'), data)

    def test_corruption_is_not_committed(self):
        receiver, data = Receiver(), b'original sound'
        frames = self.manifest(receiver, data)
        frames[0] = frames[0][:-1] + bytes([frames[0][-1] ^ 1])
        for frame in frames: receiver.write(frame)
        with self.assertRaises(ValueError): receiver.finish(b'fixture1')
        self.assertNotIn(b'fixture1', receiver.pending)

    def test_bounds_unknown_ids_and_conflicting_retries(self):
        receiver = Receiver()
        frame = self.manifest(receiver, b'sample payload')[0]
        for bad in (b'', frame[:HEADER.size], struct.pack('!8sI', b'unknown1', 0) + b'x', struct.pack('!8sI', b'fixture1', 999) + b'x', frame + b'x'):
            with self.assertRaises(ValueError): receiver.write(bad)
        receiver.write(frame)
        with self.assertRaises(ValueError): receiver.write(frame[:-1] + bytes([frame[-1] ^ 1]))
        for size in (0, 1_300_001):
            with self.assertRaises(ValueError): receiver.register(b'fixture2', size, '0' * 64)

    def test_timeout_releases_slots_without_extending_other_students(self):
        clock = [0.0]
        receiver = Receiver(clock=lambda: clock[0], timeout=30)
        self.manifest(receiver, b'first', b'student1')
        clock[0] = 15
        second = self.manifest(receiver, b'second', b'student2')
        clock[0] = 30
        receiver.write(second[0])
        self.assertNotIn(b'student1', receiver.pending)
        self.assertEqual(receiver.finish(b'student2'), b'second')

    def test_malformed_manifests_and_unknown_finish_fail_without_partial_state(self):
        receiver, digest = Receiver(), hashlib.sha256(b'x').hexdigest()
        for transfer_id, size, hash_value, packet_size in (
            ('fixture1', 1, digest, 20), (None, 1, digest, 20),
            (b'fixture1', True, digest, 20), (b'fixture1', 1.0, digest, 20),
            (b'fixture1', 1, None, 20), (b'fixture1', 1, digest, 20.5),
            (b'fixture1', 1, digest, True),
        ):
            with self.assertRaises(ValueError):
                receiver.register(transfer_id, size, hash_value, packet_size)
            self.assertEqual(receiver.pending, {})
        for value in (b'unknown1', None, 'fixture1'):
            with self.assertRaises(ValueError): receiver.finish(value)
        with self.assertRaises(ValueError): chunks('text', b'fixture1')
        with self.assertRaises(ValueError): chunks(b'x', b'fixture1', 20.5)
        with self.assertRaises(ValueError): receiver.write(None)

    def test_identical_retries_cannot_keep_a_stalled_transfer_alive(self):
        clock = [0.0]
        receiver = Receiver(clock=lambda: clock[0], timeout=30)
        packets = self.manifest(receiver, b'payload requiring multiple packets')
        receiver.write(packets[0])
        clock[0] = 29
        receiver.write(packets[0])
        clock[0] = 30
        with self.assertRaises(ValueError): receiver.finish(b'fixture1')
        self.assertEqual(receiver.pending, {})

    def test_fifty_transfer_limit_reopens_only_after_a_slot_is_released(self):
        receiver = Receiver()
        for index in range(50):
            receiver.register(index.to_bytes(8, 'big'), 1, hashlib.sha256(b'x').hexdigest())
        with self.assertRaises(ValueError):
            receiver.register(b'overflow', 1, hashlib.sha256(b'x').hexdigest())
        receiver.write(chunks(b'x', bytes(8))[0])
        self.assertEqual(receiver.finish(bytes(8)), b'x')
        receiver.register(b'overflow', 1, hashlib.sha256(b'x').hexdigest())
        self.assertEqual(len(receiver.pending), 50)


async def real_library_probe():
    from bless import GATTCharacteristicProperties, GATTAttributePermissions
    if sys.platform != 'darwin':
        return {'library_import': True, 'gatt_roundtrip': None, 'reason': 'macOS backend probe only', 'hardware_used': False}
    from bless.backends.corebluetooth.service import BlessGATTServiceCoreBluetooth
    from bless.backends.corebluetooth.characteristic import BlessGATTCharacteristicCoreBluetooth
    service = BlessGATTServiceCoreBluetooth('45af9350-7fce-47f7-961c-d01c760c0a01')
    await service.init(None)
    # Bless 0.3.0 spells this permission writeable; default-branch examples use
    # writable. Pinning both source examples and packages prevents this mismatch.
    characteristic = BlessGATTCharacteristicCoreBluetooth(
        '45af9350-7fce-47f7-961c-d01c760c0a02',
        GATTCharacteristicProperties.read | GATTCharacteristicProperties.write,
        GATTAttributePermissions.readable | GATTAttributePermissions.writeable, bytearray())
    await characteristic.init(service); service.add_characteristic(characteristic)
    receiver, payload = Receiver(), b'EMPVC sound/image transfer fixture' * 100
    transfer_id = b'library1'
    receiver.register(transfer_id, len(payload), hashlib.sha256(payload).hexdigest())
    for frame in chunks(payload, transfer_id):
        characteristic.value = bytearray(frame)
        receiver.write(characteristic.value)
    assert receiver.finish(transfer_id) == payload
    assert service.get_characteristic(characteristic.uuid) is characteristic
    assert characteristic.service_uuid == service.uuid
    return {'library_import': True, 'gatt_roundtrip': True, 'hardware_used': False}


if __name__ == '__main__':
    tests = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(PacketTests))
    if not tests.wasSuccessful(): sys.exit(1)
    result = {'bless': importlib.metadata.version('bless'), 'bleak': importlib.metadata.version('bleak'),
              'packet_tests_passed': tests.testsRun, 'library': asyncio.run(real_library_probe()),
              'classroom_integrated': False, 'android_windows_radio_tested': False}
    Path(__file__).with_name('results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
