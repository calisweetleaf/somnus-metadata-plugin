// somnus:metadata:v2
// somnus:
//   schema: "somnus://metadata/core/2.0.0"
//   id: "urn:somnus:artifact:01a19a69-8869-73d2-8d0c-7b37b16dd932"
//   revision: 1
//   title: "Plugin"
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
//       - target_ref: "urn:somnus:artifact:01a19a69-8869-73d2-8d0c-7b37b16dd932"
//         aspects: ["content"]
//   time: {}
//   names:
//     slug: "plugin"
//   knowledge:
//     coverage: "artifact"
//     subjects: ["urn:somnus:artifact:01a19a69-8869-73d2-8d0c-7b37b16dd932"]
//   access:
//     visibility: "internal"
//     allowed_uses: ["archive", "search", "reason"]
//   ingestion:
//     disposition: "candidate"
//     body_role: "source"
// somnus:end
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { main, parse } from '../lib/cli.mjs';
import { hostFor, codexBlock, withCodexBlock, withoutCodexBlock } from '../lib/hosts.mjs';
import { spawnForm } from '../lib/backend.mjs';

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
const ORIGINAL_OPENCODE = { $schema: 'https://opencode.ai/config.json', model: 'm', mcp: { Other: { type: 'local', command: ['other'] } } };

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
  fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'opencode', 'opencode.jsonc'), JSON.stringify(ORIGINAL_OPENCODE, null, 2));
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
    assert.ok(exists('.codex', 'skills', 'custom', 'somnus-metadata', 'SKILL.md'));
    const plugin = path.join('.gemini', 'config', 'plugins', 'somnus-metadata');
    assert.equal(JSON.parse(read(plugin, 'plugin.json')).name, 'somnus-metadata');
    assert.deepEqual(JSON.parse(read(plugin, 'mcp_config.json')).mcpServers['somnus-metadata'].args,
      ['--actor', 'antigravity', 'mcp']);
    assert.ok(exists('.gemini', 'skills', 'somnus-metadata', 'SKILL.md'));
    assert.ok(!exists(plugin, 'skills'), 'the Antigravity plugin carries only the MCP server');

    assert.equal(await run('doctor', '--somnus', somnus), 0, lines.join('\n'));
    assert.equal(lines.filter((l) => l.includes('serves 3 tools (somnus 2.1.0)')).length, 4, lines.join('\n'));
    assert.ok(lines.includes('all checks passed'));

    assert.equal(await run('uninstall'), 0, lines.join('\n'));
    assert.equal(read('.codex', 'config.toml'), ORIGINAL_TOML);
    assert.deepEqual(JSON.parse(read('.factory', 'mcp.json')), ORIGINAL_MCP);
    assert.ok(!exists('.factory', 'skills', 'somnus-metadata'));
    assert.ok(!exists('.codex', 'skills', 'custom', 'somnus-metadata'));
    assert.ok(!exists('.gemini', 'skills', 'somnus-metadata'));
    assert.ok(!exists('.config', 'opencode', 'skills', 'somnus-metadata'));
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
    assert.ok(exists('.codex', 'skills', 'custom', 'somnus-metadata'));
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
    assert.ok(lines.some((l) => l.includes("pip install somnus-metadata")));
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

describe('skill drift detection', () => {
  it('doctor flags an installed skill that drifted from the package and install repairs it', async () => {
    await run('install', '--somnus', somnus);
    const marker = JSON.parse(read('.factory', 'skills', 'somnus-metadata', '.somnus-plugin.json'));
    assert.ok(/^[0-9a-f]{64}$/.test(marker.skillHash), `marker skillHash: ${marker.skillHash}`);
    assert.equal(await run('doctor', '--somnus', somnus), 0, lines.join('\n'));

    fs.appendFileSync(path.join(home, '.factory', 'skills', 'somnus-metadata', 'SKILL.md'), '\n<!-- drift -->\n');
    assert.equal(await run('doctor', '--somnus', somnus, '--host', 'droid'), 1, lines.join('\n'));
    const drifted = lines.find((l) => l.startsWith('FAIL droid: skill'));
    assert.ok(drifted?.includes('differs from the packaged skill'), lines.join('\n'));
    assert.ok(drifted?.includes("rerun 'somnus-plugin install'"), lines.join('\n'));
    assert.equal(await run('install', '--somnus', somnus, '--host', 'droid'), 0, lines.join('\n'));
    assert.equal(await run('doctor', '--somnus', somnus, '--host', 'droid'), 0, lines.join('\n'));
  });

  it('doctor flags a drifted Antigravity skill too', async () => {
    await run('install', '--somnus', somnus);
    fs.appendFileSync(
      path.join(home, '.gemini', 'skills', 'somnus-metadata', 'SKILL.md'),
      '\n<!-- drift -->\n',
    );
    assert.equal(await run('doctor', '--somnus', somnus, '--host', 'antigravity'), 1, lines.join('\n'));
    assert.ok(lines.some((l) => l.startsWith('FAIL antigravity: skill') && l.includes('differs from the packaged skill')),
      lines.join('\n'));
  });
});

describe('OpenCode and moved skill locations', () => {
  it('writes an OpenCode local MCP entry and restores the config on uninstall', async () => {
    assert.equal(await run('install', '--somnus', somnus, '--host', 'opencode'), 0, lines.join('\n'));
    const config = JSON.parse(read('.config', 'opencode', 'opencode.jsonc'));
    assert.equal(config.model, ORIGINAL_OPENCODE.model);
    assert.deepEqual(config.mcp.Other, ORIGINAL_OPENCODE.mcp.Other);
    assert.deepEqual(config.mcp['somnus-metadata'], {
      type: 'local', command: [somnus, '--actor', 'opencode', 'mcp'], enabled: true,
    });
    assert.ok(exists('.config', 'opencode', 'skills', 'somnus-metadata', 'SKILL.md'));
    assert.equal(await run('doctor', '--somnus', somnus, '--host', 'opencode'), 0, lines.join('\n'));
    assert.equal(await run('uninstall', '--host', 'opencode'), 0, lines.join('\n'));
    assert.deepEqual(JSON.parse(read('.config', 'opencode', 'opencode.jsonc')), ORIGINAL_OPENCODE);
    assert.ok(!exists('.config', 'opencode', 'skills', 'somnus-metadata'));
  });

  it('refuses to rewrite an OpenCode config with comments and prints the snippet', async () => {
    const commented = '{\n  // my settings\n  "model": "x",\n}\n';
    fs.writeFileSync(path.join(home, '.config', 'opencode', 'opencode.jsonc'), commented);
    assert.equal(await run('install', '--somnus', somnus, '--host', 'opencode'), 1);
    assert.ok(lines.some((l) => l.includes('has comments or trailing commas') && l.includes('"somnus-metadata"')),
      lines.join('\n'));
    assert.equal(read('.config', 'opencode', 'opencode.jsonc'), commented);
  });

  it('moves a Codex skill this tool installed at the old location and leaves a foreign one', async () => {
    const old = path.join(home, '.codex', 'skills', 'somnus-metadata');
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, '.somnus-plugin.json'), '{"plugin":"somnus-metadata-plugin"}\n');
    assert.equal(await run('install', '--somnus', somnus, '--host', 'codex'), 0, lines.join('\n'));
    assert.ok(!fs.existsSync(old));
    assert.ok(exists('.codex', 'skills', 'custom', 'somnus-metadata', 'SKILL.md'));
    fs.mkdirSync(old, { recursive: true });
    assert.equal(await run('install', '--somnus', somnus, '--host', 'codex'), 0, lines.join('\n'));
    assert.ok(fs.existsSync(old), 'a directory without the marker is not ours to remove');
  });
});
describe('codex config formatting edge cases', () => {
  it('preserves CRLF line endings inside and outside the managed block', async () => {
    const crlf = ORIGINAL_TOML.replace(/\n/g, '\r\n');
    fs.writeFileSync(path.join(home, '.codex', 'config.toml'), crlf);
    assert.equal(await run('install', '--somnus', somnus, '--host', 'codex'), 0, lines.join('\n'));
    const toml = read('.codex', 'config.toml');
    assert.ok(toml.startsWith(crlf), 'original CRLF lines kept verbatim');
    assert.ok(toml.includes(`command = ${JSON.stringify(somnus)}\r\nargs = ["--actor", "codex", "mcp"]`),
      lines.join('\n'));
    assert.ok(!/[^\r]\n/.test(toml.slice(crlf.length)), 'the inserted region is CRLF throughout');
    assert.equal(await run('uninstall', '--host', 'codex'), 0, lines.join('\n'));
    assert.equal(read('.codex', 'config.toml'), crlf);
  });

  it('appends to a config with no trailing newline and restores it on uninstall', async () => {
    const bare = '[mcp_servers.other]\ncommand = "other"';
    fs.writeFileSync(path.join(home, '.codex', 'config.toml'), bare);
    assert.equal(await run('install', '--somnus', somnus, '--host', 'codex'), 0, lines.join('\n'));
    const toml = read('.codex', 'config.toml');
    assert.ok(toml.startsWith(`${bare}\n`), 'a newline is added before the block, original text intact');
    assert.ok(toml.includes(`command = ${JSON.stringify(somnus)}`));
    assert.equal(await run('uninstall', '--host', 'codex'), 0, lines.join('\n'));
    assert.equal(read('.codex', 'config.toml'), bare);
  });

  it('round-trips a Windows-style somnus path through the Codex block', () => {
    const winPath = 'C:\\Users\\da\\AppData\\Local\\somnus\\somnus.exe';
    fs.writeFileSync(path.join(home, '.codex', 'config.toml'), withCodexBlock(ORIGINAL_TOML, codexBlock(winPath)));
    const entry = hostFor('codex', { home, env: {} }).entry();
    assert.equal(entry.command, winPath);
    assert.deepEqual(entry.args, ['--actor', 'codex', 'mcp']);
  });
});

describe('error paths and spawn forms', () => {
  it('routes .cmd/.bat spawns through a shell on Windows only, quoting spaced args', () => {
    const real = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      assert.deepEqual(spawnForm('C:\\tools\\somnus.cmd', ['--actor', 'droid', 'mcp']),
        ['C:\\tools\\somnus.cmd', ['--actor', 'droid', 'mcp'], { shell: true }]);
      assert.deepEqual(spawnForm('C:\\somnus tools\\somnus.cmd', ['tool', 'install', '--force', 'C:\\my src']),
        ['C:\\somnus tools\\somnus.cmd', ['tool', 'install', '--force', '"C:\\my src"'], { shell: true }]);
      assert.deepEqual(spawnForm('C:\\tools\\somnus.exe', ['--version']), ['C:\\tools\\somnus.exe', ['--version'], {}]);
    } finally {
      Object.defineProperty(process, 'platform', { value: real });
    }
    assert.deepEqual(spawnForm('/usr/bin/somnus', ['--version']), ['/usr/bin/somnus', ['--version'], {}]);
  });

  it('refuses an invalid JSON config with a clear error instead of crashing', async () => {
    fs.writeFileSync(path.join(home, '.factory', 'mcp.json'), '{not json');
    assert.equal(await run('install', '--somnus', somnus, '--host', 'droid'), 1);
    assert.ok(lines.some((l) => l.includes('mcp.json is not valid JSON')), lines.join('\n'));
  });

  it('doctor reports a failed MCP handshake and heals a corrupted managed block', async () => {
    await run('install', '--somnus', somnus);
    const config = path.join(home, '.factory', 'mcp.json');
    const data = JSON.parse(fs.readFileSync(config, 'utf8'));
    data.mcpServers['somnus-metadata'].command = '/nonexistent/somnus-nowhere';
    fs.writeFileSync(config, JSON.stringify(data, null, 2));
    assert.equal(await run('doctor', '--somnus', somnus, '--host', 'droid'), 1, lines.join('\n'));
    assert.ok(lines.some((l) => l.startsWith('FAIL droid: MCP') && l.includes('failed')), lines.join('\n'));

    fs.writeFileSync(path.join(home, '.codex', 'config.toml'),
      `${ORIGINAL_TOML}# >>> somnus-metadata-plugin (managed block; reinstall or uninstall with somnus-plugin)\n`
      + '[mcp_servers.somnus-metadata]\ncommand = (broken\n'
      + `# <<< somnus-metadata-plugin\n`);
    assert.equal(await run('install', '--somnus', somnus, '--host', 'codex'), 0, lines.join('\n'));
    const healed = hostFor('codex', { home, env: {} }).entry();
    assert.equal(healed.command, somnus);
    assert.deepEqual(healed.args, ['--actor', 'codex', 'mcp']);
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
