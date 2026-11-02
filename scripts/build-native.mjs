import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!/^[a-z0-9-]+$/.test(pkg.name)) throw new Error('Unsafe package name');
const dest = path.join(root, 'native', pkg.name);
const check = process.argv.slice(2).includes('--check');
const files = ['plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.factory-plugin/plugin.json'];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === '.surgeon' || entry.name === '.somnus-plugin.json' || entry.name.endsWith('.somnus.yaml')) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Runtime export rejects symlinks: ' + rel);
    if (entry.isDirectory()) walk(rel);
    else if (entry.isFile()) files.push(rel);
  }
}
walk('skills');
for (const rel of files) {
  const content = fs.readFileSync(path.join(root, rel));
  const target = path.join(dest, rel);
  if (check) {
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(content)) throw new Error('Stale native export: ' + rel);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
function verify(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(dest, abs);
    if (entry.isDirectory()) verify(abs);
    else if (!entry.isFile() || !files.includes(rel)) throw new Error('Unexpected production file: ' + rel);
  }
}
verify(dest);
console.log((check ? 'Verified' : 'Built') + ' clean native runtime: ' + files.length + ' files at ' + dest);
