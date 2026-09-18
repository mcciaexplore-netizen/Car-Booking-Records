"""Offline tests only: every OAuth request is mocked, all credentials are fixtures."""

import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import requests

from scripts import zoho_token_exchange as zoho


FIXTURE_ID = "fixture-client-id"
FIXTURE_SECRET = "fixture-client-secret"
FIXTURE_CODE = "fixture-one-time-code"
FIXTURE_ACCESS = "fixture-access-token"
FIXTURE_REFRESH = "fixture-refresh-token"
ENV = {"ZOHO_CLIENT_ID": FIXTURE_ID, "ZOHO_CLIENT_SECRET": FIXTURE_SECRET, "ZOHO_GRANT_TOKEN": FIXTURE_CODE}
SUCCESS = {"access_token": FIXTURE_ACCESS, "refresh_token": FIXTURE_REFRESH, "api_domain": "https://www.zohoapis.in"}


class Response:
    def __init__(self, data=None, status=200, body=None):
        self.status_code = status
        self.body = json.dumps(data).encode() if body is None else body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def iter_content(self, chunk_size):
        for offset in range(0, len(self.body), chunk_size):
            yield self.body[offset:offset + chunk_size]


class ExchangeTests(unittest.TestCase):
    def exchange(self):
        return zoho.exchange(FIXTURE_ID, FIXTURE_SECRET, FIXTURE_CODE, "IN")

    def test_uses_correct_post_body_timeout_and_no_redirects(self):
        with patch.object(zoho.requests, "post", return_value=Response(SUCCESS)) as post:
            values = self.exchange()
        post.assert_called_once()
        args, kwargs = post.call_args
        self.assertEqual(args, ("https://accounts.zoho.in/oauth/v2/token",))
        self.assertEqual(kwargs["data"], {"grant_type": "authorization_code", "client_id": FIXTURE_ID, "client_secret": FIXTURE_SECRET, "code": FIXTURE_CODE})
        self.assertFalse(kwargs["allow_redirects"])
        self.assertEqual(kwargs["timeout"], (5, 20))
        self.assertEqual(values["ZOHO_REFRESH_TOKEN"], FIXTURE_REFRESH)
        self.assertNotIn(FIXTURE_ACCESS, values.values())
        self.assertNotIn(FIXTURE_CODE, values.values())

    def test_regional_endpoint_and_api_domain_must_agree(self):
        with patch.object(zoho.requests, "post", return_value=Response({**SUCCESS, "api_domain": "https://www.zohoapis.eu"})) as post:
            values = zoho.exchange(FIXTURE_ID, FIXTURE_SECRET, FIXTURE_CODE, "EU")
            self.assertEqual(post.call_args.args[0], "https://accounts.zoho.eu/oauth/v2/token")
            self.assertEqual(values["ZOHO_DC"], "EU")
        for domain in (None, "https://www.zohoapis.in.evil.example", "https://www.zohoapis.eu"):
            with self.subTest(domain=domain), patch.object(zoho.requests, "post", return_value=Response({**SUCCESS, "api_domain": domain})):
                with self.assertRaises(zoho.SetupError):
                    self.exchange()

    def test_invalid_credentials_or_region_do_not_make_request(self):
        with patch.object(zoho.requests, "post") as post:
            for value in ("", "contains\nnewline", None):
                with self.subTest(value=value), self.assertRaises(zoho.SetupError):
                    zoho.exchange(FIXTURE_ID, value, FIXTURE_CODE, "IN")
            with self.assertRaises(zoho.SetupError):
                zoho.exchange(FIXTURE_ID, FIXTURE_SECRET, FIXTURE_CODE, "https://untrusted.example")
            post.assert_not_called()

    def test_http_200_oauth_error_is_failure_without_reflecting_details(self):
        for code in ("invalid_code", FIXTURE_SECRET, {"nested": FIXTURE_SECRET}):
            with self.subTest(code=code), patch.object(zoho.requests, "post", return_value=Response({"error": code, "details": FIXTURE_SECRET})):
                with self.assertRaises(zoho.SetupError) as caught:
                    self.exchange()
                self.assertNotIn(FIXTURE_SECRET, str(caught.exception))

    def test_missing_refresh_token_or_access_token_is_failure(self):
        for key in ("refresh_token", "access_token"):
            response = dict(SUCCESS)
            del response[key]
            with self.subTest(key=key), patch.object(zoho.requests, "post", return_value=Response(response)):
                with self.assertRaises(zoho.SetupError):
                    self.exchange()

    def test_html_invalid_structure_and_large_responses_are_rejected(self):
        for body in (b"<html>not json</html>", b"[]", b"x" * (zoho.MAX_RESPONSE_BYTES + 1)):
            with self.subTest(size=len(body)), patch.object(zoho.requests, "post", return_value=Response(body=body)):
                with self.assertRaises(zoho.SetupError):
                    self.exchange()

    def test_redirect_rate_limit_and_service_failure_are_not_retried(self):
        for status in (302, 401, 429, 503):
            with self.subTest(status=status), patch.object(zoho.requests, "post", return_value=Response({"detail": FIXTURE_SECRET}, status=status)) as post:
                with self.assertRaises(zoho.SetupError) as caught:
                    self.exchange()
                self.assertNotIn(FIXTURE_SECRET, str(caught.exception))
                post.assert_called_once()

    def test_network_errors_do_not_leak_exception_text_or_retry(self):
        for error in (requests.Timeout(FIXTURE_SECRET), requests.ConnectionError(FIXTURE_CODE)):
            with self.subTest(error=type(error).__name__), patch.object(zoho.requests, "post", side_effect=error) as post:
                with self.assertRaises(zoho.SetupError) as caught:
                    self.exchange()
                self.assertNotIn(FIXTURE_SECRET, str(caught.exception))
                self.assertNotIn(FIXTURE_CODE, str(caught.exception))
                post.assert_called_once()

    def test_no_visible_input_fallback(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(zoho.sys.stdin, "isatty", return_value=False):
            with self.assertRaises(zoho.SetupError):
                zoho.read_secret("ZOHO_GRANT_TOKEN", "Code: ")
        with patch.dict(os.environ, {}, clear=True), patch.object(zoho.sys.stdin, "isatty", return_value=True), patch.object(zoho.getpass, "getpass", side_effect=zoho.getpass.GetPassWarning):
            with self.assertRaises(zoho.SetupError):
                zoho.read_secret("ZOHO_GRANT_TOKEN", "Code: ")

    def test_encryption_failure_prevents_token_consumption(self):
        with patch.object(zoho, "protect", side_effect=zoho.SetupError("Encryption unavailable.")), patch.object(zoho.requests, "post") as post, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(zoho.main(["--dc", "IN"]), 1)
            post.assert_not_called()


@unittest.skipUnless(os.name == "nt", "Windows DPAPI integration")
class ProtectedStorageTests(unittest.TestCase):
    def test_success_encrypts_and_check_never_prints_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credentials.dpapi"
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch.dict(os.environ, ENV), patch.object(zoho.requests, "post", return_value=Response(SUCCESS)) as post, contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                self.assertEqual(zoho.main(["--dc", "IN", "--bundle", str(path)]), 0)
                self.assertEqual(zoho.main(["--check", "--bundle", str(path)]), 0)
                post.assert_called_once()
            values = zoho.load_credentials(path)
            self.assertEqual(values["ZOHO_REFRESH_TOKEN"], FIXTURE_REFRESH)
            for value in (*ENV.values(), FIXTURE_ACCESS, FIXTURE_REFRESH):
                self.assertNotIn(value, stdout.getvalue() + stderr.getvalue())
                self.assertNotIn(value.encode(), path.read_bytes())

    def test_existing_file_is_never_overwritten_or_code_consumed(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credentials.dpapi"
            path.write_bytes(b"existing protected credentials")
            with patch.object(zoho.requests, "post") as post, contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(zoho.main(["--dc", "IN", "--bundle", str(path)]), 1)
                post.assert_not_called()
            self.assertEqual(path.read_bytes(), b"existing protected credentials")

    def test_failed_exchange_removes_only_new_empty_bundle(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credentials.dpapi"
            with patch.dict(os.environ, ENV), patch.object(zoho.requests, "post", return_value=Response({"error": "invalid_code"})), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(zoho.main(["--dc", "IN", "--bundle", str(path)]), 1)
            self.assertFalse(path.exists())
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_final_filename_does_not_exist_while_waiting_for_credentials(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credentials.dpapi"

            def read_secret(name, prompt):
                self.assertFalse(path.exists())
                return ENV[name]

            with patch.object(zoho, "read_secret", side_effect=read_secret), patch.object(zoho.requests, "post", return_value=Response(SUCCESS)), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(zoho.main(["--dc", "IN", "--bundle", str(path)]), 0)
            self.assertEqual(list(Path(folder).iterdir()), [path])

    def test_empty_existing_bundle_is_explained_without_consuming_code(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credentials.dpapi"
            path.touch()
            stderr = io.StringIO()
            with patch.object(zoho.requests, "post") as post, contextlib.redirect_stderr(stderr):
                self.assertEqual(zoho.main(["--dc", "IN", "--bundle", str(path)]), 1)
                self.assertEqual(zoho.main(["--check", "--bundle", str(path)]), 1)
                post.assert_not_called()
            self.assertIn("empty", stderr.getvalue())
            self.assertEqual(path.read_bytes(), b"")

    def test_finalization_failure_retains_encrypted_response_for_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credentials.dpapi"
            stderr = io.StringIO()
            with patch.dict(os.environ, ENV), patch.object(zoho.requests, "post", return_value=Response(SUCCESS)), patch.object(Path, "rename", side_effect=FileExistsError), contextlib.redirect_stderr(stderr):
                self.assertEqual(zoho.main(["--dc", "IN", "--bundle", str(path)]), 1)
            self.assertFalse(path.exists())
            pending = list(Path(folder).glob("*.pending.dpapi"))
            self.assertEqual(len(pending), 1)
            self.assertEqual(zoho.load_credentials(pending[0])["ZOHO_REFRESH_TOKEN"], FIXTURE_REFRESH)
            self.assertNotIn(FIXTURE_REFRESH, stderr.getvalue())
            self.assertIn(str(pending[0]), stderr.getvalue())

    def test_cancelled_input_does_not_leave_final_or_pending_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "credentials.dpapi"
            with patch.object(zoho, "read_secret", side_effect=KeyboardInterrupt), patch.object(zoho.requests, "post") as post, contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(zoho.main(["--dc", "IN", "--bundle", str(path)]), 1)
                post.assert_not_called()
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_ciphertext_tampering_is_rejected(self):
        ciphertext = bytearray(zoho.protect(b"private fixture data"))
        ciphertext[-1] ^= 1
        with self.assertRaises(zoho.SetupError):
            zoho.protect(bytes(ciphertext), decrypt=True)


if __name__ == "__main__":
    unittest.main()
