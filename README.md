# somnus-metadata-plugin

Private agent adapter for [Somnus Metadata](https://github.com/calisweetleaf/somnus-metadata).
It installs one skill and registers the `somnus-metadata` MCP server in each agent host:

| Host | Skill | MCP server |
| --- | --- | --- |
| Factory Droid | `~/.factory/skills/somnus-metadata/` | `mcpServers.somnus-metadata` in `~/.factory/mcp.json` |
| Codex | `$CODEX_HOME/skills/somnus-metadata/` (default `~/.codex`) | managed `[mcp_servers.somnus-metadata]` block in `config.toml` |
| Google Antigravity | inside the plugin | plugin `~/.gemini/config/plugins/somnus-metadata/` (`plugin.json`, `mcp_config.json`, `skills/`) |

Layering: the Python backend (`somnus-metadata` on PyPI, command `somnus`) owns all behavior.
The CLI and MCP server adapt that backend, and this plugin only adapts hosts to the MCP server.
It holds no metadata logic, so a backend release never requires a plugin release.
Each host runs `somnus --actor <host> mcp`, so the registry's event ledger records which agent
made each change.

## Use

Requires Node.js 18.17+ and `somnus` 2.1.0+.

```sh
npx github:calisweetleaf/somnus-metadata-plugin install            # every host present
npx github:calisweetleaf/somnus-metadata-plugin install --host codex,droid --dry-run
npx github:calisweetleaf/somnus-metadata-plugin doctor             # skill-drift check + live MCP handshake per host
npx github:calisweetleaf/somnus-metadata-plugin hosts              # list supported hosts and install status
npx github:calisweetleaf/somnus-metadata-plugin uninstall
```

Without the backend, add `--install-backend somnus-metadata` (or a source checkout path) to run
`uv tool install --force` first (pipx when uv is absent). Restart each host after installing.

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
npm test        # node --test (18 tests); uses a fake somnus and a temporary home
```

The skill lives in `skills/somnus-metadata/` (`SKILL.md` plus `references/`).
