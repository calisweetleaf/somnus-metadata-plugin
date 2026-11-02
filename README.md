---
somnus:
  schema: "somnus://metadata/core/2.0.0"
  id: "urn:somnus:artifact:01a19a69-87b3-76bf-bbae-83b732aa9e46"
  revision: 5
  title: "somnus-metadata-plugin"
  classification:
    category: "context"
    type: "index"
    role: "informative"
    scope: "component"
    tags: []
  lifecycle:
    status: "draft"
  authority:
    standing: "candidate"
    scopes:
      - target_ref: "urn:somnus:artifact:01a19a69-87b3-76bf-bbae-83b732aa9e46"
        aspects: ["content"]
  time:
    updated_at: "2026-11-02T06:47:14+00:00"
  names:
    slug: "somnus-metadata-plugin"
  knowledge:
    coverage: "artifact"
    subjects: ["urn:somnus:artifact:01a19a69-87b3-76bf-bbae-83b732aa9e46"]
  access:
    visibility: "internal"
    allowed_uses: ["archive", "search", "reason"]
  ingestion:
    disposition: "candidate"
    body_role: "narrative"
---
# somnus-metadata-plugin

Host-agnostic skill and adapter package for [Somnus Metadata](https://github.com/calisweetleaf/somnus-metadata).
Factory Droid, Codex, Antigravity, and OpenCode are peer consumers, not owners of the system.
Native plugin packages for Codex and Factory share the same skill and portable
`mcp.json`. Install them through the host's plugin manager to get a real installed
plugin entry. The Node CLI below remains a direct skill/MCP compatibility adapter;
its successful doctor check is **not** proof of native plugin registration.

## Native Codex and Factory installation

Prerequisite: the global pip-installed `somnus` executable must be on the host's PATH.
From a local checkout (replace the path with your checkout):

```sh
codex plugin marketplace add /absolute/path/to/somnus-metadata-plugin
codex plugin add somnus-metadata-plugin@somnus-metadata-plugin
codex plugin list --json

droid plugin marketplace add /absolute/path/to/somnus-metadata-plugin
droid plugin install somnus-metadata-plugin@somnus-metadata-plugin --scope user
droid plugin list --scope user
```

This release declares no hooks. Codex and Factory have different hook contracts;
no Codex hooks are copied into Factory, and no global hook settings are changed.
Any future hook must be implemented and tested against its host's own event payloads.

The native catalogs select the checked-in production payload at
`native/somnus-metadata-plugin/`, not this development checkout's root. That payload
contains only the manifests, MCP configuration and canonical shared skill/reference
copies. Repository indexing sidecars, package.json, .gitignore and Node adapter code
are not runtime plugin assets and are not shipped in the native installation.
Run `npm run build:native` after changing runtime manifests or skills; `npm test`
rejects stale or unexpected exported files. No metadata is stripped from source:
Markdown keeps its embedded frontmatter and code keeps its comment envelopes.

Both use marketplace ID `somnus-metadata-plugin`. Codex owns its versioned copy
under `$CODEX_HOME/plugins/cache/`; Factory owns its cache under `~/.factory/plugins/cache/`.
Use `codex plugin remove` / `droid plugin uninstall` followed by native install for
a clean refresh. Do not clear unrelated caches. Native MCP calls identify their actor
as `somnus-metadata-plugin`; the direct adapters below retain per-host actors.

## Direct adapters (compatibility installation)

These copy the shared skill and register MCP directly, outside the native plugin managers:

| Host | Skill | MCP server |
| --- | --- | --- |
| Factory Droid | `~/.factory/skills/somnus-metadata/` | `mcpServers.somnus-metadata` in `~/.factory/mcp.json` |
| Codex | `$CODEX_HOME/skills/custom/somnus-metadata/` (default `~/.codex`) | managed `[mcp_servers.somnus-metadata]` block in `config.toml` |
| Google Antigravity | `~/.gemini/skills/somnus-metadata/` | plugin `~/.gemini/config/plugins/somnus-metadata/` (`plugin.json`, `mcp_config.json`) |
| OpenCode | `~/.config/opencode/skills/somnus-metadata/` | `mcp.somnus-metadata` in `opencode.jsonc` or `opencode.json` |

Upgrading from 1.0.0 moves the skill out of the old Codex location (`~/.codex/skills/somnus-metadata/`)
and the old Antigravity plugin `skills/` copy, but only when the old directory carries this tool's marker.
An `opencode.jsonc` that contains comments is never rewritten; install prints the entry to paste instead.

Layering: the Python backend (`somnus-metadata` on PyPI, command `somnus`) owns all behavior.
The CLI and MCP server adapt that backend, and this plugin only adapts hosts to the MCP server.
It holds no metadata logic: a backend-only fix does not by itself require adapter-code changes.
When backend behavior changes usage, update this package's shared skill and references,
then reinstall and verify the affected hosts. The skill is part of the delivered capability,
not optional documentation; agents need its retrieval, revision, and preservation workflows.
The adapter launches the installed Python executable, not this repository or a backend
source checkout. A source edit alone does not update the global pip installation.
Each direct adapter runs `somnus --actor <host> mcp`, so its registry events retain
host attribution. Native packages use the shared plugin actor described above.

## Direct adapter commands

Requires Node.js 18.17+ and `somnus` 2.1.0+. Use backend 2.1.1+ for complete unmanaged
file discovery, including files that require sidecars.

```sh
npx github:calisweetleaf/somnus-metadata-plugin install            # every host present
npx github:calisweetleaf/somnus-metadata-plugin install --host codex,droid --dry-run
npx github:calisweetleaf/somnus-metadata-plugin doctor             # skill-drift check + live MCP handshake per host
npx github:calisweetleaf/somnus-metadata-plugin hosts              # list supported hosts and install status
npx github:calisweetleaf/somnus-metadata-plugin uninstall
```

Install the backend with `pip install -U somnus-metadata` in a virtual environment on PATH
(`uv tool install somnus-metadata` and `pipx install somnus-metadata` also work). Or add
`--install-backend somnus-metadata` (or a source checkout path): it runs
`pip install --upgrade` first and falls back to `uv tool`, then `pipx`, if pip is missing or
refuses (PEP 668). Restart each host after installing.

## Safety

- Every edited config is backed up to `<file>.bak-somnus-plugin-<UTC stamp>` before it changes;
  unchanged configs are not rewritten.
- Codex edits stay inside a marked block, preserve existing `CRLF`/`LF` line endings, and restore
  even files without a trailing newline byte-for-byte on `uninstall`; a `[mcp_servers.somnus-metadata]`
  table defined elsewhere is refused rather than overwritten.
- Directories carry a `.somnus-plugin.json` marker (recording `plugin`, `version`, `skillHash`, and
  `installedAt`). Install refuses to replace, and uninstall leaves, any directory without it (`--force`
  replaces one deliberately). `doctor` hashes each installed skill tree (`SHA-256` over sorted
  slash-normalized relative paths, excluding `.somnus-plugin.json`) against the packaged skill and
  reports `FAIL` on content drift.
- On Windows (`win32`), `.cmd`/`.bat` tool wrappers (`somnus.cmd`, `uv.cmd`, `pipx.cmd`) are spawned
  through `spawnForm()` with `shell: true` and whitespace-quoted arguments so Node.js 18.20+ does not
  fail with `EINVAL` during backend checks, installs, or MCP handshakes.
- Uninstall removes only what install added; the backend and registry stay.

## Develop

```sh
npm test        # node --test; uses a fake somnus and a temporary home
```

The skill lives in `skills/somnus-metadata/` (`SKILL.md` plus `references/`).
