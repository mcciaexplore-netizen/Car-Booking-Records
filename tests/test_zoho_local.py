"""Offline tests for the encrypted local launcher; no real OAuth requests."""
import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts import zoho_local as local


class LocalLauncherTests(unittest.TestCase):
    def test_credentials_go_only_to_child_environment(self):
        fixture = {'ZOHO_CLIENT_ID': 'fixture-id', 'ZOHO_CLIENT_SECRET': 'fixture-secret', 'ZOHO_REFRESH_TOKEN': 'fixture-refresh', 'ZOHO_DC': 'IN'}
        output = io.StringIO()
        with patch.object(local, 'choose_bundle', return_value=Path('fixture.dpapi')), patch.object(local, 'load_credentials', return_value=fixture), patch.object(local, 'local_config', return_value={}), patch.object(local.shutil, 'which', return_value='node.exe'), patch.object(Path, 'is_file', return_value=True), patch.object(local.subprocess, 'call', return_value=0) as launch, contextlib.redirect_stdout(output):
            self.assertEqual(local.main([]), 0)
        command = launch.call_args.args[0]
        environment = launch.call_args.kwargs['env']
        for value in fixture.values():
            self.assertNotIn(value, command)
            self.assertNotIn(value, output.getvalue())
        self.assertEqual(environment['ZOHO_REFRESH_TOKEN'], 'fixture-refresh')
        self.assertNotIn('ZOHO_GRANT_TOKEN', environment)
        self.assertIn('127.0.0.1', command)

    def test_empty_bundle_is_ignored_and_ambiguity_requires_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.secrets').mkdir()
            (root / '.secrets' / 'zoho-oauth.dpapi').touch()
            saved = root / '.secrets' / 'zoho-oauth-saved.dpapi'
            saved.write_bytes(b'encrypted-fixture')
            with patch.object(local, 'ROOT', root):
                self.assertEqual(local.choose_bundle(None), saved)
                (root / '.secrets' / 'zoho-oauth-other.dpapi').write_bytes(b'other')
                with self.assertRaises(local.SetupError):
                    local.choose_bundle(None)

    def test_invalid_names_do_not_modify_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'config.json'
            with patch.object(local, 'CONFIG', config):
                with self.assertRaises(local.SetupError):
                    local.local_config('owner', 'app\nZOHO_CLIENT_SECRET=value')
                self.assertFalse(config.exists())


if __name__ == '__main__':
    unittest.main()
