#!/usr/bin/env node
/**
 * End-to-end smoke test for the built GitHub Action bundle.
 *
 * The Action only analyzes anything when the event payload carries a pull
 * request, and it reads the changed-file list from the GitHub API. A release
 * tag is not a pull request, so running the Action from a tag push proves the
 * bundle loads but never reaches a rule. This harness supplies the missing
 * half: a synthetic `pull_request` payload plus a loopback stub for the three
 * REST endpoints the Action calls, so the real bundle runs the real pipeline
 * over a known-bad migration and has to fail for the documented reason.
 *
 * Usage: node scripts/smoke-action.mjs [--bundle <path to action index.js>]
 *
 * Exits 0 when the bundle behaved; non-zero with a diagnosis when it did not.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const bundleArg = process.argv.indexOf('--bundle');
const BUNDLE = resolve(
  bundleArg === -1 ? join(root, 'dist/action/index.js') : process.argv[bundleArg + 1],
);

// The same migration every other smoke in this repo uses (Dockerfile, binaries,
// Homebrew formula): adding a NOT NULL column without a default rewrites the
// table under an ACCESS EXCLUSIVE lock. MP004 is the documented finding.
const BAD_SQL = 'ALTER TABLE users ADD COLUMN email text NOT NULL;\n';
const EXPECTED_RULE = 'MP004';
const MIGRATION = 'migrations/001_smoke.sql';
const REPO = 'mickelsamuel/migrationpilot';
const PR_NUMBER = 1;

function fail(message, detail) {
  console.error(`\nsmoke-action: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// --- workspace ---------------------------------------------------------------
// A scratch directory, not the repo: the Action resolves migration paths
// against cwd and auto-detects .migrationpilotrc.yml, and neither should pick
// up anything from a developer's checkout.
const work = mkdtempSync(join(tmpdir(), 'mp-action-smoke-'));
mkdirSync(join(work, 'migrations'), { recursive: true });
writeFileSync(join(work, MIGRATION), BAD_SQL);

const eventPath = join(work, 'event.json');
writeFileSync(eventPath, JSON.stringify({ pull_request: { number: PR_NUMBER } }));

// @actions/core appends to these and throws if they do not already exist.
const outputPath = join(work, 'command-output.txt');
const summaryPath = join(work, 'step-summary.md');
writeFileSync(outputPath, '');
writeFileSync(summaryPath, '');

// --- GitHub API stub ---------------------------------------------------------
const calls = [];
let postedComment = null;

const server = createServer((req, res) => {
  calls.push(`${req.method} ${req.url.split('?')[0]}`);
  const path = req.url.split('?')[0];
  const send = (code, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(code, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    });
    res.end(payload);
  };

  if (req.method === 'GET' && path === `/repos/${REPO}/pulls/${PR_NUMBER}/files`) {
    return send(200, [{ filename: MIGRATION, status: 'modified' }]);
  }
  if (req.method === 'GET' && path === `/repos/${REPO}/issues/${PR_NUMBER}/comments`) {
    return send(200, []);
  }
  if (req.method === 'POST' && path === `/repos/${REPO}/issues/${PR_NUMBER}/comments`) {
    let body = '';
    req.on('data', c => (body += c));
    return req.on('end', () => {
      try {
        postedComment = JSON.parse(body).body ?? '';
      } catch {
        postedComment = '';
      }
      send(201, { id: 1 });
    });
  }
  return send(404, { message: `smoke stub has no route for ${req.method} ${path}` });
});

await new Promise(done => server.listen(0, '127.0.0.1', done));
const apiUrl = `http://127.0.0.1:${server.address().port}`;

// --- run the bundle ----------------------------------------------------------
console.log(`smoke-action: bundle   ${BUNDLE}`);
console.log(`smoke-action: workdir  ${work}`);

const child = spawn(process.execPath, [BUNDLE], {
  cwd: work,
  env: {
    ...process.env,
    // @actions/core derives these names as INPUT_<NAME uppercased>.
    'INPUT_MIGRATION-PATH': 'migrations/*.sql',
    'INPUT_GITHUB-TOKEN': 'smoke-token',
    'INPUT_PG-VERSION': '17',
    'INPUT_FAIL-ON': 'critical',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: REPO,
    GITHUB_API_URL: apiUrl,
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    GITHUB_WORKSPACE: work,
    NO_COLOR: '1',
    MIGRATIONPILOT_NO_UPDATE_CHECK: '1',
  },
});

let out = '';
child.stdout.on('data', c => (out += c));
child.stderr.on('data', c => (out += c));

const timer = setTimeout(() => {
  child.kill('SIGKILL');
  fail('the Action bundle did not finish within 120s', out);
}, 120_000);

const exitCode = await new Promise(done => {
  child.on('error', err => fail(`could not spawn the bundle: ${err.message}`));
  child.on('close', done);
});
clearTimeout(timer);
server.close();

process.stdout.write(out);

// --- assertions --------------------------------------------------------------
// A bundle that shipped without its external modules fails here rather than in
// a user's workflow. This is the exact breakage that shipped on v1 and v1.5.1.
if (/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(out)) {
  fail('the bundle is missing a runtime dependency', out);
}

// GITHUB_OUTPUT uses heredoc framing: name<<delimiter\nvalue\ndelimiter.
// @actions/core writes it with os.EOL, so normalize before matching or this
// parses nothing on Windows.
const outputFile = readFileSync(outputPath, 'utf-8').replace(/\r\n/g, '\n');
const outputs = Object.fromEntries(
  [...outputFile.matchAll(/^(.+?)<<(\S+)\n([\s\S]*?)\n\2$/gm)].map(m => [m[1], m[3]]),
);

const problems = [];
if (exitCode !== 1) {
  problems.push(`expected exit code 1 (core.setFailed on a critical violation), got ${exitCode}`);
}
if (!out.includes(EXPECTED_RULE)) {
  problems.push(`expected the ${EXPECTED_RULE} violation in the output`);
}
// The risk level is score-thresholded, not severity-thresholded, so pinning it
// to RED would break the release the next time scoring is retuned. What has to
// hold is that a migration with critical findings does not come back clean.
if (!['RED', 'YELLOW'].includes(outputs['risk-level'])) {
  problems.push(
    `expected a non-GREEN risk-level output, got ${outputs['risk-level'] ?? '<unset>'}`,
  );
}
if (!(Number(outputs.violations) > 0)) {
  problems.push(`expected at least one violation, got ${outputs.violations ?? '<unset>'}`);
}
if (!calls.includes(`GET /repos/${REPO}/pulls/${PR_NUMBER}/files`)) {
  problems.push('the Action never asked the API which files changed');
}
if (!postedComment || !postedComment.includes(EXPECTED_RULE)) {
  problems.push('the Action did not post a PR comment naming the violation');
}

if (problems.length > 0) {
  fail(`the Action bundle did not behave as released:\n  - ${problems.join('\n  - ')}`);
}

console.log(
  `\nsmoke-action: OK — exit ${exitCode}, risk-level ${outputs['risk-level']}, ` +
    `${outputs.violations} violation(s), ${EXPECTED_RULE} reported and commented.`,
);
