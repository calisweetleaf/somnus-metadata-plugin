// somnus:metadata:v2
// somnus:
//   schema: "somnus://metadata/core/2.0.0"
//   id: "urn:somnus:artifact:01a19a69-87dd-718d-998f-06f9d6eed395"
//   revision: 2
//   title: "Cli"
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
//       - target_ref: "urn:somnus:artifact:01a19a69-87dd-718d-998f-06f9d6eed395"
//         aspects: ["content"]
//   time:
//     updated_at: "2026-11-02T06:19:35+00:00"
//   names:
//     slug: "cli"
//   knowledge:
//     coverage: "artifact"
//     subjects: ["urn:somnus:artifact:01a19a69-87dd-718d-998f-06f9d6eed395"]
//   access:
//     visibility: "internal"
//     allowed_uses: ["archive", "search", "reason"]
//   ingestion:
//     disposition: "candidate"
//     body_role: "source"
// somnus:end
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MIN_BACKEND, atLeast, backendVersion, installBackend, mcpHandshake, resolveSomnus } from './backend.mjs';
import { HOSTS, hostFor } from './hosts.mjs';
import { PLUGIN_NAME, PLUGIN_VERSION, PluginError, UsageError, ownedBy } from './util.mjs';

const USAGE = `usage: somnus-plugin <command> [options]

commands:
  install     install direct skill/MCP adapters (not native plugin registration)
  uninstall   remove what install added (config backups are kept)
  doctor      check direct adapters: backend, registry, skill fidelity and MCP handshake
  hosts       list supported hosts and direct-adapter readiness

options:
  --host LIST            comma-separated subset of: ${Object.keys(HOSTS).join(', ')} (default: every host present)
  --somnus PATH          somnus executable to register (default: found on PATH or ~/.local/bin)
  --install-backend SRC  first install or upgrade SRC with 'pip install --upgrade' (then uv tool,
                         then pipx, if pip is missing or refused); SRC is a PyPI name such as
                         somnus-metadata or a source checkout path
  --force                replace a skill or plugin directory this tool did not create
  --dry-run              print the actions without changing anything
  --home DIR             use DIR as the home directory
`;

const FLAGS = { '--host': 'hosts', '--somnus': 'somnus', '--install-backend': 'installBackend', '--home': 'home' };
const SWITCHES = { '--force': 'force', '--dry-run': 'dryRun' };

export function parse(argv) {
  const opts = { command: null, hosts: null, somnus: null, installBackend: null, home: null, force: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].startsWith('--') ? argv[i].split(/=(.*)/s) : [argv[i]];
    if (flag in SWITCHES) {
      opts[SWITCHES[flag]] = true;
    } else if (flag in FLAGS) {
      const value = inline ?? argv[(i += 1)];
      if (value === undefined || value === '') throw new UsageError(`${flag} needs a value`);
      opts[FLAGS[flag]] = value;
    } else if (flag === '-h' || flag === '--help' || flag === 'help') {
      opts.command = 'help';
    } else if (!flag.startsWith('-') && opts.command === null) {
      opts.command = flag;
    } else {
      throw new UsageError(`unknown argument: ${argv[i]}`);
    }
  }
  if (opts.hosts !== null) {
    opts.hosts = opts.hosts.split(',').map((h) => h.trim()).filter(Boolean);
    const unknown = opts.hosts.filter((h) => !(h in HOSTS));
    if (unknown.length) throw new UsageError(`unknown host(s): ${unknown.join(', ')}; choose from ${Object.keys(HOSTS).join(', ')}`);
  }
  return opts;
}

function selectHosts(opts, ctx) {
  if (opts.hosts) return opts.hosts;
  const present = Object.keys(HOSTS).filter((name) => fs.existsSync(hostFor(name, ctx).root));
  if (!present.length) throw new PluginError(`no supported agent host found under ${ctx.home}; name one with --host`);
  return present;
}

function requireBackend(opts, ctx, out) {
  if (opts.installBackend) {
    out(`backend: installing from ${opts.installBackend}`);
    if (!opts.dryRun) installBackend(opts.installBackend, ctx.env.PATH);
  }
  const somnus = resolveSomnus(opts.somnus, ctx.home, ctx.env.PATH);
  if (!somnus) {
    throw new PluginError("somnus is not installed. Install it with 'pip install somnus-metadata' in a"
      + " virtual environment on PATH, or 'uv tool install somnus-metadata'"
      + ' (or rerun with --install-backend somnus-metadata), then retry.');
  }
  const version = backendVersion(somnus, ctx.env);
  if (!version) throw new PluginError(`'${somnus} --version' failed; reinstall somnus-metadata`);
  if (!atLeast(version, MIN_BACKEND)) {
    throw new PluginError(`somnus ${version.join('.')} is older than ${MIN_BACKEND.join('.')};`
      + " upgrade with 'uv tool install --force somnus-metadata' or --install-backend");
  }
  out(`backend: ${somnus} (somnus ${version.join('.')})`);
  return somnus;
}

function install(opts, ctx, out) {
  const somnus = requireBackend(opts, ctx, out);
  for (const name of selectHosts(opts, ctx)) {
    out(`[${name}]`);
    hostFor(name, ctx).install(somnus, { force: opts.force, dryRun: opts.dryRun, log: (m) => out(`  ${m}`) });
  }
  out(opts.dryRun ? 'dry run: nothing changed' : "done; run 'somnus-plugin doctor', then restart each agent host");
  return 0;
}

function uninstall(opts, ctx, out) {
  for (const name of selectHosts(opts, ctx)) {
    out(`[${name}]`);
    hostFor(name, ctx).uninstall({ dryRun: opts.dryRun, log: (m) => out(`  ${m}`) });
  }
  out(opts.dryRun ? 'dry run: nothing changed' : 'done; the somnus backend and registry were left in place');
  return 0;
}

function registryLine(somnus, env) {
  const run = spawnSync(somnus, ['ls', '--tsv'], { encoding: 'utf8', timeout: 30_000, env });
  if (run.status === 0) {
    const count = Math.max(0, run.stdout.trim().split('\n').length - 1);
    return ['ok  ', `registry: ${count} managed artifact(s) present`];
  }
  const reason = `${run.stdout}${run.stderr}`.trim().split('\n')[0] || `exit ${run.status}`;
  return ['warn', `registry: ${reason}`];
}

async function doctor(opts, ctx, out) {
  let problems = 0;
  const report = (status, text) => {
    if (status === 'FAIL') problems += 1;
    out(`${status} ${text}`);
  };
  const somnus = resolveSomnus(opts.somnus, ctx.home, ctx.env.PATH);
  const version = somnus ? backendVersion(somnus, ctx.env) : null;
  if (!version) {
    report('FAIL', "backend: somnus not found or not runnable; install with 'pip install somnus-metadata'"
      + " (in a virtual environment on PATH) or 'uv tool install somnus-metadata'");
  } else {
    const current = atLeast(version, MIN_BACKEND);
    report(current ? 'ok  ' : 'FAIL', `backend: ${somnus} (somnus ${version.join('.')})`
      + (current ? '' : `; needs ${MIN_BACKEND.join('.')} or newer`));
    report(...registryLine(somnus, ctx.env));
  }
  for (const name of selectHosts(opts, ctx)) {
    const host = hostFor(name, ctx);
    const marker = ownedBy(host.skill);
    if (!marker) {
      report('FAIL', `${name}: skill missing at ${host.skill}`);
    } else {
      const stale = host.drift ? host.drift() : null;
      report(stale ? 'FAIL' : 'ok  ', `${name}: skill ${marker.version ?? '?'} at ${host.skill}`
        + (stale ? `: ${stale}` : ' matches the packaged skill'));
    }
    const entry = host.entry();
    if (!entry) {
      report('FAIL', `${name}: no ${PLUGIN_NAME} MCP entry in ${host.config}`);
      continue;
    }
    const shake = await mcpHandshake(entry.command, entry.args, { env: ctx.env });
    const commandLine = [entry.command, ...entry.args].join(' ');
    report(shake.ok ? 'ok  ' : 'FAIL', shake.ok
      ? `${name}: MCP '${commandLine}' serves ${shake.tools.length} tools (${shake.serverInfo?.name ?? '?'} ${shake.serverInfo?.version ?? '?'})`
      : `${name}: MCP '${commandLine}' failed: ${shake.error}`);
  }
  out(problems ? `${problems} problem(s); 'somnus-plugin install' repairs host entries` : 'all checks passed');
  return problems ? 1 : 0;
}

function listHosts(opts, ctx, out) {
  for (const name of Object.keys(HOSTS)) {
    const host = hostFor(name, ctx);
    const present = fs.existsSync(host.root);
    const installed = Boolean(ownedBy(host.skill) && host.entry());
    out(`${name.padEnd(12)} ${host.label.padEnd(20)} ${present ? 'present' : 'absent '}  ${installed ? 'adapter-ready' : '-'}  ${host.root}`);
  }
  return 0;
}

const COMMANDS = { install, uninstall, doctor, hosts: listHosts };

export async function main(argv, { out = console.log, err = console.error, env = process.env } = {}) {
  try {
    const opts = parse(argv);
    if (opts.command === null || opts.command === 'help') {
      out(`${PLUGIN_NAME} ${PLUGIN_VERSION}\n${USAGE}`);
      return opts.command === 'help' ? 0 : 2;
    }
    const command = COMMANDS[opts.command];
    if (!command) throw new UsageError(`unknown command: ${opts.command}`);
    const ctx = { home: path.resolve(opts.home ?? os.homedir()), env };
    return await command(opts, ctx, out);
  } catch (error) {
    if (!(error instanceof PluginError)) throw error;
    err(`somnus-plugin: ${error.message}`);
    if (error instanceof UsageError) err("run 'somnus-plugin help' for usage");
    return error instanceof UsageError ? 2 : 1;
  }
}
