import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const json = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const pkg = json('package.json');
test('portable and native manifests preserve the same identity and release', () => {
  for (const rel of ['plugin.json', '.codex-plugin/plugin.json', '.factory-plugin/plugin.json']) {
    const manifest = json(rel);
    assert.equal(manifest.name, pkg.name, rel);
    assert.equal(manifest.version, pkg.version, rel);
  }
});
test('both native catalogs resolve the actual package root', () => {
  const codex = json('.agents/plugins/marketplace.json').plugins[0];
  const droid = json('.factory-plugin/marketplace.json').plugins[0];
  assert.equal(codex.name, pkg.name);
  assert.equal(droid.name, pkg.name);
  assert.equal(path.resolve(root, codex.source.path), root);
  assert.equal(path.resolve(root, droid.source), root);
});
test('native Codex connects the existing shared skill and installed backend', () => {
  const codex = json('.codex-plugin/plugin.json');
  assert.ok(fs.existsSync(path.join(root, codex.skills, 'somnus-metadata/SKILL.md')));
  assert.deepEqual(json(codex.mcpServers), json('mcp.json'));
  const entry = json('mcp.json').mcpServers['somnus-metadata'];
  assert.equal(entry.command, 'somnus');
  assert.deepEqual(entry.args, ['--actor', pkg.name, 'mcp']);
  assert.ok(!JSON.stringify(entry).includes('/home/'));
});
test('distributed package includes all native loading surfaces', () => {
  for (const rel of ['plugin.json', 'mcp.json', '.codex-plugin', '.factory-plugin', '.agents']) {
    assert.ok(pkg.files.includes(rel), rel);
  }
});
