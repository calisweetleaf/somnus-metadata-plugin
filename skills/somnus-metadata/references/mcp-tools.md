---
somnus:
  schema: "somnus://metadata/core/2.0.0"
  id: "urn:somnus:artifact:01a19a69-8828-754a-9252-818248ed7990"
  revision: 1
  title: "MCP tool reference"
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
      - target_ref: "urn:somnus:artifact:01a19a69-8828-754a-9252-818248ed7990"
        aspects: ["content"]
  time: {}
  names:
    slug: "mcp-tool-reference"
  knowledge:
    coverage: "artifact"
    subjects: ["urn:somnus:artifact:01a19a69-8828-754a-9252-818248ed7990"]
  access:
    visibility: "internal"
    allowed_uses: ["archive", "search", "reason"]
  ingestion:
    disposition: "candidate"
    body_role: "narrative"
---
# MCP tool reference

The `somnus-metadata` MCP server (`somnus mcp`, stdio JSON-RPC) exposes 16 tools, one per
non-interactive CLI command. Arguments mirror the CLI flags with `-` replaced by `_`. Every
tool also accepts `tsv: true` for tab-separated output. Results are the command's text or
TSV; a non-zero exit sets `isError` and the text ends with `[exit N]`.

Pass absolute paths. The server resolves relative paths from its own working directory,
which is usually not the project you are in.

## Read-only tools

| Tool | Arguments | Use |
| --- | --- | --- |
| `q` | `text`, `sql`, `docs`, `conflicts`, `history`, `tables`, `limit` | Full-text search (`text`: every word must match, `word*` is a prefix), read-only SQL, or the canned views. |
| `ls` | `type`, `status`, `standing`, `tag`, `path_contains` | List present artifacts with filters. |
| `check` | `paths[]`, `all`, `level` (`carrier`, `core`, `semantic`, `canon`) | Validate files and print diagnostics. |
| `stale` | `days` | Stale drafts, superseded without replacement, missing files, near-duplicates, conflicts. |
| `brief` | (none) | The Markdown cheat sheet. |

## Tools that write files or the registry

| Tool | Required | Optional | Effect |
| --- | --- | --- | --- |
| `init` | (none) | `root[]` | Create `$SOMNUS_HOME`, config, registry; register roots. |
| `index` | (none) | `roots[]`, `full` | Reconcile roots into the registry. |
| `stamp` | `paths[]` | `write`, `type`, `title` | Adopt unmanaged files. Dry-run diff unless `write: true`. |
| `new` | `type`, `title` | `dir`, `carrier` (`frontmatter`, `html-comment`), `status`, `force` | Scaffold a conformant Markdown artifact. |
| `set` | `path`, `assignments[]` | `reason` | Edit header fields; one new revision. |
| `status` | `path`, `new_status` | `reason`, `replacement[]` | Validated lifecycle transition. |
| `bump` | `path` | `reason` | New revision; resolves `revision` and `identity` conflicts. |
| `fork` | `path` | `out`, `title` | New identity derived from the current revision. |
| `regions` | `path` | `sync`, `write` | Audit region markers; `sync` + `write` registers them. |
| `migrate` | `paths[]` | `write` | Upgrade v0.1 documents. Dry-run diff unless `write: true`. |
| `schema` | (none) | `field`, `json_schema`, `out` | Field docs; `json_schema` + `out` writes a JSON Schema file. |

`set` assignments are `field=value` strings. Editable fields: `title`, `summary`, `purpose`,
`classification.category`, `classification.type`, `classification.role`,
`classification.scope`, `classification.tags` (comma-separated), `access.visibility`,
`ingestion.disposition`. An empty `summary` or `purpose` removes it.

## Controlled values

- Types: whitepaper, specification, architecture-record, report, task, plan, notepad,
  benchmark, test-result, decision-record, runbook, index, state, memory, source-code,
  configuration, dataset, equation-set, conversation, asset.
- Statuses: draft, proposed, provisional, active, experimental, superseded, deprecated,
  historical, archived, rejected.
- Standing (`ls --standing`): unasserted, candidate, accepted, retired, rejected.

`schema FIELD` prints the allowed values for any field; trust it over this page if they differ.

## Example calls

```json
{"name": "q", "arguments": {"text": "registry recovery", "limit": 5}}
{"name": "stamp", "arguments": {"paths": ["/home/me/proj/notes/design.md"], "write": true}}
{"name": "set", "arguments": {"path": "/home/me/proj/PLAN.md", "assignments": ["classification.tags=roadmap, q4"], "reason": "tag for search"}}
{"name": "status", "arguments": {"path": "/home/me/proj/PLAN.md", "new_status": "active", "reason": "approved"}}
```