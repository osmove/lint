# Releasing

Two release tracks live in this repo. They use different tag prefixes so each can ship on its own cadence.

| Track | Tag pattern | Triggers |
|---|---|---|
| `lint` CLI to npm | `v*` (e.g. `v1.2.4`) | `.github/workflows/ci.yml` (existing pipeline) |
| Lint Desktop + npm CLI in lockstep | `desktop-v*` (e.g. `desktop-v1.4.1`) | `.github/workflows/desktop-release.yml` |

The desktop track also publishes the CLI on the same tag — convenient when you want both versions to march in step. If you only need to ship a CLI patch, push a plain `v*` tag and the desktop pipeline stays idle.

## Cutting a desktop release

```bash
# 1. bump versions (cli + desktop) so the npm publish step has something new
pnpm --filter lint version patch          # 1.2.3 → 1.2.4
node -e 'const f="packages/desktop/package.json";const j=require(`./${f}`);j.version="1.2.4";require("fs").writeFileSync(f, JSON.stringify(j,null,2)+"\n")'

# 2. commit + tag + push
git add packages/cli/package.json packages/desktop/package.json pnpm-lock.yaml
git commit -m "Release desktop-v1.2.4"
git tag desktop-v1.2.4
git push origin main desktop-v1.2.4
```

GitHub Actions then runs four jobs in parallel:

- **linux** — AppImage + deb + rpm uploaded to the release
- **windows** — NSIS + portable .exe (unsigned by default — see below)
- **macos** — DMG + ZIP, x64 + arm64 (gated on `MACOS_BUILD_ENABLED` repo var)
- **npm** — `pnpm publish` for the `lint` package, idempotent

Each platform's `latest-*.yml` metadata file is uploaded too — `electron-updater` consumes them to push auto-updates to existing installs.

## Code signing

### macOS — Apple Developer ID + notarization

The `mac:` block in `packages/desktop/electron-builder.yml` has `notarize: true`, so the signing/notarization toolchain has to be configured for the release to succeed. Until it is, the **macOS job is skipped** via `if: ${{ vars.MACOS_BUILD_ENABLED == 'true' }}`.

What you need (one-time setup):

1. **Apple Developer Program membership** ($99/year) at developer.apple.com. The team you sign with is the one whose Team ID appears below.

2. **A Developer ID Application certificate**:
   - Open Keychain Access on a Mac with the Apple Developer account
   - Certificate Assistant → Request a Certificate from a Certificate Authority → save the CSR
   - In the Developer Portal: Certificates → `+` → Developer ID Application → upload the CSR → download the .cer
   - Double-click to install in Keychain
   - Right-click the cert in Keychain → Export → format `.p12` → set a strong export password (this is `MACOS_CSC_KEY_PASSWORD`)
   - Base64-encode the `.p12`: `base64 -i cert.p12 | pbcopy` (this is `MACOS_CSC_LINK`)

3. **An app-specific password** for notarization:
   - appleid.apple.com → Sign-In and Security → App-Specific Passwords → `+`
   - Label it "Lint notarization" and copy the password (this is `APPLE_APP_SPECIFIC_PASSWORD`)

4. **Repo secrets** (Settings → Secrets and variables → Actions):
   ```
   APPLE_ID                     = <your apple developer email>
   APPLE_APP_SPECIFIC_PASSWORD  = <the password from step 3>
   APPLE_TEAM_ID                = <10-char Team ID, see developer.apple.com/account>
   MACOS_CSC_LINK               = <the base64 .p12 from step 2>
   MACOS_CSC_KEY_PASSWORD       = <the .p12 export password from step 2>
   ```

5. **Repo variable** (same page, Variables tab):
   ```
   MACOS_BUILD_ENABLED = true
   ```

   Setting this gate as a separate variable makes it easy to disable mac builds temporarily (e.g. while rotating the cert) without unsetting the secrets.

Once those land, the macOS job will:
- Sign `Lint.app` inside each DMG with the Developer ID cert
- Submit the .app to Apple's notary service via `xcrun notarytool` (electron-builder calls this internally)
- Wait for the notarization ticket and staple it to the .app
- Upload the DMG to the GitHub release

The **DMG container itself is not notarized** — that's intentional. electron-builder doesn't submit the DMG, only the .app inside. When a user mounts the DMG and drags Lint.app to /Applications, Gatekeeper inspects the .app, finds the stapled ticket, and launches it without warning. This is the standard shape (Slack, Notion, Cursor all ship this way).

If you see Gatekeeper still warning, the most common causes are:
- `.app` was rebuilt locally without re-signing → re-run the workflow
- The ticket didn't staple (notary timeout) → check Actions logs for "stapler" output
- The user's machine has stale Gatekeeper cache → `xattr -cr /Applications/Lint.app`

### Windows — EV code signing

`win:` block has no `sign:` configuration yet → unsigned at v1. SmartScreen will show a "Windows protected your PC" warning on first install, but the install completes. Most early users push past it.

When you're ready to sign:

1. Buy an **EV (Extended Validation) Code Signing certificate** from a CA — DigiCert, Sectigo, or SSL.com (~$300-500/year). EV is required to bypass SmartScreen on first install; OV (organization validation) certs only get reputation over time.

2. The CA ships a USB hardware token (HSM) holding the private key. You can't export the key, so signing has to happen on a machine that can talk to the token. Two paths:

   - **GitHub-hosted runner + cloud HSM**: SSL.com offers `eSigner Cloud Code Signing` — store the key in their cloud HSM, sign via their REST API. The workflow stays on `windows-latest`. This is the easiest path.
   - **Self-hosted runner with the USB token plugged in**: more setup, no recurring cloud-HSM fee.

3. Once signed, set the secrets:
   ```
   WIN_CSC_LINK          = <base64 of the .pfx, or the cloud HSM creds>
   WIN_CSC_KEY_PASSWORD  = <password>
   ```
   The `windows` job already references `CSC_LINK` / `CSC_KEY_PASSWORD` from those secrets — electron-builder picks them up automatically and signs the NSIS installer + the portable .exe.

### Linux

No signing required. AppImages run unsigned anywhere; .deb / .rpm are signed by the user's distro at the repo level if they install via apt/dnf, not by us.

## Local dry-run

To produce DMGs/AppImages/NSIS locally without publishing (useful for smoke-testing the UI), build manually and skip signing:

```bash
# Build everything in topo order
pnpm --filter "@lint/server..." build
pnpm --filter @lint/dashboard-ui build
pnpm --filter @lint/desktop build

# macOS — no notarization, no signing
cd packages/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 \
  -c.mac.notarize=false -c.mac.identity=null

# Linux
npx electron-builder --linux --x64

# Windows (run on Windows; cross-compile from mac is unsupported)
npx electron-builder --win --x64
```

Outputs land in `packages/desktop/release/`. They're enough to test the install flow but should never be shipped to end-users — they trip every Gatekeeper / SmartScreen warning.

## Tag hygiene

- `vX.Y.Z` for CLI-only releases — npm publish only, no desktop assets
- `desktop-vX.Y.Z` for combined desktop + CLI lockstep releases
- Never re-tag an already-published version. If you need to re-cut, bump the patch and re-tag.
- The `npm` job in `desktop-release.yml` is idempotent (skips when local == remote version), so re-running on a force-pushed tag is safe.
