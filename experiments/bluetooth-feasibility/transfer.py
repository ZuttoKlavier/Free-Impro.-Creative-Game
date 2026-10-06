"""Hardware-free packet experiment, not a classroom authentication/transport API."""
import hashlib
import math
import struct
import time

HEADER = struct.Struct('!8sI')
MAX_PAYLOAD = 1_300_000


def identity(value):
    if not isinstance(value, (bytes, bytearray)) or len(value) != 8:
        raise ValueError('Invalid transfer ID')
    return bytes(value)


def payload_size(value):
    if type(value) is not int or not 0 < value <= MAX_PAYLOAD:
        raise ValueError('Transfer size outside classroom request limit')


def packet_limit(value):
    if type(value) is not int or not HEADER.size < value <= 512:
        raise ValueError('Invalid ATT payload size')


def chunks(payload, transfer_id, packet_size=20):
    transfer_id = identity(transfer_id)
    packet_limit(packet_size)
    if not isinstance(payload, (bytes, bytearray)):
        raise ValueError('Payload must contain bytes')
    payload_size(len(payload))
    step = packet_size - HEADER.size
    return [HEADER.pack(transfer_id, index) + payload[offset:offset + step]
            for index, offset in enumerate(range(0, len(payload), step))]


class Receiver:
    """Manifests are provided by the probe, never accepted from anonymous peers.

    Production needs authenticated, classroom-scoped manifests and acknowledgments.
    Registration here deliberately provides no network or user-identity endpoint.
    """
    def __init__(self, clock=time.monotonic, timeout=30):
        self.clock, self.timeout, self.pending = clock, timeout, {}

    def expire(self):
        now = self.clock()
        self.pending = {key: state for key, state in self.pending.items()
                        if now - state['updated'] < self.timeout}

    def register(self, transfer_id, size, digest, packet_size=20):
        transfer_id = identity(transfer_id)
        payload_size(size)
        packet_limit(packet_size)
        self.expire()
        if transfer_id in self.pending or len(self.pending) >= 50:
            raise ValueError('Invalid, duplicate or excess transfer')
        if (not isinstance(digest, str) or len(digest) != 64
                or any(c not in '0123456789abcdef' for c in digest)):
            raise ValueError('Invalid manifest')
        step = packet_size - HEADER.size
        self.pending[transfer_id] = {'size': size, 'digest': digest, 'step': step,
                                    'count': math.ceil(size / step), 'parts': {},
                                    'updated': self.clock()}

    def write(self, frame):
        self.expire()
        if not isinstance(frame, (bytes, bytearray)) or len(frame) <= HEADER.size:
            raise ValueError('Truncated packet')
        transfer_id, index = HEADER.unpack(frame[:HEADER.size])
        state = self.pending.get(transfer_id)
        if state is None or index >= state['count']:
            raise ValueError('Unknown transfer or invalid sequence')
        value = bytes(frame[HEADER.size:])
        expected = min(state['step'], state['size'] - index * state['step'])
        if len(value) != expected:
            raise ValueError('Invalid packet length')
        existing = state['parts'].get(index)
        if existing is not None and existing != value:
            raise ValueError('Conflicting retry')
        if existing is None:
            state['parts'][index] = value
            state['updated'] = self.clock()

    def finish(self, transfer_id):
        transfer_id = identity(transfer_id)
        self.expire()
        state = self.pending.get(transfer_id)
        if state is None:
            raise ValueError('Unknown or expired transfer')
        if len(state['parts']) != state['count']:
            raise ValueError('Missing packets; retry before completing')
        value = b''.join(state['parts'][index] for index in range(state['count']))
        if len(value) != state['size'] or hashlib.sha256(value).hexdigest() != state['digest']:
            del self.pending[transfer_id]
            raise ValueError('Integrity check failed')
        del self.pending[transfer_id]
        return value
