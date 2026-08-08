#!/usr/bin/env node
// Repository-level regression checks. Zero dependencies; run with Node >= 16.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'skill/SKILL.md',
  'skill/audit-project.workflow.js',
  'skill/references/sources.md',
  'skills/rust-intel/SKILL.md',
  '.codex-plugin/plugin.json',
  'bin/install-codex.js',
  'dev/set-release-version.mjs',
  'dev/validate-fixtures.mjs',
  'examples/fixtures/cases.json',
];
const errors = [];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) errors.push(`missing required file: ${rel}`);

function markdownUnder(dir) {
  const markdownFiles = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(full);
    }
  }
  walk(dir);
  return markdownFiles;
}

function validateLinks(skillRoot, label) {
  const markdownFiles = markdownUnder(skillRoot);
  for (const file of markdownFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of source.matchAll(linkRe)) {
      const target = match[1].trim().split('#', 1)[0].split('?', 1)[0];
      if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) continue;
      const resolved = path.resolve(path.dirname(file), target);
      const relative = path.relative(skillRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) errors.push(`${label} link escapes the installable skill: ${path.relative(root, file)} -> ${target}`);
      else if (!fs.existsSync(resolved)) errors.push(`broken ${label} link: ${path.relative(root, file)} -> ${target}`);
    }
  }
  return markdownFiles;
}

const canonicalSkill = path.join(root, 'skill');
const codexSkill = path.join(root, 'skills/rust-intel');
const markdownFiles = validateLinks(canonicalSkill, 'canonical');
validateLinks(codexSkill, 'Codex mirror');

function relativeFiles(dir) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.js'))) files.push(path.relative(dir, full));
    }
  }
  walk(dir);
  return files.sort();
}

const workflow = fs.readFileSync(path.join(root, 'skill/audit-project.workflow.js'), 'utf8');
for (const module of ['async.md', 'concurrency-and-state.md', 'data-and-types.md', 'security.md', 'unsafe-and-ffi.md', 'drop-and-raii.md', 'deps-macros-ergonomics.md', 'lifetimes-and-api.md', 'testing.md', 'semantics-and-conformance.md']) {
  if (!workflow.includes(`file: '${module}'`)) errors.push(`workflow missing module: ${module}`);
}

const plugin = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const claudePlugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
const allowedPluginFields = new Set(['id', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'skills', 'apps', 'mcpServers', 'hooks', 'interface']);
for (const field of Object.keys(plugin)) if (!allowedPluginFields.has(field)) errors.push(`unsupported Codex plugin field: ${field}`);
for (const field of ['name', 'version', 'description']) if (typeof plugin[field] !== 'string' || !plugin[field].trim()) errors.push(`Codex plugin field ${field} must be a non-empty string`);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(plugin.version || '')) errors.push('Codex plugin version must be strict semver');
if (!plugin.author || typeof plugin.author.name !== 'string' || !plugin.author.name.trim()) errors.push('Codex plugin author.name is required');
if (plugin.author && Object.keys(plugin.author).some((field) => !['name', 'email', 'url'].includes(field))) errors.push('Codex plugin author contains unsupported fields');
if (plugin.skills !== './skills/') errors.push('Codex manifest must point skills at ./skills/');
for (const field of ['skills', 'mcpServers', 'apps', 'hooks']) if (plugin[field] !== undefined && (typeof plugin[field] !== 'string' || !plugin[field].startsWith('./') || plugin[field].includes('..'))) errors.push(`Codex plugin ${field} must be a relative ./ path without parent traversal`);
const requiredInterfaceStrings = ['displayName', 'shortDescription', 'longDescription', 'developerName'];
const allowedInterfaceFields = new Set([...requiredInterfaceStrings, 'category', 'capabilities', 'websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL', 'brandColor', 'brandColorDark', 'composerIcon', 'logo', 'logoDark', 'screenshots', 'defaultPrompt', 'default_prompt']);
const interfaceLimits = { displayName: 80, shortDescription: 240, longDescription: 4000, developerName: 120 };
const categories = new Set(['Productivity', 'Creativity', 'Developer Tools', 'Business & Operations', 'Data & Analytics', 'Communication', 'Education & Research', 'Security', 'Finance', 'Healthcare', 'Travel', 'Entertainment', 'Other']);
if (!plugin.interface || typeof plugin.interface !== 'object' || Array.isArray(plugin.interface)) errors.push('Codex plugin interface must be an object');
if (plugin.interface) for (const field of Object.keys(plugin.interface)) if (!allowedInterfaceFields.has(field)) errors.push(`unsupported Codex plugin interface field: ${field}`);
for (const field of requiredInterfaceStrings) if (!plugin.interface || typeof plugin.interface[field] !== 'string' || !plugin.interface[field].trim()) errors.push(`Codex plugin interface.${field} is required`);
for (const [field, limit] of Object.entries(interfaceLimits)) if (typeof plugin.interface?.[field] === 'string' && plugin.interface[field].length > limit) errors.push(`Codex plugin interface.${field} exceeds ${limit} characters`);
if (plugin.interface?.shortDescription?.includes('\n')) errors.push('Codex plugin interface.shortDescription must fit on one line');
if (plugin.interface?.category && !categories.has(plugin.interface.category)) errors.push('Codex plugin interface.category is not a supported category');
if (plugin.interface?.capabilities !== undefined && (!Array.isArray(plugin.interface.capabilities) || plugin.interface.capabilities.length > 20 || !plugin.interface.capabilities.every((item) => typeof item === 'string' && item.trim() && item.length <= 120))) errors.push('Codex plugin interface.capabilities must contain at most 20 non-empty strings of at most 120 characters');
const defaultPromptValue = plugin.interface && (plugin.interface.defaultPrompt || plugin.interface.default_prompt);
const defaultPrompts = typeof defaultPromptValue === 'string' ? [defaultPromptValue] : defaultPromptValue;
if (defaultPromptValue !== undefined && (!Array.isArray(defaultPrompts) || defaultPrompts.length < 1 || defaultPrompts.length > 3 || !defaultPrompts.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 512 && !item.includes('\n')))) errors.push('Codex plugin interface.defaultPrompt must be a string or contain at most 3 one-line strings of at most 512 characters');
for (const field of ['brandColor', 'brandColorDark']) if (plugin.interface?.[field] !== undefined && (typeof plugin.interface[field] !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(plugin.interface[field]))) errors.push(`Codex plugin interface.${field} must be a six-digit hex color`);
for (const [holder, fields] of [[plugin, ['homepage', 'repository']], [plugin.author || {}, ['url']], [plugin.interface || {}, ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']]]) {
  for (const field of fields) if (holder[field] !== undefined && (typeof holder[field] !== 'string' || !holder[field].startsWith('https://') || holder[field].length > 2048)) errors.push(`Codex plugin ${field} must be an absolute HTTPS URL of at most 2048 characters`);
}
if (plugin.keywords !== undefined && (!Array.isArray(plugin.keywords) || !plugin.keywords.every((item) => typeof item === 'string' && item.trim()))) errors.push('Codex plugin keywords must be an array of non-empty strings');
if (plugin.apps !== undefined && !fs.existsSync(path.join(root, '.app.json'))) errors.push('Codex plugin declares apps without .app.json');
if (typeof plugin.mcpServers === 'string' && !fs.existsSync(path.join(root, '.mcp.json'))) errors.push('Codex plugin declares mcpServers without .mcp.json');
if (plugin.version !== packageJson.version || plugin.version !== claudePlugin.version) errors.push(`version mismatch: Codex=${plugin.version}, npm=${packageJson.version}, Claude=${claudePlugin.version}`);

for (const token of ['artifactsReviewed', 'sourceFilesReviewed', 'docsReviewed', 'missingArtifacts', 'missingUnitInputs', "required: ['manifests', 'lockfiles', 'toolchains', 'configs', 'ci', 'scripts', 'ffi']"]) {
  if (!workflow.includes(token)) errors.push(`workflow coverage contract is missing ${token}`);
}

const canonicalFiles = relativeFiles(canonicalSkill);
const codexFiles = relativeFiles(codexSkill);
if (JSON.stringify(canonicalFiles) !== JSON.stringify(codexFiles)) errors.push('Codex skill mirror file list is out of sync with skill/');
for (const rel of canonicalFiles) {
  if (fs.readFileSync(path.join(canonicalSkill, rel), 'utf8') !== fs.readFileSync(path.join(codexSkill, rel), 'utf8')) errors.push(`Codex skill mirror is out of sync: ${rel}`);
}
const fixtureRun = spawnSync(process.execPath, [path.join(root, 'dev/validate-fixtures.mjs')], { encoding: 'utf8' });
if (fixtureRun.status !== 0) errors.push(`fixture validation failed: ${(fixtureRun.stderr || fixtureRun.stdout).trim()}`);
const invalidCli = spawnSync(process.execPath, [path.join(root, 'bin/install-codex.js'), '--user-dir', '--uninstall'], { encoding: 'utf8' });
if (invalidCli.status === 0 || !invalidCli.stderr.includes('--user-dir requires a path')) errors.push('Codex installer accepted a missing --user-dir value');
const duplicateCli = spawnSync(process.execPath, [path.join(root, 'bin/install-codex.js'), '--user-dir', 'one', '--user-dir', 'two'], { encoding: 'utf8' });
if (duplicateCli.status === 0 || !duplicateCli.stderr.includes('--user-dir may be specified only once')) errors.push('Codex installer accepted duplicate --user-dir arguments');
const helpCli = spawnSync(process.execPath, [path.join(root, 'bin/install-codex.js'), '--help'], { encoding: 'utf8' });
if (helpCli.status !== 0) errors.push('Codex installer --help failed');

if (errors.length) {
  console.error(errors.map((e) => `ERROR: ${e}`).join('\n'));
  process.exit(1);
}
console.log(`rust-intel validation passed (${markdownFiles.length} skill markdown files checked)`);
