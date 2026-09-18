"""Start local Fleet Desk with DPAPI credentials injected only into its process.

No OAuth secrets are written to .dev.vars, source, command arguments or output.
Production hosting must use its own secret manager.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

if __package__:
    from .zoho_token_exchange import load_credentials, SetupError
else:
    from zoho_token_exchange import load_credentials, SetupError

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / '.secrets' / 'zoho-local.json'


def choose_bundle(explicit: Path | None) -> Path:
    if explicit:
        return explicit.resolve()
    choices = [p for p in (ROOT / '.secrets').glob('zoho-oauth*.dpapi') if p.stat().st_size > 0]
    if len(choices) != 1:
        raise SetupError('Select one encrypted credential bundle with --bundle.')
    return choices[0]


def local_config(owner: str | None, app: str | None) -> dict[str, str]:
    config = json.loads(CONFIG.read_text(encoding='utf-8')) if CONFIG.exists() else {}
    if not isinstance(config, dict):
        raise SetupError('Local application configuration is invalid.')
    if owner is not None or app is not None:
        if not owner or not app:
            raise SetupError('Supply both --owner and --app from the Creator application URL.')
        config = {'ZOHO_OWNER': owner, 'ZOHO_APP': app}
    for key, value in config.items():
        if key not in ('ZOHO_OWNER', 'ZOHO_APP') or not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,200}', value):
            raise SetupError('Use valid owner and application link names from Zoho Creator.')
    if owner is not None:
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
    return config


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Run Fleet Desk with encrypted local Zoho credentials.')
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--owner')
    parser.add_argument('--app')
    parser.add_argument('--port', type=int, default=3001)
    parser.add_argument('--check', action='store_true', help='Verify encrypted storage without contacting Zoho or starting the app.')
    args = parser.parse_args(argv)
    try:
        if not 1024 <= args.port <= 65535:
            raise SetupError('Choose a local port between 1024 and 65535.')
        credentials = load_credentials(choose_bundle(args.bundle))
        config = local_config(args.owner, args.app)
        print('Encrypted Zoho credentials loaded. Automatic renewal is available.', flush=True)
        if not config.get('ZOHO_OWNER') or not config.get('ZOHO_APP'):
            print('Creator application is not selected yet. OAuth access can still be checked in Settings.', flush=True)
        if args.check:
            return 0
        node = shutil.which('node')
        cli = ROOT / 'node_modules' / 'vinext' / 'dist' / 'cli.js'
        if not node or not cli.is_file():
            raise SetupError('Install the project dependencies and Node.js before starting Fleet Desk.')
        child_env = dict(os.environ)
        child_env.update(credentials)
        child_env.update(config)
        child_env['FLEET_LOCAL_ZOHO'] = '1'
        child_env['WRANGLER_LOG_LEVEL'] = 'error'
        child_env['WRANGLER_WRITE_LOGS'] = 'false'
        child_env.pop('ZOHO_GRANT_TOKEN', None)
        return subprocess.call([node, str(cli), 'dev', '--host', '127.0.0.1', '--port', str(args.port)], cwd=ROOT, env=child_env)
    except SetupError as error:
        print(f'Local setup failed: {error}', file=sys.stderr)
    except KeyboardInterrupt:
        return 130
    except Exception:
        print('Local setup failed. Check the encrypted bundle and local configuration. No credentials were displayed.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
