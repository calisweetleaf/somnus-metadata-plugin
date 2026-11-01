---
name: somnus-metadata
description: >-
  Use the Somnus Metadata registry (somnus CLI or the somnus-metadata MCP server) to find,
  adopt, create, validate, and evolve documents and files. Use it proactively: search the
  registry before writing a new doc, spec, plan, decision, or runbook; adopt files the user
  wants tracked; and record header, lifecycle, and revision changes through its commands
  instead of hand-editing metadata. Applies to any file type (Markdown, code, config, or a
  sidecar for anything else) under a registered root.
---

# Somnus Metadata

Somnus Metadata gives every managed file one `somnus:` header (Markdown frontmatter, a
comment envelope in code/config, or a `<file>.somnus.yaml` sidecar for any other file type)
and keeps one global SQLite registry (`~/.somnus/somnus.db`) with identity, revisions,
relations, conflicts, and a full-text index of file content.

Two equivalent surfaces reach the same backend:

- **MCP server `somnus-metadata`**: one tool per command (`q`, `ls`, `check`, `stamp`, `new`,
  `set`, `status`, `bump`, `index`, `stale`, ...). Tool results are the command's text or TSV.
- **CLI `somnus`** (alias `somnus-metadata`): identical commands and flags. Use it when you
  have a shell. Install with `pip install -U somnus-metadata` in a venv on PATH.

The live cheat sheet is `somnus brief` (MCP: `brief`); the server's instructions carry it too.

## Be proactively useful

- **Search before you create.** Before writing any new document, run `q --text "key words"`
  (every word must match; `word*` is a prefix). If something relevant exists, extend or fork it.
- **Answer "where is / what do we know about X" from the registry first**: `q --text`, then
  `ls --tag T`, `ls --type T`, or `ls --path-contains P`.
- **After you edit a managed file, validate it**: `check PATH --level semantic`.
- **When the user wants files tracked or searchable, adopt them** (see Adopt below).
- **At the end of substantial doc work, check health**: `stale` and `q --conflicts`.

## Rules that keep the registry true

- Never invent IDs, dates, actors, licenses, evidence, or acceptance records. Tools fill them.
- Never hand-edit the `somnus:` header. Use `set` for title, summary, purpose, classification
  (`category`, `type`, `role`, `scope`, `tags`), `access.visibility`, `ingestion.disposition`.
  Unknown fields are errors; tool-specific data goes under `extensions.<owner>`.
- Lifecycle changes go through `status`, never by editing `lifecycle.status`.
- Changed the body of an indexed file? Record it with `bump PATH --reason "..."`. Otherwise the
  next `index` opens a revision conflict.
- `role: normative` is intent, not acceptance. Only `authority.standing: accepted` is authoritative.
- With MCP, **pass absolute paths**. Relative paths resolve from the server's directory.

## Core workflows

**First run.** If a command says the registry does not exist, run `init --root /abs/project`.
Register more projects with `init --root DIR`, then `index`.

**Adopt an existing file (any type).**
1. `stamp /abs/file` shows the header it would add (dry run).
2. `stamp /abs/file --write` writes it (add `--type T --title "..."` to override inference).
   Files without an embedded carrier get a `<file>.somnus.yaml` sidecar.
3. The file is now in the registry and searchable. `index` lists remaining unmanaged files.

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
