# First-time Zoho token exchange

The administrator utility `scripts/zoho_token_exchange.py` implements the supplied Python `requests.post` authorization-code exchange. It is a local Windows setup utility, not a browser feature or a deployed Python service. The existing Worker connector in `lib/zoho.ts` continues to refresh access tokens on the server.

No real credentials are embedded in the utility, examples or tests. Credentials pasted into a conversation should be replaced in Zoho before production setup. Do not reuse the exposed client secret or grant code. If any credentials were already provisioned elsewhere, coordinate replacement there too; the utility does not revoke or rotate an existing connection.

## Before generating the short-lived code

1. Confirm the regional Zoho account, Creator application and authorized report access. Use `IN` only for a verified India-region account.
2. Create or select a Zoho **Self Client**. This utility specifically implements Self Client authorization-code flow; it does not implement a server-based redirect/callback flow.
3. Prepare the local terminal and ensure Python 3.10+ and Requests are available. From the Fleet Desk project directory, install the pinned utility dependency if necessary:

   ```powershell
   python -m pip install -r scripts/requirements-zoho.txt
   ```

4. Prepare the secure hosting-secret provisioning process. The utility saves an encrypted local bundle; this alone does not install secrets into Sites or connect Fleet Desk.

## Run the exchange

Run the following in your own interactive terminal for the verified India account:

```powershell
python scripts/zoho_token_exchange.py --dc IN
```

The utility checks Windows encryption and output-file access, then asks for the Client ID, Client Secret and a new authorization code. Input is hidden. A terminal that cannot hide input is rejected.

Enter the new Client ID and Client Secret privately. When the utility is ready for the authorization code, open the Self Client's **Generate Code** tab and enter exactly:

```text
ZohoCreator.report.READ,ZohoCreator.meta.application.READ,ZohoCreator.meta.form.READ
```

Generate the code and paste it into the hidden terminal prompt before its expiry. Zoho's default lifetime is three minutes. The utility cannot prove which scopes were granted merely from the token response: verify the read-only scopes in Zoho when creating the code.

For administrator automation, the same values can come from the process environment as `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_GRANT_TOKEN`. Inject them through a trusted secret manager. Do not type secret-valued assignments into shell history or pass secrets as command-line arguments. Remove `ZOHO_GRANT_TOKEN` from the process environment after use. This utility does not read `.env` files automatically.

## Result and next step

Success saves `.secrets/zoho-oauth.dpapi`, encrypted using Windows DPAPI with the current user's credentials. It contains the client ID, client secret, refresh token and verified data-centre setting, with the same key names used by the server. The access token and grant code are not stored. The bundle is normally readable only under the same Windows user/computer (domain recovery and roaming profiles can affect this); it is temporary provisioning storage, not a portable server-secret file. Other processes running as the same user can read it.

The terminal prints success/failure only. Check a saved bundle without printing its contents or contacting Zoho:

```powershell
python scripts/zoho_token_exchange.py --check
```

Existing bundles are never overwritten. To prepare replacement credentials without losing the previous bundle, choose a new encrypted filename:

```powershell
python scripts/zoho_token_exchange.py --dc IN --bundle .secrets/zoho-replacement.dpapi
```

Trusted local provisioning code can call `load_credentials(Path(...))` in the utility to obtain the four named runtime values in memory. It must send `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN` directly into the hosting secret manager and set `ZOHO_DC` as a server setting, without printing or logging the mapping. There is intentionally no plaintext export or show-token command. Never upload the encrypted bundle through the register-document uploader.

Sites secret installation must use its production runtime environment controls, not the Fleet Desk JSON settings or `.openai/hosting.json`. A saved Site version must be deployed to apply changed runtime values. Actual `ZOHO_OWNER` and `ZOHO_APP` settings are still required, followed by allowance verification, report discovery, field mapping, historical import and real-account checks in [OPERATIONS.md](OPERATIONS.md). The utility itself does **not** publish a Site, provision runtime secrets, synchronize records, or activate scheduling.

Remove the local encrypted bundle after hosting provisioning and verification, according to the company's credential-retention policy. Never commit it; `.secrets/`, `*.dpapi`, local environment files and Python caches are ignored by Git. Do not copy it into deployment artifacts.

## Automatic renewal in the local dashboard

After the one-time exchange, start the local dashboard with:

```powershell
npm.cmd run dev:zoho
```

The launcher selects the sole nonempty `zoho-oauth*.dpapi` bundle. If there are multiple bundles, provide `-- --bundle .secrets/<selected-file>.dpapi`. The original empty legacy bundle is ignored. Windows decrypts the selected file under the current user. Only the local server's process receives the credentials; they are not copied into `.dev.vars`, command arguments, application source or production output. The server listens on localhost port 3001 by default.

In Settings, select **Check Zoho access**. This verifies OAuth independently of report configuration and returns only renewal status and expiry, never tokens. Fleet Desk reuses valid access tokens in each Worker isolate and renews them on demand within one minute of expiry. It does not run a recurring timer while idle. Failed renewals back off for one minute (ten minutes for Zoho token rate limits). A report request rejected with HTTP 401 gets at most one renewal/retry, and both report calls count toward the local API budget. A revoked refresh token still needs one-time reauthorization.

To select the application once its real link names are known:

```powershell
npm.cmd run dev:zoho -- --owner <owner-link-name> --app <application-link-name>
```

Only these non-secret names are saved to `.secrets/zoho-local.json` for later launches. Restart the current preview first. Report discovery and imports remain gated by the verified API allowance, budget and actual mappings. Hosted deployment still requires the hosting secret manager; local configuration does not publish or install production secrets.

## Failure handling

If `--check` says the bundle is **empty**, no credentials were saved there. An interrupted older setup may have left a zero-byte file. Keep it untouched and run again with a new filename, for example `--bundle .secrets/zoho-new.dpapi`. Use that same filename with `--check` afterward. The updated utility writes to a separate temporary file and finalizes the bundle only after encrypted storage succeeds, so interrupted input does not occupy the final filename. Ordinary cancellation removes the temporary file. If finalization fails after tokens were encrypted, the utility reports the recoverable encrypted temporary file instead of discarding it.

The utility sends one HTTPS POST with form fields in the body, certificate verification, connection/read timeouts and redirects disabled. Only allowlisted regional Zoho endpoints are used. It validates HTTP status, JSON structure, both returned tokens and the exact API domain. Response bodies, request payloads and arbitrary exception details are never printed. Known OAuth errors are translated into safe instructions.

An expired, reused or invalid code requires a fresh code. Do not automatically retry after a timeout or server failure: Zoho may have consumed the original code. A storage failure after a successful exchange can also require a new code; the utility never falls back to plaintext. Existing connection credentials are preserved on failure.

## Verification

Run the isolated tests; every network request is mocked and all credential strings are fixtures:

```powershell
python -m unittest discover -s tests -p test_zoho_token_exchange.py -v
```

The tests include a real Windows DPAPI encrypt/decrypt round trip, tamper rejection, no-overwrite behavior, failure cleanup, redacted success/error output, correct regional requests, missing tokens, unexpected responses, network errors and no automatic retries. These checks do not verify an actual Zoho account.

Sources: [Zoho Self Client authorization-code flow](https://www.zoho.com/developer/oauth/self-client/authorization-code-flow.html), [Creator scopes and data centres](https://www.zoho.com/creator/help/api/v2.1/oauth-overview.html), [Microsoft DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata), [Requests timeouts](https://requests.readthedocs.io/en/latest/user/quickstart/#timeouts).
