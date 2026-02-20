import { describe, it, expect } from 'vitest';
import { generateBashCompletion, generateZshCompletion, generateFishCompletion } from '../src/completion/scripts.js';

describe('shell completion scripts', () => {
  it('generates bash completion with all commands', () => {
    const script = generateBashCompletion();
    expect(script).toContain('_migrationpilot');
    expect(script).toContain('analyze');
    expect(script).toContain('check');
    expect(script).toContain('plan');
    expect(script).toContain('doctor');
    expect(script).toContain('completion');
    expect(script).toContain('complete -F _migrationpilot migrationpilot');
  });

  it('generates zsh completion with descriptions', () => {
    const script = generateZshCompletion();
    expect(script).toContain('#compdef migrationpilot');
    expect(script).toContain('analyze:Analyze a SQL migration file');
    expect(script).toContain('doctor:Check environment');
    expect(script).toContain('--format');
  });

  it('generates fish completion with subcommands', () => {
    const script = generateFishCompletion();
    expect(script).toContain('complete -c migrationpilot');
    expect(script).toContain('-a analyze');
    expect(script).toContain('-a doctor');
    expect(script).toContain('-l format');
    expect(script).toContain("'text json sarif markdown'");
  });

  it('bash completion includes format options', () => {
    const script = generateBashCompletion();
    expect(script).toContain('text json sarif markdown');
    expect(script).toContain('critical warning never');
  });

  it('all scripts include hook subcommand completions', () => {
    const bash = generateBashCompletion();
    const zsh = generateZshCompletion();
    const fish = generateFishCompletion();

    expect(bash).toContain('install uninstall');
    expect(zsh).toContain('install uninstall');
    expect(fish).toContain('install uninstall');
  });
});
