// somnus:metadata:v2
// somnus:
//   schema: "somnus://metadata/core/2.0.0"
//   id: "urn:somnus:artifact:01a19a69-87cf-7035-95fe-c30071fd0266"
//   revision: 1
//   title: "Backend"
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
//       - target_ref: "urn:somnus:artifact:01a19a69-87cf-7035-95fe-c30071fd0266"
//         aspects: ["content"]
//   time: {}
//   names:
//     slug: "backend"
//   knowledge:
//     coverage: "artifact"
//     subjects: ["urn:somnus:artifact:01a19a69-87cf-7035-95fe-c30071fd0266"]
//   access:
//     visibility: "internal"
//     allowed_uses: ["archive", "search", "reason"]
//   ingestion:
//     disposition: "candidate"
//     body_role: "source"
// somnus:end
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { PLUGIN_VERSION, PluginError, findOnPath, isExecutable } from './util.mjs';

/** Oldest backend with `q --text` and the agent hints the skill relies on. */
export const MIN_BACKEND = [2, 1, 0];

export function resolveSomnus(explicit, home, envPath) {
  if (explicit) {
    const full = path.resolve(explicit);
    if (!isExecutable(full)) throw new PluginError(`--somnus ${full} is not an executable file`);
    return full;
  }
  return findOnPath('somnus', envPath) ?? [path.join(home, '.local', 'bin', 'somnus')].find(isExecutable) ?? null;
}

export function backendVersion(command, env) {
  const [exe, argv, extra] = spawnForm(command, ['--version']);
  const run = spawnSync(exe, argv, { encoding: 'utf8', timeout: 30_000, env, ...extra });
  if (run.error || run.status !== 0) return null;
  const match = /somnus (\d+)\.(\d+)\.(\d+)/.exec(run.stdout);
  return match ? match.slice(1, 4).map(Number) : null;
}

export function atLeast(version, minimum) {
  for (let i = 0; i < minimum.length; i += 1) {
    if (version[i] !== minimum[i]) return version[i] > minimum[i];
  }
  return true;
}

/**
 * Install or upgrade the Python backend: plain `pip` first (the global environment on PATH),
 * then `uv tool`, then `pipx`. A pip refused by PEP 668 (a system Python) falls through.
 */
export function installBackend(source, envPath) {
  const candidates = [
    ['pip', ['install', '--upgrade', source]],
    ['uv', ['tool', 'install', '--force', source]],
    ['pipx', ['install', '--force', source]],
  ].map(([name, args]) => [findOnPath(name, envPath), args]).filter(([cmd]) => cmd);
  if (!candidates.length) {
    throw new PluginError('none of pip, uv, or pipx is on PATH; install somnus-metadata yourself');
  }
  const failures = [];
  for (const [cmd, args] of candidates) {
    const [exe, quoted, extra] = spawnForm(cmd, args);
    const run = spawnSync(exe, quoted, { encoding: 'utf8', ...extra });
    process.stdout.write(run.stdout ?? '');
    process.stderr.write(run.stderr ?? '');
    if (run.status === 0) return;
    const reason = /externally-managed-environment/.test(`${run.stdout}${run.stderr}`)
      ? 'refused by PEP 668 (system Python)' : `exit ${run.status ?? run.error?.message}`;
    failures.push(`${path.basename(cmd)} ${args.join(' ')}: ${reason}`);
  }
  throw new PluginError(`could not install ${source}: ${failures.join('; ')}`);
}

/**
 * Node >= 18.20 refuses to spawn `.cmd`/`.bat` without a shell (EINVAL), and on Windows the
 * backend tools resolve to exactly such wrappers. Route those spawns through the shell and
 * quote any argument that contains whitespace; every other platform spawns directly.
 */
export function spawnForm(command, args) {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(command)) return [command, args, {}];
  return [command, args.map((a) => (/\s/.test(a) ? `"${a}"` : a)), { shell: true }];
}

/** Start an MCP stdio command exactly as a host would, run initialize + tools/list, then stop it. */
export function mcpHandshake(command, args, { timeoutMs = 30_000, env } = {}) {
  return new Promise((resolve) => {
    let child;
    const [exe, argv, extra] = spawnForm(command, args);
    try {
      child = spawn(exe, argv, { stdio: ['pipe', 'pipe', 'pipe'], env, ...extra });
    } catch (err) {
      resolve({ ok: false, error: err.message });
      return;
    }
    let done = false;
    let buffer = '';
    let stderr = '';
    let serverInfo = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: `no tools/list reply within ${timeoutMs} ms` }), timeoutMs);
    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('exit', (code) => finish({ ok: false, error: `server exited with ${code}: ${stderr.trim().slice(0, 300)}` }));
    child.stdin.on('error', () => {});
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 1) serverInfo = message.result?.serverInfo ?? null;
        if (message.id === 2) {
          const tools = message.result?.tools;
          finish(Array.isArray(tools)
            ? { ok: true, tools: tools.map((t) => t.name), serverInfo }
            : { ok: false, error: `tools/list failed: ${JSON.stringify(message.error ?? message.result)}` });
        }
      }
    });
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    send({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'somnus-plugin', version: PLUGIN_VERSION } },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  });
}
