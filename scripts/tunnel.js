// Spin up a public tunnel to the local c-office server. Tries Cloudflare
// Quick Tunnel first (no account, free, durable URL for the session); falls
// back to localtunnel.me if cloudflared can't start. Either way, the printed
// URL routes external traffic to http://127.0.0.1:${PORT} (default 7878).
//
// Usage:
//   npm run tunnel              # auto-pick (cloudflare first, fallback localtunnel)
//   npm run tunnel:cloudflare   # force cloudflared
//   npm run tunnel:localtunnel  # force localtunnel
//
// Public URLs are unauthenticated by default. Set C_OFFICE_ACCESS_TOKEN
// (or C_OFFICE_PUBLIC_TOKEN) before `npm start` to gate every route behind a
// shared token — see server/security/access-token.js for the middleware.

import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = Number(process.env.PORT || 7878);
const PROVIDER = (process.argv[2] || process.env.TUNNEL_PROVIDER || 'auto').toLowerCase();

function color(s, code) { return `\x1b[${code}m${s}\x1b[0m`; }
const cyan   = (s) => color(s, 36);
const yellow = (s) => color(s, 33);
const green  = (s) => color(s, 32);
const red    = (s) => color(s, 31);
const dim    = (s) => color(s, 2);

console.log(cyan('━'.repeat(60)));
console.log(cyan(`c-office tunnel → http://127.0.0.1:${PORT}`));
if (!process.env.C_OFFICE_ACCESS_TOKEN && !process.env.C_OFFICE_PUBLIC_TOKEN) {
  console.log(yellow('⚠  No access token set — the tunnel is OPEN to anyone with the URL.'));
  console.log(dim('   Restart the server with C_OFFICE_ACCESS_TOKEN=<secret> to require login at /access'));
  console.log(dim('   or pass `Authorization: Bearer <secret>` / `?token=<secret>` on requests.'));
}
console.log(cyan('━'.repeat(60)));

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...opts,
    });
    child.on('error', (err) => resolve({ ok: false, err }));
    child.on('exit', (code) => resolve({ ok: code === 0, code }));
  });
}

async function tryCloudflared() {
  console.log(green('▶ Trying Cloudflare Quick Tunnel (cloudflared)…'));
  const r = await runCmd('npx', ['-y', 'cloudflared@latest', 'tunnel', '--url', `http://127.0.0.1:${PORT}`]);
  return r.ok;
}

async function tryLocaltunnel() {
  console.log(green('▶ Trying localtunnel.me…'));
  const r = await runCmd('npx', ['-y', 'localtunnel', '--port', String(PORT)]);
  return r.ok;
}

(async () => {
  if (PROVIDER === 'cloudflare') {
    const ok = await tryCloudflared();
    process.exit(ok ? 0 : 1);
  }
  if (PROVIDER === 'localtunnel') {
    const ok = await tryLocaltunnel();
    process.exit(ok ? 0 : 1);
  }
  // auto: cloudflare first, fall back to localtunnel
  const ok = await tryCloudflared();
  if (ok) process.exit(0);
  console.log(red('cloudflared failed — falling back to localtunnel.'));
  const ok2 = await tryLocaltunnel();
  process.exit(ok2 ? 0 : 1);
})();
