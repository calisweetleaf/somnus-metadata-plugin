import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** A refusal the operator can act on; reported without a stack trace. */
export class PluginError extends Error {}

/** A malformed command line. */
export class UsageError extends PluginError {}

export const SERVER_NAME = 'somnus-metadata';
export const SKILL_NAME = 'somnus-metadata';
export const MARKER = '.somnus-plugin.json';

const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const PLUGIN_NAME = PKG.name;
export const PLUGIN_VERSION = PKG.version;

export function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Replace a file via a same-directory temp file, keeping its permission bits. */
export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let mode = 0o644;
  try {
    mode = fs.statSync(file).mode & 0o777;
  } catch {
    // new file
  }
  const tmp = `${file}.${process.pid}.somnus-plugin.tmp`;
  fs.writeFileSync(tmp, text, { mode });
  fs.renameSync(tmp, file);
}

/** Copy an existing file to `<file>.bak-somnus-plugin-<UTC stamp>`; return the copy's path. */
export function backup(file) {
  if (!fs.existsSync(file)) return null;
  const dest = `${file}.bak-somnus-plugin-${timestamp()}`;
  fs.copyFileSync(file, dest);
  return dest;
}

export function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function findOnPath(name, envPath = process.env.PATH ?? '') {
  const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, name] : [name];
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const candidate of names.map((n) => path.join(dir, n))) {
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

/** The install marker inside a directory this tool created, or null. */
export function ownedBy(dir) {
  const text = readText(path.join(dir, MARKER));
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Stable digest of every file under `dir` (marker files excluded, nested paths
 * slash-normalized so a tree hashes the same on Windows and POSIX), or null if
 * the directory is absent.
 */
export function hashTree(dir) {
  if (!fs.existsSync(dir)) return null;
  const hash = crypto.createHash('sha256');
  const walk = (base) => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(base, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name !== MARKER) {
        hash.update(`${path.relative(dir, full).split(path.sep).join('/')}\0`);
        hash.update(fs.readFileSync(full)).update('\0');
      }
    }
  };
  walk(dir);
  return hash.digest('hex');
}
