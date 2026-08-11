/**
 * `--from-command` support.
 *
 * For frameworks whose SQL only exists once they generate it (Django, Alembic,
 * Liquibase XML, Rails), the honest path is to run the generator and analyze
 * what it prints. This runs a user-supplied command and hands back its stdout.
 *
 * The command is the user's own — nothing is inferred or run implicitly.
 */

import { spawn } from 'node:child_process';

export interface CommandResult {
  /** stdout of the command — the SQL to analyze */
  sql: string;
  /** stderr, surfaced when the command fails (Alembic logs here on success too) */
  stderr: string;
  exitCode: number;
  /** Set when the process could not be started or timed out */
  error?: string;
}

export interface RunOptions {
  cwd?: string;
  /** Milliseconds before the command is killed (default 2 minutes) */
  timeoutMs?: number;
}

export async function runSqlCommand(command: string, options: RunOptions = {}): Promise<CommandResult> {
  const { cwd = process.cwd(), timeoutMs = 120_000 } = options;

  return new Promise<CommandResult>(resolve => {
    const child = spawn(command, { cwd, shell: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        sql: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
        exitCode: 1,
        error: `command timed out after ${Math.round(timeoutMs / 1000)}s`,
      });
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));

    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ sql: '', stderr: Buffer.concat(stderr).toString('utf-8'), exitCode: 1, error: err.message });
    });

    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        sql: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
        exitCode: code ?? 0,
      });
    });
  });
}
