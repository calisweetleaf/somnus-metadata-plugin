import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKER, PLUGIN_NAME, PLUGIN_VERSION, PluginError, SERVER_NAME, SKILL_NAME, backup, ownedBy, readText, writeAtomic,
} from './util.mjs';

const SKILL_SOURCE = fileURLToPath(new URL('../skills/somnus-metadata/', import.meta.url));
const REPOSITORY = 'https://github.com/calisweetleaf/somnus-metadata-plugin';

/** Arguments for `somnus` so each host's edits are attributed to it in the registry event ledger. */
export function serverArgs(actor) {
  return ['--actor', actor, 'mcp'];
}

function markerText() {
  return `${JSON.stringify({ plugin: PLUGIN_NAME, version: PLUGIN_VERSION, installedAt: new Date().toISOString() }, null, 2)}\n`;
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
    fs.writeFileSync(path.join(staging, MARKER), markerText());
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

// ----------------------------------------------------------------------------- Codex TOML block

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BEGIN = `# >>> ${PLUGIN_NAME} (managed block; reinstall or uninstall with somnus-plugin)`;
const END = `# <<< ${PLUGIN_NAME}`;
const BLOCK = new RegExp(`\\n?^# >>> ${escapeRe(PLUGIN_NAME)} .*$[\\s\\S]*?^${escapeRe(END)}$\\n?`, 'm');
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
  if (FOREIGN.test(current.replace(BLOCK, '\n'))) {
    throw new PluginError(`config.toml already defines [mcp_servers.${SERVER_NAME}] outside the managed block; remove it first`);
  }
  if (BLOCK.test(current)) return current.replace(BLOCK, `\n${block}\n`);
  if (!current) return `${block}\n`;
  return `${current.endsWith('\n') ? current : `${current}\n`}\n${block}\n`;
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
  };
}

function codex(ctx) {
  const root = ctx.env.CODEX_HOME || path.join(ctx.home, '.codex');
  const skill = path.join(root, 'skills', SKILL_NAME);
  const config = path.join(root, 'config.toml');
  return {
    label: 'Codex',
    root,
    skill,
    config,
    install(somnus, opts) {
      placeDir(skill, copySkill, opts);
      editCodex(config, (text) => withCodexBlock(text, codexBlock(somnus)), opts);
    },
    uninstall(opts) {
      removeDir(skill, opts);
      if (codexEntry(config)) editCodex(config, withoutCodexBlock, opts);
    },
    entry: () => codexEntry(config),
  };
}

function antigravity(ctx) {
  const root = path.join(ctx.home, '.gemini', 'config');
  const plugin = path.join(root, 'plugins', SERVER_NAME);
  const config = path.join(plugin, 'mcp_config.json');
  return {
    label: 'Google Antigravity',
    root,
    skill: plugin,
    config,
    install(somnus, opts) {
      placeDir(plugin, (dir) => {
        fs.mkdirSync(dir, { recursive: true });
        const manifest = { name: SERVER_NAME, author: 'calisweetleaf', repository: REPOSITORY };
        fs.writeFileSync(path.join(dir, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        const servers = { mcpServers: { [SERVER_NAME]: { command: somnus, args: serverArgs('antigravity') } } };
        fs.writeFileSync(path.join(dir, 'mcp_config.json'), `${JSON.stringify(servers, null, 2)}\n`);
        copySkill(path.join(dir, 'skills', SKILL_NAME));
      }, opts);
    },
    uninstall(opts) {
      removeDir(plugin, opts);
    },
    entry: () => jsonEntry(config),
  };
}

export const HOSTS = { droid, codex, antigravity };

export function hostFor(name, ctx) {
  return HOSTS[name](ctx);
}
