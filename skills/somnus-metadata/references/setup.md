# Setup and troubleshooting

## Install the backend

The backend is the `somnus-metadata` package on PyPI (stdlib only, Python 3.11+). It installs
two identical commands: `somnus` and `somnus-metadata`.

```sh
python3 -m venv ~/.venvs/global          # once; put ~/.venvs/global/bin on PATH
~/.venvs/global/bin/pip install -U somnus-metadata
somnus --version
```

`uv tool install somnus-metadata` and `pipx install somnus-metadata` work too. On a
system Python that refuses `pip install` (PEP 668, "externally managed"), use a venv.

## Where the plugin puts things

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
| `index` reports a revision conflict | A managed file's body changed without a revision. Run `bump PATH --reason "..."`. |
| Wrong `somnus` runs | `which -a somnus` shows every copy. Re-run `somnus-plugin install --somnus /abs/path/to/somnus`. |

The registry lives at `~/.somnus/somnus.db` unless `SOMNUS_HOME` points elsewhere. Exit codes:
`0` ok, `1` validation errors, refusals, or conflicts, `2` usage or I/O errors.