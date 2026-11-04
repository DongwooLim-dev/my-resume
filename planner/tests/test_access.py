"""No DB access or mutations: pure access decisions and input validation."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import TaskInput, can_edit
from pydantic import ValidationError
from starlette.requests import Request


def fake_request(host='localhost:18080', source='127.0.0.1', peer='127.0.0.1'):
    headers = [(b'host', host.encode())]
    if source is not None:
        headers.append((b'x-planner-client', source.encode()))
    return Request({'type': 'http', 'method': 'GET', 'scheme': 'http',
        'path': '/planner/api/config', 'query_string': b'', 'headers': headers,
        'server': ('127.0.0.1', 8765), 'client': (peer, 10000)})


class AccessTests(unittest.TestCase):
    def test_ssh_tunnel(self):
        self.assertTrue(can_edit(fake_request()))

    def test_direct_local_backend(self):
        self.assertTrue(can_edit(fake_request(source=None)))

    def test_public_host_is_read_only(self):
        self.assertFalse(can_edit(fake_request(host='20.41.105.49')))

    def test_spoofed_local_host_is_not_enough(self):
        self.assertFalse(can_edit(fake_request(source='203.0.113.1')))

    def test_malformed_source_is_denied(self):
        self.assertFalse(can_edit(fake_request(source='invalid')))

    def test_nonlocal_peer_is_denied(self):
        self.assertFalse(can_edit(fake_request(peer='203.0.113.1')))

    def test_ipv6_loopback(self):
        self.assertTrue(can_edit(fake_request(host='[::1]:18080', source='::1', peer='::1')))


class ValidationTests(unittest.TestCase):
    def test_title_trim(self):
        self.assertEqual(TaskInput(title=' sample ', task_date='2026-11-04').title, 'sample')

    def test_empty_title(self):
        with self.assertRaises(ValidationError):
            TaskInput(title=' ', task_date='2026-11-04')

    def test_invalid_time_range(self):
        with self.assertRaises(ValidationError):
            TaskInput(title='sample', task_date='2026-11-04', start_time='10:00', end_time='09:00')

    def test_end_requires_start(self):
        with self.assertRaises(ValidationError):
            TaskInput(title='sample', task_date='2026-11-04', end_time='10:00')

    def test_invalid_date(self):
        with self.assertRaises(ValidationError):
            TaskInput(title='sample', task_date='invalid')


if __name__ == '__main__':
    unittest.main()
