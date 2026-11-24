import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Keep this isolated evaluation from writing telemetry settings outside the project.
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)), ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
