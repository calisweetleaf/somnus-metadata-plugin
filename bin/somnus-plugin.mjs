#!/usr/bin/env node
import { main } from '../lib/cli.mjs';

// A closed pipe (`somnus-plugin doctor | head`) is not a failure of the command.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(process.exitCode ?? 0);
  throw err;
});

process.exitCode = await main(process.argv.slice(2));
