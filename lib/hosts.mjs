// somnus:metadata:v2
// somnus:
//   schema: "somnus://metadata/core/2.0.0"
//   id: "urn:somnus:artifact:01a19a69-87ef-727b-b3af-c4114078bbd4"
//   revision: 1
//   title: "Hosts"
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
//       - target_ref: "urn:somnus:artifact:01a19a69-87ef-727b-b3af-c4114078bbd4"
//         aspects: ["content"]
//   time: {}
//   names:
//     slug: "hosts"
//   knowledge:
//     coverage: "artifact"
//     subjects: ["urn:somnus:artifact:01a19a69-87ef-727b-b3af-c4114078bbd4"]
//   access:
//     visibility: "internal"
//     allowed_uses: ["archive", "search", "reason"]
//   ingestion:
//     disposition: "candidate"
//     body_role: "source"
// somnus:end
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKER, PLUGIN_NAME, PLUGIN_VERSION, PluginError, SERVER_NAME, SKILL_NAME, backup, hashTree, ownedBy, readText,
  writeAtomic,
} from './util.mjs';

const SKILL_SOURCE = fileURLToPath(new URL('../skills/somnus-metadata/', import.meta.url));
const REPOSITORY = 'https://github.com/calisweetleaf/somnus-metadata-plugin';

/** Arguments for `somnus` so each host's edits are attributed to it in the registry event ledger. */
export function serverArgs(actor) {
  return ['--actor', actor, 'mcp'];
}

function markerText(skillHash) {
  return `${JSON.stringify({
    plugin: PLUGIN_NAME, version: PLUGIN_VERSION, skillHash, installedAt: new Date().toISOString(),
  }, null, 2)}\n`;
}

function copySkill(dest) {
  fs.cpSync(SKILL_SOURCE, dest, { recursive: true });
}

/** Build a directory in a staging sibling, then swap it in; refuses directories this tool did not create. */
function placeDir(dest, fill, { force, dryRun, log }) {
  if (fs.existsSync(dest) && !ownedBy(dest) && !force) {
    throw new PluginError(`${dest} exists and was not installed by ${PLUGIN_NAME}; move it aside or rerun with --force`);
  }
  log(`write ${dest}`);
  if (dryRun) return;
  const parent = path.dirname(dest);
  const staging = path.join(parent, `.${path.basename(dest)}.${process.pid}.staging`);
  fs.mkdirSync(parent, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    fill(staging);
    fs.writeFileSync(path.join(staging, MARKER), markerText(hashTree(SKILL_SOURCE)));
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(staging, dest);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function removeDir(dest, { dryRun, log }) {
  if (!fs.existsSync(dest)) return;
  if (!ownedBy(dest)) {
    log(`leave ${dest} (not installed by ${PLUGIN_NAME})`);
    return;
  }
  log(`remove ${dest}`);
  if (!dryRun) fs.rmSync(dest, { recursive: true, force: true });
}

/** Remove copies this tool installed at locations earlier versions used; foreign directories stay. */
function removeLegacy(dirs, opts) {
  for (const dir of dirs) {
    if (fs.existsSync(dir) && ownedBy(dir)) removeDir(dir, opts);
  }
}

/** Null when an installed skill tree matches the packaged one, else a stale report for doctor. */
function driftReport(installedTree) {
  const installed = hashTree(installedTree);
  const packaged = hashTree(SKILL_SOURCE);
  if (installed === null || packaged === null) return null;
  if (installed === packaged) return null;
  return `skill content differs from the packaged skill`
    + ` (${installed.slice(0, 12)} installed vs ${packaged.slice(0, 12)} packaged);`
    + " rerun 'somnus-plugin install' to refresh it";
}

function parseJsonObject(file, text) {
  if (text === null || !text.trim()) return {};
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new PluginError(`${file} is not valid JSON (${err.message}); fix it or move it aside first`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new PluginError(`${file} must hold a JSON object`);
  }
  return data;
}

/** Apply `mutate` to a JSON config, backing it up first; unchanged files are not rewritten. */
function editJson(file, mutate, { dryRun, log }) {
  const data = parseJsonObject(file, readText(file));
  const before = JSON.stringify(data);
  mutate(data);
  if (JSON.stringify(data) === before) {
    log(`${file} already current`);
    return;
  }
  log(`update ${file}`);
  if (dryRun) return;
  const saved = backup(file);
  if (saved) log(`backup ${saved}`);
  writeAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
}

function jsonEntry(file) {
  try {
    const entry = parseJsonObject(file, readText(file)).mcpServers?.[SERVER_NAME];
    return entry ? { command: entry.command, args: entry.args ?? [] } : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------- OpenCode JSONC

/** JSONC text without comments and trailing commas; strings are left untouched. */
export function stripJsonc(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (ch === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) {
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** The OpenCode config file to use: an existing opencode.jsonc, else opencode.json. */
function opencodeConfig(root) {
  const jsonc = path.join(root, 'opencode.jsonc');
  return fs.existsSync(jsonc) ? jsonc : path.join(root, 'opencode.json');
}

function opencodeEntry(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    const entry = parseJsonObject(file, stripJsonc(text)).mcp?.[SERVER_NAME];
    const command = Array.isArray(entry?.command) ? entry.command : null;
    return command && command.length ? { command: command[0], args: command.slice(1) } : null;
  } catch {
    return null;
  }
}

/**
 * Edit an OpenCode config. Rewriting JSONC would drop its comments, so a file that has any is
 * refused with the exact snippet to add by hand.
 */
function editOpencode(file, mutate, { dryRun, log }) {
  const text = readText(file);
  if (text !== null && stripJsonc(text) !== text) {
    const probe = {};
    mutate(probe);
    throw new PluginError(`${file} has comments or trailing commas, which a rewrite would lose; add this under "mcp" by hand:\n`
      + `${JSON.stringify(probe.mcp ?? {}, null, 2)}`);
  }
  editJson(file, mutate, { dryRun, log });
}

// ----------------------------------------------------------------------------- Codex TOML block

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BEGIN = `# >>> ${PLUGIN_NAME} (managed block; reinstall or uninstall with somnus-plugin)`;
const END = `# <<< ${PLUGIN_NAME}`;
const BLOCK = new RegExp(`\\r?\\n?^# >>> ${escapeRe(PLUGIN_NAME)} .*$[\\s\\S]*?^${escapeRe(END)}\\r?$\\r?\\n?`, 'm');
const FOREIGN = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(?:"${escapeRe(SERVER_NAME)}"|${escapeRe(SERVER_NAME)})\\s*[\\].]`, 'm');
// JSON string escapes are a subset of TOML basic-string escapes.
const tomlString = (s) => JSON.stringify(s);

export function codexBlock(command) {
  return [
    BEGIN,
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(command)}`,
    `args = [${serverArgs('codex').map(tomlString).join(', ')}]`,
    'startup_timeout_sec = 30.0',
    'tool_timeout_sec = 600.0',
    END,
  ].join('\n');
}

export function withCodexBlock(text, block) {
  const current = text ?? '';
  // Keep the file's own line endings; a CRLF config stays CRLF inside and outside the block.
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const blockEol = block.split('\n').join(eol);
  if (FOREIGN.test(current.replace(BLOCK, '\n'))) {
    throw new PluginError(`config.toml already defines [mcp_servers.${SERVER_NAME}] outside the managed block; remove it first`);
  }
  if (BLOCK.test(current)) return current.replace(BLOCK, `${eol}${blockEol}${eol}`);
  if (!current) return `${block}\n`;
  // A terminated file gets a blank separator line; a bare file gets just the newline the
  // block needs — either way uninstall (which strips that separator) restores the exact bytes.
  const terminated = /(\r\n|\n|\r)$/.test(current);
  const tail = terminated ? current : `${current}${eol}`;
  return `${tail}${terminated ? eol : ''}${blockEol}${eol}`;
}

export function withoutCodexBlock(text) {
  return (text ?? '').replace(BLOCK, '');
}

function codexEntry(file) {
  const match = BLOCK.exec(readText(file) ?? '');
  if (!match) return null;
  const value = (key) => {
    const line = new RegExp(`^${key} = (.*)$`, 'm').exec(match[0]);
    try {
      return line ? JSON.parse(line[1]) : null;
    } catch {
      return null;
    }
  };
  const command = value('command');
  return command ? { command, args: value('args') ?? [] } : null;
}

function editCodex(file, transform, { dryRun, log }) {
  const text = readText(file);
  const next = transform(text);
  if (next === (text ?? '')) {
    log(`${file} already current`);
    return;
  }
  log(`update ${file}`);
  if (dryRun) return;
  const saved = backup(file);
  if (saved) log(`backup ${saved}`);
  writeAtomic(file, next);
}

// ----------------------------------------------------------------------------- hosts

function droid(ctx) {
  const root = path.join(ctx.home, '.factory');
  const skill = path.join(root, 'skills', SKILL_NAME);
  const config = path.join(root, 'mcp.json');
  return {
    label: 'Factory Droid',
    root,
    skill,
    config,
    install(somnus, opts) {
      placeDir(skill, copySkill, opts);
      editJson(config, (data) => {
        data.mcpServers ??= {};
        data.mcpServers[SERVER_NAME] = { type: 'stdio', command: somnus, args: serverArgs('droid'), disabled: false };
      }, opts);
    },
    uninstall(opts) {
      removeDir(skill, opts);
      if (jsonEntry(config)) editJson(config, (data) => { delete data.mcpServers[SERVER_NAME]; }, opts);
    },
    entry: () => jsonEntry(config),
    drift: () => driftReport(skill),
  };
}

function codex(ctx) {
  const root = ctx.env.CODEX_HOME || path.join(ctx.home, '.codex');
  const skill = path.join(root, 'skills', 'custom', SKILL_NAME);
  const legacy = [path.join(root, 'skills', SKILL_NAME)];
  const config = path.join(root, 'config.toml');
  return {
    label: 'Codex',
    root,
    skill,
    config,
    install(somnus, opts) {
      removeLegacy(legacy, opts);
      placeDir(skill, copySkill, opts);
      editCodex(config, (text) => withCodexBlock(text, codexBlock(somnus)), opts);
    },
    uninstall(opts) {
      removeLegacy(legacy, opts);
      removeDir(skill, opts);
      if (codexEntry(config)) editCodex(config, withoutCodexBlock, opts);
    },
    entry: () => codexEntry(config),
    drift: () => driftReport(skill),
  };
}

function antigravity(ctx) {
  const gemini = path.join(ctx.home, '.gemini');
  const root = path.join(gemini, 'config');
  // Antigravity loads skills from ~/.gemini/skills; the plugin directory carries only the MCP server.
  const skill = path.join(gemini, 'skills', SKILL_NAME);
  const plugin = path.join(root, 'plugins', SERVER_NAME);
  const config = path.join(plugin, 'mcp_config.json');
  return {
    label: 'Google Antigravity',
    root,
    skill,
    config,
    install(somnus, opts) {
      placeDir(skill, copySkill, opts);
      placeDir(plugin, (dir) => {
        fs.mkdirSync(dir, { recursive: true });
        const manifest = { name: SERVER_NAME, author: 'calisweetleaf', repository: REPOSITORY };
        fs.writeFileSync(path.join(dir, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        const servers = { mcpServers: { [SERVER_NAME]: { command: somnus, args: serverArgs('antigravity') } } };
        fs.writeFileSync(path.join(dir, 'mcp_config.json'), `${JSON.stringify(servers, null, 2)}\n`);
      }, opts);
    },
    uninstall(opts) {
      removeDir(skill, opts);
      removeDir(plugin, opts);
    },
    entry: () => jsonEntry(config),
    drift: () => driftReport(skill),
  };
}

function opencode(ctx) {
  const root = path.join(ctx.env.XDG_CONFIG_HOME || path.join(ctx.home, '.config'), 'opencode');
  const skill = path.join(root, 'skills', SKILL_NAME);
  const config = opencodeConfig(root);
  return {
    label: 'OpenCode',
    root,
    skill,
    config,
    install(somnus, opts) {
      placeDir(skill, copySkill, opts);
      editOpencode(config, (data) => {
        data.mcp ??= {};
        data.mcp[SERVER_NAME] = { type: 'local', command: [somnus, ...serverArgs('opencode')], enabled: true };
      }, opts);
    },
    uninstall(opts) {
      removeDir(skill, opts);
      if (opencodeEntry(config)) editOpencode(config, (data) => { delete data.mcp[SERVER_NAME]; }, opts);
    },
    entry: () => opencodeEntry(config),
    drift: () => driftReport(skill),
  };
}

export const HOSTS = { droid, codex, antigravity, opencode };

export function hostFor(name, ctx) {
  return HOSTS[name](ctx);
}
