#!/usr/bin/env node
// somnus:metadata:v2
// somnus:
//   schema: "somnus://metadata/core/2.0.0"
//   id: "urn:somnus:artifact:01a19a69-87c1-749d-ae00-2a30624a6c84"
//   revision: 1
//   title: "Somnus Plugin"
//   classification:
//     category: "engineering"
//     type: "source-code"
//     role: "informative"
//     scope: "component"
//     tags: []
//   lifecycle:
//     status: "draft"
//   authority:
//     standing: "candidate"
//     scopes:
//       - target_ref: "urn:somnus:artifact:01a19a69-87c1-749d-ae00-2a30624a6c84"
//         aspects: ["content"]
//   time: {}
//   names:
//     slug: "somnus-plugin"
//   knowledge:
//     coverage: "artifact"
//     subjects: ["urn:somnus:artifact:01a19a69-87c1-749d-ae00-2a30624a6c84"]
//   access:
//     visibility: "internal"
//     allowed_uses: ["archive", "search", "reason"]
//   ingestion:
//     disposition: "candidate"
//     body_role: "source"
// somnus:end
import { main } from '../lib/cli.mjs';

// A closed pipe (`somnus-plugin doctor | head`) is not a failure of the command.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(process.exitCode ?? 0);
  throw err;
});

process.exitCode = await main(process.argv.slice(2));
