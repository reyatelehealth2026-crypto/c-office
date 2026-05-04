#!/usr/bin/env node
// Record a hero video of c-office in action — opens the dashboard, walks
// through the 9-persona grid, sends a prompt to Atlas, and captures the
// run lighting up across the roster. Output goes to docs/hero/.
//
// Usage:
//   1. (one-time) npm i -D playwright && npx playwright install chromium
//   2. (terminal 1) npm run dev          # c-office must be running
//   3. (terminal 2) npm run record-hero
//
// Env:
//   COFFICE_BASE_URL  — defaults to http://127.0.0.1:7878
//   COFFICE_TOKEN     — Authorization Bearer for /access gate (if enabled)
//   HERO_PROMPT       — override the default prompt sent to Atlas
//   HERO_MAX_WAIT_MS  — cap on wait-for-run-finish (default 90000)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const HERO_DIR = path.join(PROJECT_ROOT, 'docs', 'hero');

const BASE_URL = process.env.COFFICE_BASE_URL || 'http://127.0.0.1:7878';
const TOKEN = process.env.COFFICE_TOKEN || process.env.C_OFFICE_ACCESS_TOKEN || process.env.C_OFFICE_PUBLIC_TOKEN;
const PROMPT = process.env.HERO_PROMPT
  || 'เขียนโพสต์ Facebook โปรโมตคาเฟ่เปิดใหม่ย่านเอกมัย พร้อมรูปประกอบ 1 รูป สไตล์อบอุ่น';
const MAX_WAIT_MS = Number(process.env.HERO_MAX_WAIT_MS) || 90_000;

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('[record-hero] playwright not installed. Run:');
    console.error('  npm i -D playwright');
    console.error('  npx playwright install chromium');
    process.exit(1);
  }

  fs.mkdirSync(HERO_DIR, { recursive: true });

  // Ping the server first so we fail fast with a useful message.
  try {
    const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
    const res = await fetch(`${BASE_URL}/api/state`, { headers });
    if (!res.ok) throw new Error(`server returned ${res.status}`);
  } catch (error) {
    console.error(`[record-hero] cannot reach ${BASE_URL} — start \`npm run dev\` first.`);
    console.error(`  detail: ${error.message}`);
    process.exit(1);
  }

  console.log(`[record-hero] launching chromium → ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    recordVideo: { dir: HERO_DIR, size: { width: 1280, height: 800 } },
    extraHTTPHeaders: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  const page = await context.newPage();

  try {
    // 1. Land on dashboard, wait for window.AGENTS to populate.
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => Array.isArray(window.AGENTS) && window.AGENTS.length > 0,
      { timeout: 15_000 },
    );
    console.log('[record-hero] dashboard loaded');
    await page.waitForTimeout(2_000);

    // 2. Navigate to the agents (roster) page if available.
    try {
      await page.goto(`${BASE_URL}/#/agents`, { waitUntil: 'networkidle', timeout: 8_000 });
    } catch {
      /* not all builds expose this route — keep going */
    }
    await page.waitForTimeout(3_000);

    // 3. Back to dashboard for the prompt input.
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1_500);

    // 4. Find the Send-to-Atlas input. We try a list of known selectors; the
    //    first one that matches wins. If none match the user can update this
    //    list — but the live build should have one of these.
    const inputCandidates = [
      'textarea[placeholder*="Atlas" i]',
      'input[placeholder*="Atlas" i]',
      'textarea[aria-label*="Atlas" i]',
      'input[aria-label*="Atlas" i]',
      '[data-testid="orchestra-input"]',
      'textarea',
    ];
    let typed = false;
    for (const sel of inputCandidates) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await el.fill(PROMPT);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        console.log(`[record-hero] sent prompt via ${sel}`);
        typed = true;
        break;
      }
    }
    if (!typed) {
      console.warn('[record-hero] no Atlas input found — recording roster animation only');
    }

    // 5. Wait for a run to finish or timeout.
    const finishedAt = Date.now() + MAX_WAIT_MS;
    while (Date.now() < finishedAt) {
      const runState = await page.evaluate(() => {
        const runs = (window.RUNS || []).slice(-1)[0];
        return runs ? { id: runs.id, status: runs.status, phase: runs.phase } : null;
      }).catch(() => null);
      if (runState && (runState.status === 'completed' || runState.status === 'failed')) {
        console.log(`[record-hero] run ${runState.id} ${runState.status}`);
        break;
      }
      await page.waitForTimeout(2_000);
    }

    await page.waitForTimeout(2_000);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // Find the most-recent .webm in HERO_DIR and rename to a stable filename.
  const files = fs.readdirSync(HERO_DIR).filter((f) => f.endsWith('.webm'));
  const newest = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(HERO_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) {
    console.error('[record-hero] playwright did not write a video file');
    process.exit(1);
  }
  const webmPath = path.join(HERO_DIR, 'c-office-hero.webm');
  fs.renameSync(path.join(HERO_DIR, newest.f), webmPath);
  console.log(`[record-hero] saved ${path.relative(PROJECT_ROOT, webmPath)}`);

  // Optional: convert to mp4 + gif if ffmpeg is on PATH.
  const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  if (!hasFfmpeg) {
    console.log('[record-hero] ffmpeg not found — skipping mp4/gif conversion');
    console.log('  install ffmpeg and re-run, or commit the .webm directly.');
    return;
  }

  const mp4Path = path.join(HERO_DIR, 'c-office-hero.mp4');
  const gifPath = path.join(HERO_DIR, 'c-office-hero.gif');

  console.log('[record-hero] converting to mp4 …');
  spawnSync('ffmpeg', ['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path], { stdio: 'inherit' });

  console.log('[record-hero] converting to gif (10fps, 720w) …');
  const palette = path.join(HERO_DIR, '.palette.png');
  spawnSync('ffmpeg', ['-y', '-i', webmPath, '-vf', 'fps=10,scale=720:-1:flags=lanczos,palettegen', palette], { stdio: 'inherit' });
  spawnSync('ffmpeg', ['-y', '-i', webmPath, '-i', palette, '-filter_complex', 'fps=10,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse', gifPath], { stdio: 'inherit' });
  try { fs.unlinkSync(palette); } catch { /* ignore */ }

  console.log(`[record-hero] saved ${path.relative(PROJECT_ROOT, mp4Path)}`);
  console.log(`[record-hero] saved ${path.relative(PROJECT_ROOT, gifPath)}`);
}

main().catch((error) => {
  console.error('[record-hero] failed:', error);
  process.exit(1);
});
