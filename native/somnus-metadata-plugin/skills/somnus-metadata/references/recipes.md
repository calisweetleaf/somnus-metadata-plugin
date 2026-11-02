---
somnus:
  schema: "somnus://metadata/core/2.0.0"
  id: "urn:somnus:artifact:01a19a69-8838-72f8-b84b-a5aed33310c5"
  revision: 1
  title: "Somnus Metadata recipes"
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
      - target_ref: "urn:somnus:artifact:01a19a69-8838-72f8-b84b-a5aed33310c5"
        aspects: ["content"]
  time: {}
  names:
    slug: "somnus-metadata-recipes"
  knowledge:
    coverage: "artifact"
    subjects: ["urn:somnus:artifact:01a19a69-8838-72f8-b84b-a5aed33310c5"]
  access:
    visibility: "internal"
    allowed_uses: ["archive", "search", "reason"]
  ingestion:
    disposition: "candidate"
    body_role: "narrative"
---
# Somnus Metadata recipes

## Derive a new artifact from an existing one

`fork /abs/file --title "New title" [--out /abs/new-file]` creates a new identity at revision 1
with a `derived_from` relation to the parent's current revision.

## Resolve conflicts

`q --conflicts` lists open conflicts:

| Kind | Meaning | Fix |
| --- | --- | --- |
| `revision` | Same artifact and revision on disk with different content | `bump PATH --reason "..."` |
| `duplicate-id` | One ID at two paths with different content | Make the copies byte-identical, or `fork` one into a new identity |
| `identity` | A path now holds a different artifact ID | `bump PATH` accepts the current file; or restore the original |
| `authority` | Two accepted artifacts claim the same scope and aspect | No command edits `authority`; report it to the operator, who decides which acceptance stands |

`bump` resolves `revision` and `identity` conflicts for its artifact. The others close
automatically when `index` no longer observes the condition.

## Regions inside a document

Mark a section with `<!-- somnus:region:begin r-id -->` ... `<!-- somnus:region:end r-id -->`
in Markdown, `# somnus:region:begin r-id` (the language's line comment) or
`/* somnus:region:begin r-id */` in code, then `regions /abs/file --sync --write` to
register the markers in the header.

## Upgrade v0.1 documents

`migrate /abs/file` shows the diff; `migrate /abs/file --write` applies it.

## Field documentation

`schema` lists fields; `schema classification.type` documents one field and its allowed values.
`schema --json-schema --out /abs/schema.json` exports JSON Schema Draft 2020-12.

## Registry SQL

`q` runs one read-only statement. Useful views and tables:

- `docs` (present artifacts with path), `open_conflicts`, `history` (events, newest first)
- `artifacts`, `revisions` (with canonical `header_yaml`), `locations`, `tags`, `relations`,
  `claims`, `entities`, `regions`, `events`
- `search` (FTS5; columns `path`, `title`, `summary`, `tags`, `body`; rowid = `locations.id`):
  `q "SELECT path FROM search WHERE search MATCH 'title : roadmap' LIMIT 5"`

Add `--tsv` for tab-separated output and `--limit N` to cap rows.

## Stale-work report

`stale [--days N]` reports stale drafts, superseded artifacts without a replacement, missing
files, near-duplicate titles, and open conflicts.
