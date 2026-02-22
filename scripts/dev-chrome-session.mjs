import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PNPM_CMD = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const DEFAULT_URL = 'http://localhost:3000';

let devProcess = null;
let chromeProcess = null;
let chromeProfileDir = null;
let cleaningUp = false;

function log(message) {
  process.stdout.write(`[dev:chrome] ${message}\n`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const shell =
      options.shell ?? (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'));
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell,
      ...options,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`,
        ),
      );
    });
  });
}

function findChromePath() {
  const envPath = process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  if (process.platform === 'win32') {
    const candidates = [
      process.env.PROGRAMFILES &&
        join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      process.env['PROGRAMFILES(X86)'] &&
        join(
          process.env['PROGRAMFILES(X86)'],
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        ),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter(Boolean);

    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  const unixCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  return unixCandidates.find((candidate) => existsSync(candidate)) ?? null;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => resolve());
  });
}

async function terminateProcessTree(child, label) {
  if (!child || child.killed) {
    return;
  }

  const pid = child.pid;
  if (!pid) {
    return;
  }

  log(`Stopping ${label} (pid ${pid})...`);

  try {
    if (process.platform === 'win32') {
      await runCommand('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }

    child.kill('SIGTERM');
  } catch {
    // Ignore process shutdown race conditions.
  }
}

async function cleanup(reason) {
  if (cleaningUp) {
    return;
  }
  cleaningUp = true;

  log(`Cleanup started (${reason})`);

  if (reason !== 'chrome-closed') {
    await terminateProcessTree(chromeProcess, 'Chrome').catch(() => {});
  }

  await terminateProcessTree(devProcess, 'pnpm dev').catch(() => {});

  if (chromeProfileDir) {
    try {
      rmSync(chromeProfileDir, { recursive: true, force: true });
    } catch {
      // Best-effort temp profile cleanup.
    }
  }

  try {
    await runCommand(PNPM_CMD, ['db:down']);
  } catch (error) {
    log(`Failed to run pnpm db:down: ${error.message}`);
  }
}

async function main() {
  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error(
      'Chrome non trovato. Imposta CHROME_PATH oppure installa Google Chrome.',
    );
  }

  log('Starting database...');
  await runCommand(PNPM_CMD, ['db:up']);

  log('Starting development servers...');
  devProcess = spawn(PNPM_CMD, ['dev'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  devProcess.once('exit', (code, signal) => {
    if (!cleaningUp) {
      log(
        `pnpm dev exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? 0}`})`,
      );
    }
  });

  chromeProfileDir = mkdtempSync(join(tmpdir(), 'openspace-chrome-'));

  log(`Opening Chrome incognito on ${DEFAULT_URL}...`);
  chromeProcess = spawn(
    chromePath,
    [
      '--incognito',
      '--new-window',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${chromeProfileDir}`,
      DEFAULT_URL,
    ],
    {
      stdio: 'ignore',
      shell: false,
      windowsHide: false,
    },
  );

  await waitForExit(chromeProcess);
  await cleanup('chrome-closed');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup(signal).finally(() => process.exit(0));
  });
}

process.on('uncaughtException', (error) => {
  log(`Unhandled error: ${error.message}`);
  cleanup('uncaughtException').finally(() => process.exit(1));
});

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  log(`Unhandled rejection: ${message}`);
  cleanup('unhandledRejection').finally(() => process.exit(1));
});

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error) => {
    log(error.message);
    await cleanup('startup-failure');
    process.exit(1);
  });
