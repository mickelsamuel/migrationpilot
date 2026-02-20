/**
 * Shell completion scripts for MigrationPilot CLI.
 *
 * Generates completion scripts for bash, zsh, and fish shells.
 */

const COMMANDS = ['analyze', 'check', 'plan', 'init', 'detect', 'watch', 'hook', 'list-rules', 'doctor', 'completion'];
const OPTIONS = ['--pg-version', '--format', '--fail-on', '--database-url', '--license-key', '--fix', '--dry-run', '--stdin', '--quiet', '--verbose', '--exclude', '--no-config', '--no-color', '--help', '--version', '--pattern', '--json', '--offline'];

export function generateBashCompletion(): string {
  return `# MigrationPilot bash completion
# Add to ~/.bashrc: eval "$(migrationpilot completion bash)"

_migrationpilot() {
  local cur prev commands options
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${COMMANDS.join(' ')}"
  options="${OPTIONS.join(' ')}"

  case "\${prev}" in
    --format)
      COMPREPLY=( $(compgen -W "text json sarif markdown" -- "\${cur}") )
      return 0
      ;;
    --fail-on)
      COMPREPLY=( $(compgen -W "critical warning never" -- "\${cur}") )
      return 0
      ;;
    hook)
      COMPREPLY=( $(compgen -W "install uninstall" -- "\${cur}") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
  esac

  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( $(compgen -W "\${options}" -- "\${cur}") )
  elif [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  else
    COMPREPLY=( $(compgen -f -- "\${cur}") )
  fi
}

complete -F _migrationpilot migrationpilot
`;
}

export function generateZshCompletion(): string {
  return `#compdef migrationpilot
# MigrationPilot zsh completion
# Add to ~/.zshrc: eval "$(migrationpilot completion zsh)"

_migrationpilot() {
  local -a commands
  commands=(
    'analyze:Analyze a SQL migration file for safety'
    'check:Check all migration files in a directory'
    'plan:Show execution plan for a migration file'
    'init:Generate a .migrationpilotrc.yml config file'
    'detect:Auto-detect migration framework'
    'watch:Watch migration files and re-analyze on change'
    'hook:Install or uninstall git pre-commit hook'
    'list-rules:List all available safety rules'
    'doctor:Check environment and installation'
    'completion:Generate shell completion script'
  )

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case "$state" in
    command)
      _describe 'command' commands
      ;;
    args)
      case "$words[1]" in
        analyze|check|plan)
          _arguments \\
            '--pg-version[Target PostgreSQL version]:version' \\
            '--format[Output format]:format:(text json sarif markdown)' \\
            '--fail-on[Fail threshold]:severity:(critical warning never)' \\
            '--database-url[PostgreSQL connection string]:url' \\
            '--license-key[Pro license key]:key' \\
            '--fix[Auto-fix safe violations]' \\
            '--dry-run[Preview fixes without writing]' \\
            '--stdin[Read SQL from stdin]' \\
            '--quiet[One violation per line]' \\
            '--verbose[Show all checks]' \\
            '--exclude[Rule IDs to exclude]:rules' \\
            '--no-config[Ignore config file]' \\
            '--no-color[Disable colored output]' \\
            '*:file:_files -g "*.sql"'
          ;;
        hook)
          _arguments '1:action:(install uninstall)'
          ;;
        completion)
          _arguments '1:shell:(bash zsh fish)'
          ;;
      esac
      ;;
  esac
}

_migrationpilot
`;
}

export function generateFishCompletion(): string {
  return `# MigrationPilot fish completion
# Add to ~/.config/fish/completions/migrationpilot.fish

# Commands
complete -c migrationpilot -n __fish_use_subcommand -a analyze -d 'Analyze a SQL migration file'
complete -c migrationpilot -n __fish_use_subcommand -a check -d 'Check all migration files in a directory'
complete -c migrationpilot -n __fish_use_subcommand -a plan -d 'Show execution plan for a migration'
complete -c migrationpilot -n __fish_use_subcommand -a init -d 'Generate config file'
complete -c migrationpilot -n __fish_use_subcommand -a detect -d 'Auto-detect migration framework'
complete -c migrationpilot -n __fish_use_subcommand -a watch -d 'Watch and re-analyze on change'
complete -c migrationpilot -n __fish_use_subcommand -a hook -d 'Install/uninstall pre-commit hook'
complete -c migrationpilot -n __fish_use_subcommand -a list-rules -d 'List all safety rules'
complete -c migrationpilot -n __fish_use_subcommand -a doctor -d 'Check environment'
complete -c migrationpilot -n __fish_use_subcommand -a completion -d 'Generate shell completion'

# Options
complete -c migrationpilot -l pg-version -d 'Target PostgreSQL version'
complete -c migrationpilot -l format -xa 'text json sarif markdown' -d 'Output format'
complete -c migrationpilot -l fail-on -xa 'critical warning never' -d 'Fail threshold'
complete -c migrationpilot -l database-url -d 'PostgreSQL connection string'
complete -c migrationpilot -l license-key -d 'Pro license key'
complete -c migrationpilot -l fix -d 'Auto-fix safe violations'
complete -c migrationpilot -l dry-run -d 'Preview fixes'
complete -c migrationpilot -l stdin -d 'Read SQL from stdin'
complete -c migrationpilot -l quiet -d 'One violation per line'
complete -c migrationpilot -l verbose -d 'Show all checks'
complete -c migrationpilot -l exclude -d 'Rule IDs to exclude'
complete -c migrationpilot -l no-config -d 'Ignore config file'
complete -c migrationpilot -l no-color -d 'Disable colors'

# Hook subcommand
complete -c migrationpilot -n '__fish_seen_subcommand_from hook' -a 'install uninstall'

# Completion subcommand
complete -c migrationpilot -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
`;
}
