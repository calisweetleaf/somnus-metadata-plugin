import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { main, parse } from '../lib/cli.mjs';
import { codexBlock, withCodexBlock, withoutCodexBlock } from '../lib/hosts.mjs';

const FAKE_SOMNUS = `#!/usr/bin/env node
const args = process.argv.slice(2);
const version = process.env.FAKE_SOMNUS_VERSION || '2.1.0';
if (args.includes('--version')) { console.log('somnus ' + version); process.exit(0); }
if (args.includes('ls')) { console.log('id\\ttitle'); process.exit(0); }
if (args.includes('mcp')) {
  let buf = '';
  process.stdin.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (msg.id === 1) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'somnus', version } } }) + '\\n');
      if (msg.id === 2) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'q' }, { name: 'ls' }, { name: 'check' }] } }) + '\\n');
    }
  });
} else { process.exit(2); }
`;

const ORIGINAL_TOML = '[mcp_servers.other]\ncommand = "other"\n';
const ORIGINAL_MCP = { mcpServers: { Other: { type: 'stdio', command: 'other' } } };

let home;
let somnus;
let lines;

function run(...argv) {
  lines = [];
  return main([...argv, '--home', home], {
    out: (m) => lines.push(m), err: (m) => lines.push(m), env: { PATH: process.env.PATH },
  });
}

const read = (...p) => fs.readFileSync(path.join(home, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(home, ...p));

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'somnus-plugin-'));
  somnus = path.join(home, 'bin', 'somnus');
  fs.mkdirSync(path.dirname(somnus));
  fs.writeFileSync(somnus, FAKE_SOMNUS, { mode: 0o755 });
  fs.mkdirSync(path.join(home, '.factory'));
  fs.writeFileSync(path.join(home, '.factory', 'mcp.json'), JSON.stringify(ORIGINAL_MCP, null, 2));
  fs.mkdirSync(path.join(home, '.codex'));
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), ORIGINAL_TOML);
  fs.mkdirSync(path.join(home, '.gemini', 'config'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe('install, doctor, uninstall', () => {
  it('installs into every present host and verifies a live handshake', async () => {
    assert.equal(await run('install', '--somnus', somnus), 0, lines.join('\n'));
    const droid = JSON.parse(read('.factory', 'mcp.json')).mcpServers;
    assert.deepEqual(droid.Other, ORIGINAL_MCP.mcpServers.Other);
    assert.deepEqual(droid['somnus-metadata'], {
      type: 'stdio', command: somnus, args: ['--actor', 'droid', 'mcp'], disabled: false,
    });
    assert.ok(exists('.factory', 'skills', 'somnus-metadata', 'SKILL.md'));
    assert.ok(exists('.factory', 'skills', 'somnus-metadata', 'references', 'recipes.md'));
    const toml = read('.codex', 'config.toml');
    assert.ok(toml.startsWith(ORIGINAL_TOML));
    assert.ok(toml.includes(`command = ${JSON.stringify(somnus)}\nargs = ["--actor", "codex", "mcp"]`));
    assert.ok(exists('.codex', 'skills', 'somnus-metadata', 'SKILL.md'));
    const plugin = path.join('.gemini', 'config', 'plugins', 'somnus-metadata');
    assert.equal(JSON.parse(read(plugin, 'plugin.json')).name, 'somnus-metadata');
    assert.deepEqual(JSON.parse(read(plugin, 'mcp_config.json')).mcpServers['somnus-metadata'].args,
      ['--actor', 'antigravity', 'mcp']);
    assert.ok(exists(plugin, 'skills', 'somnus-metadata', 'SKILL.md'));

    assert.equal(await run('doctor', '--somnus', somnus), 0, lines.join('\n'));
    assert.equal(lines.filter((l) => l.includes('serves 3 tools (somnus 2.1.0)')).length, 3, lines.join('\n'));
    assert.ok(lines.includes('all checks passed'));

    assert.equal(await run('uninstall'), 0, lines.join('\n'));
    assert.equal(read('.codex', 'config.toml'), ORIGINAL_TOML);
    assert.deepEqual(JSON.parse(read('.factory', 'mcp.json')), ORIGINAL_MCP);
    assert.ok(!exists('.factory', 'skills', 'somnus-metadata'));
    assert.ok(!exists('.codex', 'skills', 'somnus-metadata'));
    assert.ok(!exists(plugin));
  });

  it('is idempotent and backs up only configs it changes', async () => {
    await run('install', '--somnus', somnus);
    const backups = () => fs.readdirSync(path.join(home, '.codex')).filter((n) => n.includes('.bak-somnus-plugin-'));
    assert.equal(backups().length, 1);
    assert.equal(await run('install', '--somnus', somnus), 0);
    assert.ok(lines.some((l) => l.endsWith('config.toml already current')), lines.join('\n'));
    assert.equal(backups().length, 1);
    assert.equal(read('.codex', 'config.toml').split('# >>> somnus-metadata-plugin').length, 2);
  });

  it('dry run changes nothing', async () => {
    assert.equal(await run('install', '--somnus', somnus, '--dry-run'), 0, lines.join('\n'));
    assert.equal(read('.codex', 'config.toml'), ORIGINAL_TOML);
    assert.ok(!exists('.factory', 'skills', 'somnus-metadata'));
    assert.ok(lines.includes('dry run: nothing changed'));
  });

  it('limits work to --host', async () => {
    assert.equal(await run('install', '--somnus', somnus, '--host', 'codex'), 0);
    assert.ok(exists('.codex', 'skills', 'somnus-metadata'));
    assert.ok(!exists('.factory', 'skills', 'somnus-metadata'));
  });

  it('refuses a directory it did not create unless --force', async () => {
    fs.mkdirSync(path.join(home, '.factory', 'skills', 'somnus-metadata'), { recursive: true });
    assert.equal(await run('install', '--somnus', somnus, '--host', 'droid'), 1);
    assert.ok(lines.some((l) => l.includes('was not installed by somnus-metadata-plugin')));
    assert.equal(await run('install', '--somnus', somnus, '--host', 'droid', '--force'), 0);
    assert.equal(await run('uninstall', '--host', 'droid', '--dry-run'), 0);
  });

  it('refuses an old backend and reports a missing one', async () => {
    lines = [];
    const code = await main(['install', '--somnus', somnus, '--home', home], {
      out: (m) => lines.push(m), err: (m) => lines.push(m), env: { PATH: process.env.PATH, FAKE_SOMNUS_VERSION: '2.0.0' },
    });
    assert.equal(code, 1);
    assert.ok(lines.some((l) => l.includes('somnus 2.0.0 is older than 2.1.0')));
    lines = [];
    const missing = await main(['install', '--home', home], {
      out: (m) => lines.push(m), err: (m) => lines.push(m), env: { PATH: '' },
    });
    assert.equal(missing, 1);
    assert.ok(lines.some((l) => l.includes("uv tool install somnus-metadata")));
  });

  it('doctor fails when nothing is installed', async () => {
    assert.equal(await run('doctor', '--somnus', somnus, '--host', 'droid'), 1);
    assert.ok(lines.some((l) => l.startsWith('FAIL droid: skill missing')));
  });
});

describe('codex block', () => {
  it('replaces its own block and refuses a foreign table', () => {
    const once = withCodexBlock(ORIGINAL_TOML, codexBlock('/a/somnus'));
    const twice = withCodexBlock(once, codexBlock('/b/somnus'));
    assert.ok(twice.includes('"/b/somnus"') && !twice.includes('"/a/somnus"'));
    assert.equal(withoutCodexBlock(twice), ORIGINAL_TOML);
    assert.equal(withoutCodexBlock(withCodexBlock(null, codexBlock('/a'))), '');
    assert.throws(() => withCodexBlock('[mcp_servers.somnus-metadata]\ncommand = "x"\n', codexBlock('/a')),
      /outside the managed block/);
    assert.throws(() => withCodexBlock('[mcp_servers."somnus-metadata".env]\nA = "1"\n', codexBlock('/a')),
      /outside the managed block/);
  });
});

describe('argument parsing', () => {
  it('accepts --flag=value and rejects unknown hosts and flags', () => {
    assert.deepEqual(parse(['install', '--host=droid,codex']).hosts, ['droid', 'codex']);
    assert.throws(() => parse(['install', '--host', 'vim']), /unknown host/);
    assert.throws(() => parse(['install', '--nope']), /unknown argument/);
    assert.throws(() => parse(['install', '--somnus']), /needs a value/);
  });

  it('prints usage without a command', async () => {
    assert.equal(await run(), 2);
    assert.ok(lines[0].includes('usage: somnus-plugin'));
  });
});
