---
somnus:
  schema: "somnus://metadata/core/2.0.0"
  id: "urn:somnus:artifact:01a19a69-885b-72d6-9a9f-685269ecb432"
  revision: 4
  title: "Setup and troubleshooting"
  classification:
    category: "engineering"
    type: "report"
    role: "informative"
    scope: "component"
    tags: []
  lifecycle:
    status: "draft"
  authority:
    standing: "candidate"
    scopes:
      - target_ref: "urn:somnus:artifact:01a19a69-885b-72d6-9a9f-685269ecb432"
        aspects: ["content"]
  time:
    updated_at: "2026-11-06T08:17:31+00:00"
  names:
    slug: "setup-and-troubleshooting"
  knowledge:
    coverage: "artifact"
    subjects: ["urn:somnus:artifact:01a19a69-885b-72d6-9a9f-685269ecb432"]
  access:
    visibility: "internal"
    allowed_uses: ["archive", "search", "reason"]
  ingestion:
    disposition: "candidate"
    body_role: "narrative"
---
# Setup and troubleshooting

## Install the backend

The backend is the `somnus-metadata` package on PyPI (stdlib only, Python 3.11+). It installs
two identical commands: `somnus` and `somnus-metadata`.

The plugin is a separate host-agnostic distribution of this skill plus MCP configuration.
Factory Droid, Codex, Antigravity, and OpenCode use the same backend and registry; a
host-specific adapter does not make the system host-specific. Install or upgrade the
Python package separately from editing its source checkout. For all-file discovery use
backend 2.1.1 or newer; for universal inline carriers and the watcher, 2.2.0 or newer. Re-run the plugin installer after changing packaged skills so
all installed hosts receive the same operational guidance; doctor verifies copy fidelity.

```sh
python3 -m venv ~/.venvs/global          # once; put ~/.venvs/global/bin on PATH
~/.venvs/global/bin/pip install -U somnus-metadata
somnus --version
```

`uv tool install somnus-metadata` and `pipx install somnus-metadata` work too. On a
system Python that refuses `pip install` (PEP 668, "externally managed"), use a venv.

## Run the watcher 24/7 (backend 2.2.0+)

```sh
somnus init --root /abs/project        # every root you want managed
somnus daemon install                  # systemd user unit, launchd agent, or Windows logon task
somnus daemon status                   # running, roots, stamped, revised, errors
loginctl enable-linger "$USER"         # Linux: keep running while logged out
```

`somnus-plugin install --watch` does the `daemon install` step for you. Settings live under
`[watch]` in `~/.somnus/config.toml`: `stamp = "inline"` (default; never creates sidecars),
`revise = "auto"`, `settle = 10.0`, `adopt = false`.

## Native plugin registration versus direct adapters

A skill file plus MCP entry is a direct adapter, not an installed native plugin.
For a native Codex installation, register the package's marketplace and run
`codex plugin add somnus-metadata-plugin@somnus-metadata-plugin`; verify
`codex plugin list --json` reports `installed: true` and `enabled: true`.
For Factory, register the same checkout with `droid plugin marketplace add`, then
`droid plugin install somnus-metadata-plugin@somnus-metadata-plugin --scope user`;
verify `droid plugin list --scope user`. See the package README for complete commands.
The shared native MCP config invokes the global `somnus` executable on PATH.
Codex and Factory manage native caches; never hand-copy into or wipe their caches.
Use native remove/uninstall and install when a clean refresh is needed.
The direct installer/doctor below tests compatibility copies and MCP handshakes,
not native plugin registration. A working tool call is not a substitute for the
host's installed/enabled plugin record.

## Where the direct adapter puts things

`somnus-plugin install` copies this skill and registers the MCP server `somnus-metadata`
for each host it finds:

| Host | Skill directory | MCP configuration |
| --- | --- | --- |
| Factory Droid | `~/.factory/skills/somnus-metadata` | `~/.factory/mcp.json` |
| Codex | `~/.codex/skills/custom/somnus-metadata` | managed block in `~/.codex/config.toml` |
| Google Antigravity | `~/.gemini/skills/somnus-metadata` | `~/.gemini/config/plugins/somnus-metadata/mcp_config.json` |
| OpenCode | `~/.config/opencode/skills/somnus-metadata` | `mcp.somnus-metadata` in `opencode.jsonc` or `opencode.json` |

Each MCP entry runs `somnus --actor HOST mcp` with an absolute path to `somnus`, so the
host does not depend on its own PATH. Config files are backed up before every change.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "registry does not exist" | Run `init --root /abs/project`, then `index`. |
| A path is "not found" over MCP | The path was relative. Pass an absolute path. |
| The MCP tools do not appear in the host | Restart the host. Then run `somnus-plugin doctor`, which performs a live handshake per host. |
| `doctor` reports skill drift | The installed copy differs from the plugin's. Re-run `somnus-plugin install`. |
| OpenCode config was not changed | `opencode.jsonc` has comments, which the plugin will not rewrite. Paste the printed snippet into the `mcp` object by hand. |
| `E_HOST` on a write | The write would change bytes outside the metadata envelope, so it was refused. The file is unchanged; report it. |
| `index` reports a revision conflict | A managed file's body changed without a revision. Run `bump PATH --reason "..."`, or run the watcher with `revise = "auto"`. |
| `doctor` warns the watcher never ran | Run `somnus daemon install` (or `somnus-plugin install --watch`). |
| New files are not stamped | The watcher only stamps files created after it started and settled for `settle` seconds; adopt older ones with `somnus daemon once --adopt` or `stamp --write`. |
| Wrong `somnus` runs | `which -a somnus` shows every copy. Re-run `somnus-plugin install --somnus /abs/path/to/somnus`. |

The registry lives at `~/.somnus/somnus.db` unless `SOMNUS_HOME` points elsewhere. Exit codes:
`0` ok, `1` validation errors, refusals, or conflicts, `2` usage or I/O errors.