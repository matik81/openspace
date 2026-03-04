import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

function resolveCommand(base: string) {
  if (base === 'docker') {
    return base;
  }
  return process.platform === 'win32' ? `${base}.cmd` : base;
}

const repoRoot = path.resolve(__dirname, '../../../../');

function readComposePortFromEnvFile() {
  const envPath = path.resolve(repoRoot, 'infra/docker/.env');
  if (!existsSync(envPath)) {
    return null;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const [key, value] = trimmed.split('=', 2);
    if (key === 'POSTGRES_PORT' && value) {
      return value.trim();
    }
  }

  return null;
}

function readRunningDockerPort() {
  try {
    const output = execFileSync(resolveCommand('docker'), ['port', 'openspace-postgres', '5432/tcp'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    const match = /:(\d+)\s*$/.exec(output);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function resolvePostgresPort() {
  return (
    process.env.OPENSPACE_E2E_POSTGRES_PORT ??
    process.env.POSTGRES_PORT ??
    readComposePortFromEnvFile() ??
    readRunningDockerPort() ??
    '5432'
  );
}

export function buildFullStackDatabaseUrl() {
  return `postgresql://openspace:openspace@localhost:${resolvePostgresPort()}/openspace?schema=e2e_playwright`;
}

export const FULLSTACK_DATABASE_URL = buildFullStackDatabaseUrl();
