import { execFileSync } from 'child_process';
import net from 'net';
import path from 'path';
import { FULLSTACK_DATABASE_URL } from './support/runtime-env';

function resolveCommand(base: string) {
  if (base === 'docker') {
    return base;
  }
  return process.platform === 'win32' ? `${base}.cmd` : base;
}

const repoRoot = path.resolve(__dirname, '../../../');

function runPnpm(args: string[], env: NodeJS.ProcessEnv) {
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], {
      cwd: repoRoot,
      stdio: 'inherit',
      env,
    });
    return;
  }

  execFileSync('pnpm', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
  });
}

function resolveDatabasePort() {
  const match = /:(\d+)\/openspace/.exec(FULLSTACK_DATABASE_URL);
  return Number(match?.[1] ?? '5432');
}

async function waitForPort(port: number, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });

    if (isOpen) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`PostgreSQL did not become ready on port ${port} within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  execFileSync(
    resolveCommand('docker'),
    ['compose', '-f', 'infra/docker/docker-compose.yml', 'up', '-d'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );

  await waitForPort(resolveDatabasePort(), 60_000);

  runPnpm(['--filter', '@openspace/api', 'prisma:migrate:deploy'], {
    ...process.env,
    DATABASE_URL: FULLSTACK_DATABASE_URL,
  });
}
