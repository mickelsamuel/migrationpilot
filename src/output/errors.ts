import chalk from 'chalk';

export interface ParseErrorInfo {
  file: string;
  error: string;
  sql?: string;
}

export function formatParseError(info: ParseErrorInfo): string {
  const lines: string[] = [];
  lines.push(chalk.red.bold('Parse Error'));
  lines.push(`  ${chalk.dim('File:')} ${info.file}`);
  lines.push(`  ${chalk.dim('Error:')} ${info.error}`);

  if (info.sql) {
    const preview = info.sql.replace(/\s+/g, ' ').trim().slice(0, 80);
    lines.push(`  ${chalk.dim('SQL:')} ${preview}${info.sql.length > 80 ? '...' : ''}`);
  }

  lines.push('');
  lines.push(`  ${chalk.dim('If this looks like valid SQL, please open an issue:')}`);
  lines.push(`  ${chalk.blue('https://github.com/mickelsamuel/migrationpilot/issues')}`);
  return lines.join('\n');
}

export function formatFileError(filePath: string): string {
  const lines: string[] = [];
  lines.push(chalk.red.bold('File Not Found'));
  lines.push(`  ${chalk.dim('Path:')} ${filePath}`);
  lines.push('');
  lines.push(`  ${chalk.dim('Common causes:')}`);
  lines.push(`  ${chalk.dim('-')} The file path may be misspelled`);
  lines.push(`  ${chalk.dim('-')} The file may not exist yet`);
  lines.push(`  ${chalk.dim('-')} Check file permissions`);
  return lines.join('\n');
}

export function formatConnectionError(error: string): string {
  const lines: string[] = [];
  lines.push(chalk.yellow.bold('Connection Warning'));
  lines.push(`  ${chalk.dim('Error:')} ${error}`);
  lines.push('');
  lines.push(`  ${chalk.dim('Common causes:')}`);
  lines.push(`  ${chalk.dim('-')} Database is not running or unreachable`);
  lines.push(`  ${chalk.dim('-')} Connection string may be incorrect`);
  lines.push(`  ${chalk.dim('-')} Network/firewall restrictions`);
  lines.push('');
  lines.push(`  ${chalk.green('Static analysis will continue without production context.')}`);
  lines.push(`  ${chalk.dim('Pro features (table sizes, affected queries) will be unavailable.')}`);
  return lines.join('\n');
}

export function formatLicenseError(message: string): string {
  const lines: string[] = [];
  lines.push(chalk.yellow.bold('License Error'));
  lines.push(`  ${chalk.dim('Error:')} ${message}`);
  lines.push('');
  lines.push(`  ${chalk.dim('Get or renew your key at:')} ${chalk.blue('https://migrationpilot.dev/pricing')}`);
  lines.push(`  ${chalk.green('Free static analysis (45 rules) still works without a license.')}`);
  return lines.join('\n');
}
