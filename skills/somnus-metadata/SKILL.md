---
name: somnus-metadata
description: >-
  Use the Somnus Metadata registry (somnus CLI or the somnus-metadata MCP server) to find,
  adopt, create, validate, and evolve documents and files. Use it proactively: search the
  registry before writing a new doc, spec, plan, decision, or runbook; adopt files the user
  wants tracked; and record header, lifecycle, and revision changes through its commands
  instead of hand-editing metadata. Applies to any file type (Markdown, code, config, or a
  sidecar for anything else) under a registered root.
somnus:
  schema: "somnus://metadata/core/2.0.0"
  id: "urn:somnus:artifact:01a19a69-881a-7245-966c-ff3762ab3c0a"
  revision: 5
  title: "Somnus Metadata"
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
      - target_ref: "urn:somnus:artifact:01a19a69-881a-7245-966c-ff3762ab3c0a"
        aspects: ["content"]
  time:
    updated_at: "2026-11-06T08:17:31+00:00"
  names:
    slug: "somnus-metadata"
  knowledge:
    coverage: "artifact"
    subjects: ["urn:somnus:artifact:01a19a69-881a-7245-966c-ff3762ab3c0a"]
  access:
    visibility: "internal"
    allowed_uses: ["archive", "search", "reason"]
  ingestion:
    disposition: "candidate"
    body_role: "narrative"
---

# Somnus Metadata

Somnus Metadata gives every managed file one `somnus:` header, inside the file wherever the
format allows (Markdown frontmatter; a comment envelope in code, config, and build files,
including `Dockerfile`, `Makefile`, `CODEOWNERS`, `.gitignore`, and shebang scripts;
`metadata.somnus` in notebooks; opt-in `"$somnus"` in JSON). Only formats with no place for it
(plain text, CSV, binaries, strict JSON by default) use a `<file>.somnus.yaml` sidecar. One
global SQLite registry (`~/.somnus/somnus.db`) holds identity, revisions, relations, claims,
entities, conflicts, and a full-text index, so the whole collection can be queried and
reasoned over, not just found.

Three parts, one backend:

- **The watcher** (`somnus watch`, installed 24/7 with `somnus daemon install`) stamps new
  files, records in-place edits as new revisions, and keeps the registry current. Check it
  with `daemon status` (MCP: `daemon` with `action: status`). It is not the MCP server.

- **MCP server `somnus-metadata`**: one tool per command (`q`, `ls`, `check`, `stamp`, `new`,
  `set`, `status`, `bump`, `index`, `stale`, ...). Tool results are the command's text or TSV.
- **CLI `somnus`** (alias `somnus-metadata`): identical commands and flags. Use it when you
  have a shell. Install with `pip install -U somnus-metadata` in a venv on PATH. Humans also
  get `somnus edit`, a terminal UI over the same registry.

The live cheat sheet is `somnus brief` (MCP: `brief`); the server's instructions carry it too.

## Host-agnostic operating contract

This skill is the shared usage layer for Factory Droid, Codex, Antigravity, OpenCode,
and other compatible agents. No host owns the system. The separately installed Python
package owns behavior; the plugin distributes this skill and registers host adapters.
Use the installed executable or MCP tools, not a developer checkout's source path.
A source update is not an installed-backend update. A direct skill/MCP adapter is not
a native plugin installation: check the host's installed/enabled plugin list separately.
Neither installation record proves live use. Check the backend version and exercise the
relevant tool; see setup for native versus compatibility installation.

The skill supplies proactive retrieval and maintenance habits, not permission to modify
unrelated files or mass-adopt a user's machine. Respect the current task and root exclusions.

## Be proactively useful

- **Search before you create.** Before writing any new document, run `q --text "key words"`
  (every word must match; `word*` is a prefix). If something relevant exists, extend or fork it.
- **Answer "where is / what do we know about X" from the registry first**: `q --text`, then
  `ls --tag T`, `ls --type T`, or `ls --path-contains P`.
- **After you edit a managed file, record the revision and validate it**:
  `bump PATH --reason "what changed"`, then `check PATH --level semantic`.
  Do not bump again when the owning metadata command already created the revision.
- **When the user wants files tracked or searchable, adopt them** (see Adopt below).
- **At the end of substantial doc work, check health**: `stale` and `q --conflicts`.

## Rules that keep the registry true

- Never invent IDs, dates, actors, licenses, evidence, or acceptance records. Tools fill them.
- Never hand-edit the `somnus:` header. Use `set` for title, summary, purpose, classification
  (`category`, `type`, `role`, `scope`, `tags`), `access.visibility`, `ingestion.disposition`.
  Unknown fields are errors; tool-specific data goes under `extensions.<owner>`.
- Lifecycle changes go through `status`, never by editing `lifecycle.status`.
- Changed the body of an indexed file? Record it with `bump PATH --reason "..."`. Otherwise the
  next `index` opens a revision conflict. When `daemon status` shows the watcher running with
  `revise = auto`, it records that revision itself after the file settles; bump anyway when you
  want a reason on the record, and re-read a file before editing its envelope.
- `role: normative` is intent, not acceptance. Only `authority.standing: accepted` is authoritative.
- With MCP, **pass absolute paths**. Relative paths resolve from the server's directory.
- **Use `tsv: true` for MCP queries and listings when an agent needs complete paths or fields.**
  Human-readable tables truncate long cells with `…`; TSV preserves their full values.
  The CLI equivalent is `--tsv`. Never guess the missing suffix of a truncated path.

## Core workflows

**First run.** If a command says the registry does not exist, run `init --root /abs/project`.
Register more projects with `init --root DIR`, then `index`. Inspect existing roots first;
do not register a child of an already registered root just to scan that project.
Review exclusions before broad adoption. An unmanaged file is discovered, not yet searchable;
a search miss is not evidence of absence while the relevant root is unregistered or unmanaged.

**Adopt an existing file (any type).**
1. `stamp /abs/file` shows the header it would add (dry run).
2. `stamp /abs/file --write` writes it (add `--type T --title "..."` to override inference).
   Only files without an embedded carrier get a `<file>.somnus.yaml` sidecar. Plain `.json`
   objects can carry `"$somnus"` instead with `--inline`.
3. The file is now in the registry and searchable. `index` reports remaining unmanaged files
   (its examples are bounded, not an exhaustive path list). Backend 2.1.1+ discovers
   unmanaged sidecar-only hosts too, including JSON, text and binaries.

For immutable originals, signed/hash-bound baselines, or live source, do not blindly stamp
an inline envelope. The standard permits a sidecar even for supported source extensions;
use a verified backend-owned preservation workflow, or leave that host untouched and report
it. Never invent a sidecar payload or assume the CLI exposes a forced-sidecar flag.

**Create a new document.** `new TYPE "Title" --dir /abs/dir` (types: specification, plan,
decision-record, runbook, report, notepad, architecture-record, whitepaper, task, memory, ...).
A near-duplicate registered title is refused; search first, or pass `--force` deliberately.

**Edit header fields.** `set /abs/file title="New title" "classification.tags=a, b" --reason "..."`
(one validated new revision; an empty summary or purpose removes it).

**Move through the lifecycle.** `status /abs/file NEW_STATUS --reason "..."`.
Common path: `draft -> proposed -> active -> superseded|deprecated|historical`. A refused
transition lists the allowed next states. Superseding takes `--replacement URN`.

**Validate.** `check PATH... --level core|semantic|canon` (or `--all` for every root).

**Find things.** `q --text "words"`, `ls [--type T] [--status S] [--tag T] [--path-contains P]`,
`q --docs`, `q --conflicts`, `q --history`, or read-only SQL: `q "SELECT ... FROM docs"`
(`q --tables` lists tables and views).

**Keep it fresh.** `index` reconciles every registered root (incremental; `--full` re-reads).
With the watcher running this happens continuously. Old sidecars for hosts that now have a
carrier move inline with `migrate --inline /abs/root` (dry run) then `--write`.

**Reason over the collection.** The registry is a graph, not just a search index. Before
answering a design or "what do we know" question, pull the structure, then read the files:

- What points at X: `q "SELECT artifact_id, predicate FROM relations WHERE object_ref = 'URN'"`
- What X depends on or derives from: `q "SELECT predicate, object_ref FROM relations WHERE artifact_id = 'URN'"`
- Claims about a subject, with their assessment: `q "SELECT artifact_id, statement, assessment FROM claims WHERE subject_ref = 'URN'"`
- What is authoritative: `ls --standing accepted`; what is in flux: `ls --status draft`, `q --conflicts`
- What changed recently: `q --history --limit 20`

Treat `accepted` standing as authority, candidates as proposals, and open conflicts as
unresolved. Cite the artifact `id` and path you relied on.

Exit codes: `0` ok, `1` validation errors, refusals, or conflicts, `2` usage or I/O errors.
On MCP a non-zero exit sets `isError` and the text ends with `[exit N]`. Read the diagnostic:
it names the file, line, field, code, and usually the fix.

## References

- [references/mcp-tools.md](references/mcp-tools.md): every MCP tool, its arguments, and
  the controlled values for types, statuses, and standing.
- [references/recipes.md](references/recipes.md): fork, regions, migration, conflicts, and
  registry SQL.
- [references/setup.md](references/setup.md): installing the backend, where each host keeps
  this skill and the MCP entry, and troubleshooting.
