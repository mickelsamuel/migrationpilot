/**
 * Every Action snippet in the docs uses inputs the Action has.
 *
 * Before 1.6.3 the site showed `path:`, `paths:`, `pattern:` and `sarif-file:`,
 * none of which action.yml declares, so a copied snippet failed its first run
 * with "Input required and not supplied: migration-path". This reads every
 * `uses: mickelsamuel/migrationpilot@` in the README, the site and the CLI's
 * own messages, and checks each `with:` block against action.yml.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const action = parseYaml(readFileSync(join(ROOT, 'action.yml'), 'utf8')) as {
  inputs: Record<string, { required?: boolean }>;
};
const INPUTS = Object.keys(action.inputs);
const REQUIRED = INPUTS.filter(name => action.inputs[name]?.required);

const SOURCES = ['README.md', 'site/public/llms.txt', 'site/src', 'src'];

interface Snippet {
  where: string;
  inputs: string[];
}

function filesUnder(path: string): string[] {
  if (!statSync(join(ROOT, path)).isDirectory()) return [path];
  return readdirSync(join(ROOT, path), { recursive: true, encoding: 'utf8' })
    .filter(file => /\.(ts|tsx|md)$/.test(file))
    .map(file => join(path, file));
}

/** Each Action step in the file, with the input names under its `with:`. */
function snippetsIn(file: string): Snippet[] {
  const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
  const snippets: Snippet[] = [];

  lines.forEach((line, i) => {
    if (!/uses:\s+mickelsamuel\/migrationpilot@/.test(line)) return;
    const inputs: string[] = [];
    const withBlock = /^(\s*)with:\s*$/.exec(lines[i + 1] ?? '');
    if (withBlock) {
      const indent = withBlock[1]!.length;
      for (const next of lines.slice(i + 2)) {
        if (next.trim() === '') continue;
        if (next.length - next.trimStart().length <= indent) break;
        const input = /^\s*([a-z][a-z0-9-]*):(\s|$)/.exec(next);
        if (input) inputs.push(input[1]!);
        if (next.includes('`')) break;
      }
    }
    snippets.push({ where: `${file}:${i + 1}`, inputs });
  });

  return snippets;
}

const snippets = SOURCES.flatMap(filesUnder).flatMap(snippetsIn);

describe('Action snippets in the docs', () => {
  it('are all found', () => {
    expect(snippets.length).toBeGreaterThanOrEqual(30);
  });

  it.each(snippets.map(s => [s.where, s] as const))('%s uses only inputs action.yml declares', (_where, snippet) => {
    for (const input of snippet.inputs) {
      expect(INPUTS, `"${input}" is not an input of the Action`).toContain(input);
    }
    for (const input of REQUIRED) {
      expect(snippet.inputs, `the required "${input}" is missing`).toContain(input);
    }
  });
});
