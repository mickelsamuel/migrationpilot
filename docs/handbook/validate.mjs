#!/usr/bin/env node
/**
 * Validator for The Postgres Migration Safety Handbook.
 *
 * Zero dependencies. Run with:  node docs/handbook/validate.mjs
 *
 * Enforces the evidence standard documented in README.md:
 *   - front matter matches the schema
 *   - the eight required sections are present, and in order
 *   - every referenced rule ID exists in src/rules/
 *   - every High-confidence entry cites at least one incident
 *   - every entry with no incidents states so explicitly
 *   - incident entries have a name, an ISO-ish date, and an http(s) URL
 *   - the README index lists every entry file, and vice versa
 *
 * Exits non-zero if anything fails.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HANDBOOK_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HANDBOOK_DIR, '..', '..');
const RULES_DIR = join(REPO_ROOT, 'src', 'rules');

const REQUIRED_SECTIONS = [
  'Affected versions',
  'Mechanism',
  'Unsafe SQL',
  'Safe SQL',
  'Reproducible lab',
  'Public incidents',
  'How MigrationPilot catches it',
  'Confidence',
];

const REQUIRED_KEYS = [
  'id',
  'title',
  'rules',
  'pg_versions',
  'lock_mode',
  'severity',
  'confidence',
  'last_verified',
  'incidents',
];

const VALID_SEVERITY = new Set(['critical', 'warning', 'info']);
const VALID_CONFIDENCE = new Set(['High', 'Medium']);
const NO_INCIDENT_SENTENCE = 'No public postmortem located as of';

const errors = [];
const warnings = [];

function err(file, msg) {
  errors.push(`${file}: ${msg}`);
}
function warn(file, msg) {
  warnings.push(`${file}: ${msg}`);
}

/* ------------------------------------------------------------------ *
 * Minimal YAML front-matter parser.
 * Supports exactly the subset this handbook uses: scalars, inline
 * arrays, and a list of maps. Deliberately strict — it should fail
 * loudly rather than silently mis-parse.
 * ------------------------------------------------------------------ */
function unquote(v) {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length > 1) ||
    (t.startsWith("'") && t.endsWith("'") && t.length > 1)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseFrontMatter(rawInput, file) {
  // Normalise CRLF so the parser behaves identically on Windows checkouts.
  const raw = rawInput.replace(/\r\n/g, '\n').replace(/^﻿/, '');
  if (!raw.startsWith('---\n')) {
    err(file, 'missing YAML front matter (file must start with "---")');
    return null;
  }
  const end = raw.indexOf('\n---', 4);
  if (end === -1) {
    err(file, 'front matter is not terminated with "---"');
    return null;
  }
  const block = raw.slice(4, end);
  const body = raw.slice(end + 4);

  const data = {};
  const lines = block.split('\n');
  let currentListKey = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // list item belonging to the current list key
    if (/^\s+-\s/.test(line)) {
      if (!currentListKey) {
        err(file, `list item at line ${i + 2} has no parent key`);
        continue;
      }
      const item = {};
      const first = line.replace(/^\s+-\s+/, '');
      const m = first.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
      if (m) item[m[1]] = unquote(m[2]);
      // continuation lines of the same map
      while (i + 1 < lines.length && /^\s{3,}[A-Za-z_][\w]*:/.test(lines[i + 1])) {
        const cm = lines[++i].trim().match(/^([A-Za-z_][\w]*):\s*(.*)$/);
        if (cm) item[cm[1]] = unquote(cm[2]);
      }
      data[currentListKey].push(item);
      continue;
    }

    const m = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (!m) {
      err(file, `unparseable front-matter line ${i + 2}: ${JSON.stringify(line)}`);
      continue;
    }
    const [, key, rest] = m;
    const value = rest.trim();

    if (value === '') {
      data[key] = [];
      currentListKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner === '' ? [] : inner.split(',').map((s) => unquote(s));
      currentListKey = null;
    } else {
      data[key] = unquote(value);
      currentListKey = null;
    }
  }
  return { data, body };
}

/* ------------------------------------------------------------------ *
 * Load the real rule IDs from src/rules/ so citations can't drift.
 * ------------------------------------------------------------------ */
function loadRuleIds() {
  if (!existsSync(RULES_DIR)) {
    warn('validate.mjs', `src/rules not found at ${RULES_DIR}; skipping rule-ID checks`);
    return null;
  }
  const ids = new Set();
  for (const f of readdirSync(RULES_DIR)) {
    const m = f.match(/^(MP\d{3})-.*\.ts$/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/* ------------------------------------------------------------------ *
 * Per-entry validation
 * ------------------------------------------------------------------ */
function validateEntry(file, raw, ruleIds) {
  const parsed = parseFrontMatter(raw, file);
  if (!parsed) return null;
  const { data, body } = parsed;

  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) err(file, `front matter missing required key: ${key}`);
  }

  const expectedId = `MPH-${basename(file).slice(0, 2).padStart(3, '0')}`;
  if (data.id && data.id !== expectedId) {
    err(file, `id "${data.id}" does not match filename (expected "${expectedId}")`);
  }

  if (data.severity && !VALID_SEVERITY.has(data.severity)) {
    err(file, `severity "${data.severity}" is not one of ${[...VALID_SEVERITY].join(', ')}`);
  }
  if (data.confidence && !VALID_CONFIDENCE.has(data.confidence)) {
    err(file, `confidence "${data.confidence}" is not one of ${[...VALID_CONFIDENCE].join(', ')}`);
  }
  if (data.last_verified && !/^\d{4}-\d{2}-\d{2}$/.test(data.last_verified)) {
    err(file, `last_verified "${data.last_verified}" is not YYYY-MM-DD`);
  }

  // rules must be a non-empty array of real rule IDs
  if (!Array.isArray(data.rules) || data.rules.length === 0) {
    err(file, 'rules must be a non-empty array');
  } else {
    for (const r of data.rules) {
      if (!/^MP\d{3}$/.test(r)) {
        err(file, `malformed rule ID: ${JSON.stringify(r)}`);
      } else if (ruleIds && !ruleIds.has(r)) {
        err(file, `rule ${r} does not exist in src/rules/`);
      }
    }
  }

  // incidents
  const incidents = Array.isArray(data.incidents) ? data.incidents : [];
  for (const inc of incidents) {
    if (!inc.name) err(file, 'incident missing "name"');
    if (!inc.date) {
      err(file, `incident "${inc.name ?? '?'}" missing "date"`);
    } else if (!/^\d{4}(-\d{2}){0,2}$/.test(inc.date)) {
      err(file, `incident "${inc.name}" has malformed date "${inc.date}" (want YYYY[-MM[-DD]])`);
    }
    if (!inc.url) {
      err(file, `incident "${inc.name ?? '?'}" missing "url"`);
    } else if (!/^https?:\/\//.test(inc.url)) {
      err(file, `incident "${inc.name}" url is not http(s): ${inc.url}`);
    }
  }

  // The evidence standard: High requires an incident; no incidents requires the sentence.
  if (data.confidence === 'High' && incidents.length === 0) {
    err(file, 'confidence is High but no incidents are cited (High requires >= 1 incident)');
  }
  if (incidents.length === 0 && !body.includes(NO_INCIDENT_SENTENCE)) {
    err(
      file,
      `has no incidents and does not state "${NO_INCIDENT_SENTENCE} <date>" in the body`,
    );
  }

  // sections present, and in the documented order
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
  let cursor = -1;
  for (const section of REQUIRED_SECTIONS) {
    const idx = headings.indexOf(section);
    if (idx === -1) {
      err(file, `missing required section: "## ${section}"`);
    } else if (idx < cursor) {
      err(file, `section "## ${section}" is out of order`);
    } else {
      cursor = idx;
    }
  }

  // a lab must actually contain a runnable command
  const labStart = body.indexOf('## Reproducible lab');
  const labEnd = body.indexOf('## Public incidents');
  if (labStart !== -1 && labEnd > labStart) {
    const lab = body.slice(labStart, labEnd);
    if (!lab.includes('docker run')) {
      err(file, 'Reproducible lab does not contain a "docker run" line');
    }
    if (!/```bash/.test(lab)) {
      err(file, 'Reproducible lab has no ```bash block');
    }
  }

  // both SQL sections should contain SQL
  for (const s of ['Unsafe SQL', 'Safe SQL']) {
    const i = body.indexOf(`## ${s}`);
    if (i === -1) continue;
    const nextIdx = body.indexOf('\n## ', i + 1);
    const chunk = body.slice(i, nextIdx === -1 ? undefined : nextIdx);
    if (!/```sql/.test(chunk)) err(file, `"## ${s}" has no \`\`\`sql block`);
  }

  return data;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
const ruleIds = loadRuleIds();

const entryFiles = readdirSync(HANDBOOK_DIR)
  .filter((f) => /^\d{2}-.*\.md$/.test(f))
  .sort();

if (entryFiles.length === 0) {
  err('validate.mjs', 'no entry files found (expected NN-slug.md)');
}

const entries = [];
for (const f of entryFiles) {
  const raw = readFileSync(join(HANDBOOK_DIR, f), 'utf8');
  const data = validateEntry(f, raw, ruleIds);
  if (data) entries.push({ file: f, data });
}

// ids must be unique
const seen = new Map();
for (const { file, data } of entries) {
  if (!data.id) continue;
  if (seen.has(data.id)) err(file, `duplicate id ${data.id} (also in ${seen.get(data.id)})`);
  else seen.set(data.id, file);
}

// entry numbering must be contiguous from 01
entryFiles.forEach((f, i) => {
  const n = Number(f.slice(0, 2));
  if (n !== i + 1) err(f, `entry number ${f.slice(0, 2)} breaks contiguous numbering (expected ${String(i + 1).padStart(2, '0')})`);
});

// README index must list every entry, and only real entries
const readmePath = join(HANDBOOK_DIR, 'README.md');
if (!existsSync(readmePath)) {
  err('README.md', 'missing');
} else {
  const readme = readFileSync(readmePath, 'utf8');
  for (const f of entryFiles) {
    if (!readme.includes(`(${f})`)) err('README.md', `index does not link entry ${f}`);
  }
  const linked = [...readme.matchAll(/\((\d{2}-[a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
  for (const l of new Set(linked)) {
    if (!entryFiles.includes(l)) err('README.md', `index links non-existent entry ${l}`);
  }
  if (!readme.includes(NO_INCIDENT_SENTENCE)) {
    warn('README.md', 'evidence standard does not state the no-incident sentence');
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */
const byGrade = { High: 0, Medium: 0 };
let incidentCount = 0;
const noIncidentEntries = [];
for (const { file, data } of entries) {
  if (data.confidence in byGrade) byGrade[data.confidence]++;
  const n = Array.isArray(data.incidents) ? data.incidents.length : 0;
  incidentCount += n;
  if (n === 0) noIncidentEntries.push(file);
}

console.log('The Postgres Migration Safety Handbook — validator\n');
console.log(`  entries            ${entries.length}`);
console.log(`  rules referenced   ${new Set(entries.flatMap((e) => e.data.rules ?? [])).size} distinct`);
console.log(`  incident citations ${incidentCount}`);
console.log(`  confidence         High ${byGrade.High} / Medium ${byGrade.Medium}`);
if (noIncidentEntries.length) {
  console.log(`  no public incident ${noIncidentEntries.join(', ')}`);
}
console.log('');

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}

if (errors.length) {
  console.log(`FAILED — ${errors.length} error(s):`);
  for (const e of errors) console.log(`  x ${e}`);
  process.exit(1);
}

console.log('PASS — all entries conform to the evidence standard.');
