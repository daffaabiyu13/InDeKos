// Test runner: boots throwaway API servers on temporary databases (with
// the date pinned so assertions are stable) and runs each suite.
//   npm test            → semua suite
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-09-27'; // data seed disusun di sekitar tanggal ini

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function startServer(extraEnv = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indekos-test-'));
  const port = await freePort();
  const proc = spawn(process.execPath, ['--no-warnings', 'src/index.js'], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), DISABLE_SCHEDULER: '1', APP_TODAY: TODAY, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { port, stop: () => { proc.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); }, log: () => log };
}

const run = (file, args, env = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(root, 'test', file), ...args.map(String)], { stdio: 'inherit', env: { ...process.env, APP_TODAY: TODAY, ...env } });
  p.on('exit', (code) => resolve(code));
});

let failed = 0;

console.log('\n▶ API suite');
const a = await startServer();
failed += (await run('api.test.mjs', [a.port])) ? 1 : 0;
a.stop();

console.log('\n▶ WhatsApp + Google Calendar suite (mock gateway)');
const mock = await freePort();
const b = await startServer({
  GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_TOKEN_URL: `http://localhost:${mock}/token`,
  GOOGLE_REVOKE_URL: `http://localhost:${mock}/revoke`,
  GOOGLE_CALENDAR_API: `http://localhost:${mock}`,
  FONNTE_API_URL: `http://localhost:${mock}/fonnte/send`,
  GOOGLE_USERINFO_URL: `http://localhost:${mock}/userinfo`,
});
failed += (await run('integration.test.mjs', [b.port, mock])) ? 1 : 0;
b.stop();

console.log('\n▶ AI Asisten suite (mock Claude API)');
const aiMock = await freePort();
const c = await startServer({ ANTHROPIC_BASE_URL: `http://localhost:${aiMock}`, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', AI_MODEL: '' });
failed += (await run('ai.test.mjs', [c.port, aiMock])) ? 1 : 0;
if (failed) console.log(c.log().slice(-2000));
c.stop();

console.log(failed ? `\n✗ ${failed} suite gagal` : '\n✓ Semua suite lulus');
process.exit(failed ? 1 : 0);
