import errno
import socket
import unittest

from fixture.rows import ROOT


class NetworkTests(unittest.TestCase):
    def test_unit_process_cannot_connect_or_resolve_addresses(self):
        with socket.socket() as client:
            for connect in (client.connect, client.connect_ex):
                with self.assertRaises(OSError) as error:
                    connect(("127.0.0.1", 80))
                self.assertEqual(error.exception.errno, errno.ENETUNREACH)
        with socket.socket(type=socket.SOCK_DGRAM) as client:
            with self.assertRaises(OSError) as error:
                client.sendto(b"payload", ("127.0.0.1", 80))
            self.assertEqual(error.exception.errno, errno.ENETUNREACH)
        with self.assertRaises(OSError) as error:
            socket.getaddrinfo("unmocked.invalid", 443)
        self.assertEqual(error.exception.errno, errno.ENETUNREACH)
