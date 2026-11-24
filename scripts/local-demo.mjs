import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { seedDemo } from './seed.mjs';

// Local secrets live in .env (gitignored). Format: KEY=VALUE per line, # comments.
const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !line.trim().startsWith('#')) env[match[1]] ??= match[2];
  }
}

const token = randomBytes(32).toString('hex');
const port = env.PORT ?? '4321';
const file = path.resolve('data/experiment.sqlite');
seedDemo(file);
const server = spawn(process.execPath, ['dist/server/entry.mjs'], {
  stdio: 'inherit',
  env: { ...env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: port,
    CALENDAR_EXPERIMENT: 'local', CALENDAR_EXPERIMENT_TOKEN: token, CALENDAR_DATABASE_PATH: file },
});
console.log(`\nЛокальный пример: http://127.0.0.1:${port}/#${token}\nТестовые данные сохраняются при перезапуске. Ctrl+C — остановить.\n`);
process.on('SIGINT', () => server.kill());
process.on('SIGTERM', () => server.kill());
server.on('exit', code => { process.exitCode = code ?? 1; });
