"""One-time Zoho Self Client exchange. Run locally, never in browser code.

Secrets come from hidden terminal prompts or an administrator's process environment.
Only a Windows user-encrypted provisioning bundle is saved; no tokens are printed.
The dashboard's existing server connector handles subsequent token refreshes.
"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import getpass
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import warnings

import requests


REGIONS = {
    "IN": "in", "US": "com", "EU": "eu", "AU": "com.au", "JP": "jp",
    "CA": "ca", "SA": "sa", "CN": "com.cn", "UAE": "ae",
}
DEFAULT_BUNDLE = Path(__file__).resolve().parents[1] / ".secrets" / "zoho-oauth.dpapi"
MAX_RESPONSE_BYTES = 65536
MAGIC = b"FLEET-DESK-ZOHO-DPAPI-1\n"
ERROR_MESSAGES = {
    "invalid_code": "Authorization code is expired, already used, or invalid. Generate a new code when ready.",
    "invalid_client": "Client credentials or data centre do not match. Check the regional API Console.",
    "invalid_client_secret": "Client credentials do not match. Check the API Console.",
    "invalid_scope": "Check the three read-only Creator scopes in the connection guide.",
    "access_denied": "The Zoho account did not authorize this connection.",
    "invalid_grant": "Authorization grant is invalid. Check the Self Client setup and generate a new code.",
}


class SetupError(Exception):
    """A deliberately sanitized message that is safe to show to the administrator."""


def credential(value: object, label: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,4096}", value):
        raise SetupError(f"{label} is missing or has an invalid format. Its value was not displayed.")
    return value


def read_secret(name: str, prompt: str) -> str:
    value = os.environ.get(name)
    if value is None:
        if not sys.stdin.isatty():
            raise SetupError(f"Run in an interactive terminal or supply {name} through secure process configuration.")
        # Fail closed if getpass cannot disable echo; it otherwise falls back to visible input.
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            try:
                value = getpass.getpass(prompt)
            except getpass.GetPassWarning:
                raise SetupError("Hidden input is unavailable in this terminal.") from None
    return credential(value, name)


def exchange(client_id: str, client_secret: str, grant_token: str, dc: str) -> dict[str, str]:
    """Make one request only. Never retry an exchange with an uncertain outcome."""
    if dc not in REGIONS:
        raise SetupError("Select the data centre shown in the Zoho account.")
    payload = {
        "grant_type": "authorization_code",
        "client_id": credential(client_id, "Client ID"),
        "client_secret": credential(client_secret, "Client secret"),
        "code": credential(grant_token, "Authorization code"),
    }
    expected_domain = f"https://www.zohoapis.{REGIONS[dc]}"
    try:
        with requests.post(
            f"https://accounts.zoho.{REGIONS[dc]}/oauth/v2/token",
            data=payload,
            headers={"Accept": "application/json"},
            timeout=(5, 20),
            allow_redirects=False,
            stream=True,
        ) as response:
            status = response.status_code
            if 300 <= status < 400:
                raise SetupError("Zoho redirected the request. Verify the data centre; credentials were not forwarded.")
            if status == 429:
                raise SetupError("Zoho rate limit reached. Wait before generating and exchanging a fresh code.")
            if status >= 500:
                raise SetupError("Zoho is temporarily unavailable. The exchange was not automatically retried.")
            body = bytearray()
            for chunk in response.iter_content(chunk_size=4096):
                body.extend(chunk)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise SetupError("Zoho returned an unexpectedly large response. No credentials were saved.")
            try:
                data = json.loads(body)
            except (ValueError, UnicodeError):
                raise SetupError(f"Zoho returned an unreadable response (HTTP {status}). No response body was displayed.") from None
    except requests.RequestException:
        # Request exceptions can contain URLs, proxy configuration and request data.
        raise SetupError("Zoho could not be reached securely or the request timed out. The outcome is uncertain; do not blindly retry the same code.") from None

    if not isinstance(data, dict):
        raise SetupError("Zoho returned an unexpected response structure.")
    if "error" in data or not 200 <= status < 300:
        code = data.get("error")
        message = ERROR_MESSAGES.get(code) if isinstance(code, str) else None
        raise SetupError(message or f"Zoho rejected the token exchange (HTTP {status}). Check account access and the regional client configuration.")
    credential(data.get("access_token"), "Returned access token")
    refresh_token = credential(data.get("refresh_token"), "Returned refresh token")
    if data.get("api_domain") != expected_domain:
        raise SetupError("Zoho returned a different or missing API domain. Check the account's data centre.")
    # Persist only what the existing server connector needs. Discard the short-lived access token.
    return {
        "ZOHO_CLIENT_ID": client_id,
        "ZOHO_CLIENT_SECRET": client_secret,
        "ZOHO_REFRESH_TOKEN": refresh_token,
        "ZOHO_DC": dc,
    }


class DataBlob(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def protect(data: bytes, *, decrypt: bool = False) -> bytes:
    """Windows DPAPI, current-user scope; never machine-wide and never plaintext fallback."""
    if os.name != "nt":
        raise SetupError("This local credential store requires Windows. Use a server secret manager on other systems.")
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    blob_pointer = ctypes.POINTER(DataBlob)
    operation = crypt32.CryptUnprotectData if decrypt else crypt32.CryptProtectData
    operation.argtypes = [blob_pointer, ctypes.c_void_p, blob_pointer, ctypes.c_void_p,
                          ctypes.c_void_p, wintypes.DWORD, blob_pointer]
    operation.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    backing = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    source, result = DataBlob(len(data), backing), DataBlob()
    try:
        if not operation(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
            raise SetupError("Windows could not protect/read the credentials for this user. No plaintext fallback is allowed.")
        return ctypes.string_at(result.data, result.size)
    finally:
        ctypes.memset(backing, 0, len(data))
        if result.data:
            ctypes.memset(result.data, 0, result.size)
            kernel32.LocalFree(result.data)


def load_credentials(path: Path = DEFAULT_BUNDLE) -> dict[str, str]:
    """For trusted local provisioning code only. Never print or log the returned mapping."""
    if path.stat().st_size > MAX_RESPONSE_BYTES:
        raise SetupError("Credential bundle is too large.")
    content = path.read_bytes()
    if not content:
        raise SetupError("The bundle is empty; no credentials were saved. Run setup with a new --bundle filename.")
    if not content.startswith(MAGIC):
        raise SetupError("This is not a Fleet Desk encrypted credential bundle.")
    try:
        values = json.loads(protect(content[len(MAGIC):], decrypt=True))
    except (ValueError, UnicodeError):
        raise SetupError("Credential bundle is invalid.") from None
    if not isinstance(values, dict) or values.get("ZOHO_DC") not in REGIONS:
        raise SetupError("Credential bundle configuration is invalid.")
    return {key: credential(values.get(key), key) for key in (
        "ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_DC"
    )}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Secure one-time Zoho Self Client exchange for Fleet Desk (Windows).")
    parser.add_argument("--dc", choices=REGIONS, help="Verified Zoho data centre; use IN only for an India account.")
    parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE, help="Encrypted local provisioning file; never overwritten.")
    parser.add_argument("--check", action="store_true", help="Check an existing encrypted bundle without printing credentials or contacting Zoho.")
    args = parser.parse_args(argv)
    try:
        if args.check:
            values = load_credentials(args.bundle)
            print(f"Encrypted credentials are readable. Data centre: {values['ZOHO_DC']}. Hosting installation is still required.")
            return 0
        if not args.dc:
            raise SetupError("Provide --dc using the verified account data centre.")
        # Verify encryption and writable storage before consuming a short-lived authorization code.
        probe = b"fleet-desk-credential-storage-check"
        if protect(protect(probe), decrypt=True) != probe:
            raise SetupError("Windows credential protection check failed.")
        args.bundle.parent.mkdir(parents=True, exist_ok=True)
        if args.bundle.exists():
            if args.bundle.stat().st_size == 0:
                raise SetupError("The existing bundle is empty; no credentials were saved. Use a new --bundle filename to continue.")
            raise SetupError("A bundle already exists. Check it with --check or choose a new --bundle path; existing credentials were preserved.")
        # Reserve separate temporary storage, not the final credential filename.
        # A terminal/process closure can leave this temporary file, but cannot block the next setup.
        destination = tempfile.NamedTemporaryFile(mode="wb", dir=args.bundle.parent,
                                                 prefix=".zoho-", suffix=".pending.dpapi", delete=False)
        pending = Path(destination.name)
        saved = False
        try:
            with destination:
                values = exchange(
                    read_secret("ZOHO_CLIENT_ID", "Zoho Client ID (hidden): "),
                    read_secret("ZOHO_CLIENT_SECRET", "Zoho Client Secret (hidden): "),
                    read_secret("ZOHO_GRANT_TOKEN", "New authorization code (hidden): "),
                    args.dc,
                )
                sealed = MAGIC + protect(json.dumps(values).encode("utf-8"))
                destination.write(sealed)
                destination.flush()
                os.fsync(destination.fileno())
                saved = True
            # Windows rename is atomic and rejects an existing destination. Never replace another run's bundle.
            try:
                pending.rename(args.bundle)
            except OSError:
                raise SetupError(f"Credentials were encrypted but the final filename is unavailable. The recoverable bundle is {pending}. Check it with --check --bundle before provisioning.") from None
        except BaseException:
            # Keep a fully saved encrypted response if finalization fails; never lose a consumed grant's token.
            if not saved:
                pending.unlink(missing_ok=True)
            raise
        print("Token exchange succeeded. Credentials saved with Windows user encryption.")
        print("No tokens were printed. Provision the bundle into hosting secrets, then configure the app and reports.")
        return 0
    except SetupError as error:
        print(f"Setup failed: {error}", file=sys.stderr)
    except (EOFError, KeyboardInterrupt):
        print("Setup cancelled. No connection was installed.", file=sys.stderr)
    except Exception:
        # Do not render arbitrary exception text or a traceback in a credential utility.
        print("Setup failed. Check local storage and administrator configuration. Details were withheld to protect credentials.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
