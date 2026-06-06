# Security Hardening Implementation Plan

## Goal

Create a safe, repeatable, source-reviewed MCP bridge for Argus/Research Agent infrastructure that can use Ben’s logged-in Perplexity Comet subscription for Deep Research and staged file uploads without exposing CDP broadly, touching personal browser profiles, killing unrelated Comet instances, or allowing arbitrary local file upload paths.

## Architecture

Current architecture:

```text
MCP client
  -> stdio MCP server: src/index.ts
  -> Comet CDP client: src/cdp-client.ts
  -> Perplexity UI automation: src/comet-ai.ts, src/page-scripts.ts
  -> Comet browser via Chrome DevTools Protocol on localhost
```

Target hardened architecture:

```text
MCP client
  -> src/index.ts
     - tool registration only
     - upload tool calls staging policy before CDP upload
  -> src/config.ts
     - validates COMET_HOST, COMET_PORT, COMET_USER_DATA_DIR, COMET_UPLOAD_DIR
     - exports immutable safe runtime config
  -> src/upload-policy.ts
     - resolves and validates upload paths
     - enforces COMET_UPLOAD_DIR containment
  -> src/cdp-client.ts
     - launches Comet with safe CDP flags
     - dedicated user-data-dir
     - no broad process killing by default
  -> Comet launched on 127.0.0.1 only
```

## Tech Stack

- Node.js `>=18`
- TypeScript ESM
- MCP SDK: `@modelcontextprotocol/sdk`
- CDP: `chrome-remote-interface`
- Tests: Vitest
- Existing source layout: `src/*.ts`, `tests/unit/*.test.ts`

## Implementation Tasks

### 1. Add Central Config Validation

Create: `src/config.ts`

Responsibilities:

- Parse environment once at startup.
- Export:
  - `COMET_DEFAULT_HOST = "127.0.0.1"`
  - `COMET_DEFAULT_PORT = 9223`
  - `COMET_DEFAULT_USER_DATA_DIR`
  - `COMET_DEFAULT_UPLOAD_DIR`
  - `getCometConfig(env = process.env, platformInfo?)`
- Validate:
  - `COMET_HOST` defaults to `127.0.0.1`.
  - Reject anything except `127.0.0.1` for launch/CDP binding.
  - Optionally allow `localhost` only for connection compatibility if needed, but normalize launch host to `127.0.0.1`.
  - `COMET_PORT` must be integer `1024..65535`, default `9223`.
  - Reject privileged ports and invalid strings instead of silently falling back.
  - `COMET_USER_DATA_DIR` must be absolute, non-root, non-home, not a known default browser profile path.
  - `COMET_USER_DATA_DIR` default on macOS should be a dedicated agent profile, for example:
    - `${HOME}/Library/Application Support/comet-mcp-agent-profile`
  - `COMET_UPLOAD_DIR` must be absolute, non-root, and contained in an approved staging location.
  - Default upload dir should be dedicated, for example:
    - `${HOME}/Library/Application Support/comet-mcp-uploads`
- Return a typed object:
  ```ts
  interface CometConfig {
    host: "127.0.0.1";
    port: number;
    cometPath: string;
    userDataDir: string;
    uploadDir: string;
    allowCometRestart: boolean;
  }
  ```

Modify: `src/cdp-client.ts`

- Remove inline `readPortFromEnv`.
- Replace `DEFAULT_PORT` with `DEFAULT_CONFIG.port` or exported `cometConfig.port`.
- Replace direct `process.env.COMET_PATH` access with validated config.

Modify: `src/index.ts`

- Import config and pass validated port/config to `cometClient.startComet`.
- Ensure config validation errors fail closed with clear MCP error text.

Tests first:

Create: `tests/unit/config.test.ts`

Cover:

- Default host is `127.0.0.1`.
- `COMET_HOST=0.0.0.0` is rejected.
- `COMET_HOST=<LAN IP>` is rejected.
- `COMET_PORT=9223` accepted.
- `COMET_PORT=abc`, `0`, `65536`, `80` rejected.
- default user-data-dir is not a known personal browser profile.
- unsafe `COMET_USER_DATA_DIR` values are rejected.
- upload dir must be absolute and non-root.

### 2. Force Loopback-Only CDP Binding

Modify: `src/cdp-client.ts`

All Comet launch paths must include:

```text
--remote-debugging-address=127.0.0.1
--remote-debugging-port=<validated port>
```

Exact places to change:

- WSL PowerShell launch around current `Start-Process ... -ArgumentList '--remote-debugging-port=...'`.
- Native Windows `spawn(COMET_PATH, [...])`.
- macOS/Linux `spawn(COMET_PATH, [...])`.
- Error hints that currently show only `--remote-debugging-port`.

Add helper:

```ts
export function buildCometLaunchArgs(config: CometConfig): string[]
```

Expected output:

```ts
[
  `--remote-debugging-address=127.0.0.1`,
  `--remote-debugging-port=${config.port}`,
  `--user-data-dir=${config.userDataDir}`,
]
```

Tests first:

Create: `tests/unit/cdp-client.launch.test.ts`

Cover:

- Launch args always include `--remote-debugging-address=127.0.0.1`.
- Launch args include validated port.
- Launch args include dedicated `--user-data-dir`.
- No launch arg allows `0.0.0.0`.
- WSL PowerShell argument string includes the same three flags.

### 3. Force Dedicated Agent Comet Profile

Modify: `src/cdp-client.ts`

- Always launch Comet with `--user-data-dir=<validated dedicated dir>`.
- Never omit `--user-data-dir`.
- Never launch against Comet’s default/personal profile.
- Startup messages should mention the dedicated profile path, but avoid over-logging sensitive full paths if not necessary.

Modify: `README.md`

- Add “Dedicated Agent Profile” section.
- State that the infrastructure Comet profile may be logged into Ben’s Perplexity subscription, but must not be Ben’s personal browsing profile.
- Document `COMET_USER_DATA_DIR` override rules.

Modify: `server.json`

- Add `COMET_USER_DATA_DIR` environment variable metadata.

Tests first:

- Covered by `tests/unit/config.test.ts`.
- Covered by `tests/unit/cdp-client.launch.test.ts`.

### 4. Remove or Gate Broad Process Killing

Modify: `src/cdp-client.ts`

Current risky behavior:

- `killComet()` uses:
  - macOS/Linux: `pkill -f Comet.app`
  - Windows: `taskkill /F /IM comet.exe`
- `startComet()` calls `killComet()` when Comet is running but CDP is unavailable.

Target behavior:

- Default: never kill unrelated Comet instances.
- If Comet is already running without CDP:
  - Return a clear error explaining that the operator must close that instance or explicitly enable managed restart.
- Add opt-in env:
  - `COMET_ALLOW_RESTART=1`
- Even when restart is allowed:
  - Only terminate the MCP-managed child process if `this.cometProcess` exists.
  - Do not `pkill` / `taskkill` by image name.
  - If exact per-profile process matching is implemented later, only match `--user-data-dir=<configured dir>`.

Implementation:

- Delete or stop using broad `killComet()`.
- Replace with:
  ```ts
  private async stopManagedComet(): Promise<void>
  ```
- `stopManagedComet()` should only signal `this.cometProcess`.
- If no managed process exists, do not kill anything.

Tests first:

Create: `tests/unit/cdp-client.process.test.ts`

Prefer pure helpers to avoid spawning:

- Create helper such as:
  ```ts
  export function shouldRestartComet(config, processState): RestartDecision
  ```
- Cover:
  - default config refuses restart of externally running Comet.
  - `COMET_ALLOW_RESTART=1` allows restart only for managed process.
  - no decision path returns `pkill`, `taskkill`, or broad image kill.
  - error message tells operator how to close/relaunch safely.

### 5. Add Staged Upload Allowlist Policy

Create: `src/upload-policy.ts`

Responsibilities:

```ts
export interface UploadPolicy {
  uploadDir: string;
}

export function resolveAllowedUploadPath(inputPath: string, policy: UploadPolicy): string
```

Rules:

- Input path must be absolute.
- Resolve symlinks where possible with `realpathSync`.
- Require target file exists and is a regular file.
- Target real path must be contained within `COMET_UPLOAD_DIR`.
- Reject:
  - relative paths
  - `..` traversal
  - symlink escapes
  - directories
  - missing files
  - paths outside staging dir
- Return canonical absolute path to pass to CDP.

Modify: `src/index.ts`

Current risky behavior:

```ts
if (!fs.existsSync(filePath)) ...
const result = await cometClient.uploadFile(filePath, selector);
```

Replace with:

```ts
const stagedPath = validateCometUpload(filePath, cometConfig.uploadDir);
const result = await cometClient.uploadFile(stagedPath, selector);
```

Update `comet_upload` schema/description:

- `filePath` must be an absolute path under `COMET_UPLOAD_DIR`.
- Upload capability remains, but only for staged files.

Modify: `src/cdp-client.ts`

- Keep `uploadFile()` CDP mechanics.
- Do not duplicate policy here unless adding a defensive assertion.
- Consider renaming param docs from arbitrary absolute path to staged path.

Modify: `README.md`

- Replace arbitrary upload examples with staging examples:
  ```bash
  mkdir -p "$COMET_UPLOAD_DIR"
  cp report.pdf "$COMET_UPLOAD_DIR/report.pdf"
  ```
- Document that MCP clients must stage files first.

Modify: `server.json`

- Add `COMET_UPLOAD_DIR` metadata.

Tests first:

Create: `tests/unit/upload-policy.test.ts`

Cover:

- accepts file inside staging dir.
- rejects relative path.
- rejects path outside staging dir.
- rejects `../` escape.
- rejects symlink inside staging dir pointing outside.
- rejects directory.
- rejects missing file.
- preserves valid filenames with spaces.

### 6. Confirm Sampling Is Disabled

Current state:

```ts
new Server(..., { capabilities: { tools: {} } })
```

No sampling capability is advertised.

Modify: `src/index.ts`

- Keep capabilities limited to tools.
- Add a small exported helper if needed:
  ```ts
  export function getServerCapabilities() {
    return { tools: {} };
  }
  ```
- Use that helper in the `Server` constructor.
- Do not add `sampling`.

Tests first:

Create: `tests/unit/server-capabilities.test.ts`

Cover:

- capabilities contain `tools`.
- capabilities do not contain `sampling`.
- capabilities do not contain future broad capabilities unless explicitly reviewed.

### 7. Preserve Deep Research and Workflow Behavior

Modify carefully:

- `src/index.ts`
  - Preserve `comet_mode`.
  - Preserve `comet_ask`.
  - Preserve `comet_poll`.
  - Preserve `comet_stop`.
  - Preserve `comet_upload`, but with staging enforcement.
- `src/comet-ai.ts`
  - No security-hardening changes needed unless tests expose coupling.

Regression tests:

- Existing `tests/unit/comet-ai.test.ts` should remain unchanged.
- Existing `tests/unit/page-scripts.test.ts` should remain unchanged.
- Add a small tool-list test if `TOOLS` is exported:
  - `comet_mode` still exists.
  - `comet_upload` still exists.
  - `comet_ask` still exists.

### 8. Document Hermes / Research-Agent Integration

Modify: `README.md`

Add section: `Argus / Research Agent Runbook`

Include:

- Required env:
  ```bash
  export COMET_HOST=127.0.0.1
  export COMET_PORT=9223
  export COMET_USER_DATA_DIR="$HOME/Library/Application Support/comet-mcp-agent-profile"
  export COMET_UPLOAD_DIR="$HOME/Library/Application Support/comet-mcp-uploads"
  ```
- Optional:
  ```bash
  export COMET_PATH="/Applications/Comet.app/Contents/MacOS/Comet"
  ```
- Default `COMET_ALLOW_RESTART` is off.
- How to initialize profile:
  1. Launch MCP once or manually launch Comet with the exact flags.
  2. Log into Ben’s Perplexity subscription in the dedicated agent profile only.
  3. Do not use Ben’s personal browsing profile.
- How Hermes/Research Agent stages uploads:
  1. Write or copy file into `COMET_UPLOAD_DIR`.
  2. Call `comet_upload` with that staged absolute path.
  3. Remove staged file after run if retention is not required.
- Deep Research workflow:
  1. `comet_connect`
  2. `comet_mode mode="research"`
  3. `comet_ask prompt="..." timeout=...`
  4. `comet_poll` for long-running work.

Create: `docs/ARGUS_RUNBOOK.md`

Recommended contents:

- Threat model.
- Operational setup.
- Environment variables.
- Safe launch flags.
- Upload staging policy.
- Restart policy.
- Incident response.
- Rollback.
- Source review checklist.

### 9. Metadata Updates

Modify: `server.json`

Add environment variables:

- `COMET_HOST`
- `COMET_USER_DATA_DIR`
- `COMET_UPLOAD_DIR`
- `COMET_ALLOW_RESTART`

Update descriptions to mention safe defaults and loopback-only restriction.

Do not add secrets.

## Verification Commands

### Safe Static Inspection Commands

These do not install dependencies, do not build, and do not run package scripts:

```bash
pwd
rg --files
rg -n "remote-debugging|user-data-dir|COMET_|pkill|taskkill|sampling|uploadFile|comet_upload" src tests README.md server.json package.json
sed -n '1,220p' src/cdp-client.ts
sed -n '930,1210p' src/cdp-client.ts
sed -n '720,790p' src/index.ts
sed -n '330,380p' README.md
git diff -- src tests README.md server.json
git diff --check
```

After implementation, use static searches to confirm removed risks:

```bash
rg -n "pkill|taskkill /F|taskkill.*comet.exe|remote-debugging-address=0.0.0.0|sampling" src tests README.md server.json
rg -n "remote-debugging-address=127.0.0.1|user-data-dir|COMET_UPLOAD_DIR|COMET_USER_DATA_DIR" src tests README.md server.json
```

Expected:

- No broad `pkill` or image-name `taskkill`.
- No `sampling` capability.
- Launch args include `remote-debugging-address=127.0.0.1`.
- Upload docs and code refer to `COMET_UPLOAD_DIR`.

### Commands Requiring Approval

These use installed dependencies, package manager scripts, build, or test execution:

```bash
npm install
npm run build
npm run test:unit
npm test
npm run test:no-pro
npm run start
```

Preferred post-approval verification sequence:

```bash
npm install
npm run build
npm run test:unit
```

Manual local runtime verification after approval:

```bash
COMET_HOST=127.0.0.1 \
COMET_PORT=9223 \
COMET_USER_DATA_DIR="$HOME/Library/Application Support/comet-mcp-agent-profile" \
COMET_UPLOAD_DIR="$HOME/Library/Application Support/comet-mcp-uploads" \
node dist/index.js
```

## Security Acceptance Criteria

- CDP always binds to `127.0.0.1`; no launch path can bind to `0.0.0.0` or LAN addresses.
- CDP client connections use validated loopback host and port.
- Comet always launches with a dedicated `--user-data-dir`.
- Default/personal browser profiles are rejected.
- `COMET_USER_DATA_DIR` override is accepted only when absolute, dedicated, and not a known personal/default browser profile.
- Broad process killing is removed from default behavior.
- `COMET_ALLOW_RESTART=1` does not permit killing unrelated Comet instances.
- File uploads are allowed only from canonical paths contained in `COMET_UPLOAD_DIR`.
- Symlink escapes from `COMET_UPLOAD_DIR` are rejected.
- MCP server capabilities advertise `tools` only; no `sampling`.
- `comet_mode`, `comet_ask`, `comet_poll`, and staged `comet_upload` remain available.
- Unit tests cover config parsing, path containment, launch flags, and process-kill behavior.
- README and `docs/ARGUS_RUNBOOK.md` document the safe Argus/Research Agent operating model.

## Rollback Notes

- Keep hardening changes grouped by module:
  - config: `src/config.ts`, `tests/unit/config.test.ts`
  - upload policy: `src/upload-policy.ts`, `tests/unit/upload-policy.test.ts`
  - launch/process behavior: `src/cdp-client.ts`, related tests
  - MCP/tool docs: `src/index.ts`, `README.md`, `server.json`, `docs/ARGUS_RUNBOOK.md`
- If launch hardening breaks runtime, rollback only the launch integration in `src/cdp-client.ts` while keeping config and upload tests in place.
- If upload staging blocks an urgent workflow, temporarily stage files into `COMET_UPLOAD_DIR`; do not restore arbitrary path uploads.
- If dedicated profile launch fails, fix profile path validation or directory creation; do not fall back to personal/default Comet profile.
- If process restart is needed operationally, use explicit operator-managed restart outside MCP rather than restoring `pkill` / `taskkill` behavior.