#!/usr/bin/env node
// Screenshot-based GIF recorder — visits every primary C-Office route,
// snaps a PNG, then stitches frames into docs/hero/c-office-pages.gif.
// More reliable than recordVideo on headless Chromium / Windows, which
// has been observed to drop frames and produce a 3-second clip for a
// 30-second tour.
//
// Usage:
//   1. (one-time) npm i -D playwright && npx playwright install chromium
//   2. (terminal 1) npm run dev
//   3. (terminal 2) node scripts/record-hero-pages.js
//
// Env:
//   COFFICE_BASE_URL  — defaults to http://127.0.0.1:7878
//   COFFICE_TOKEN     — Authorization Bearer for /access gate
//   FRAME_MS          — ms each page stays on-screen in the GIF (default 2500)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const HERO_DIR = path.join(PROJECT_ROOT, 'docs', 'hero');
const FRAMES_DIR = path.join(HERO_DIR, 'frames');

const BASE_URL = process.env.COFFICE_BASE_URL || 'http://127.0.0.1:7878';
const TOKEN = process.env.COFFICE_TOKEN || process.env.C_OFFICE_ACCESS_TOKEN || process.env.C_OFFICE_PUBLIC_TOKEN;
const FRAME_MS = Number(process.env.FRAME_MS) || 2500;

// Each entry becomes one GIF frame. The C-Office router listens to a custom
// 'c-office:navigate' event (see public/index.html line ~108) — URL hash
// changes alone don't trigger a route change, so we dispatch the event in
// the page context for every stop.
const TOUR = [
  { route: 'dashboard',       label: 'dashboard',          dwell: 1500 },
  { route: 'mission-control', label: 'mission-control',    dwell: 1500 },
  { route: 'agents',          label: 'agents-workfloor',   dwell: 1800 },
  { route: 'agents',          label: 'agents-workfloor-2', dwell: 2000 },
  { route: 'notes',           label: 'notes',              dwell: 1200 },
  { route: 'tasks',           label: 'tasks',              dwell: 1200 },
  { route: 'projects',        label: 'projects',           dwell: 1200 },
  { route: 'images',          label: 'images',             dwell: 1200 },
  { route: 'skills',          label: 'playbooks',          dwell: 1200 },
  { route: 'memory',          label: 'memory',             dwell: 1200 },
  { route: 'settings',        label: 'settings',           dwell: 1200 },
];

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('[record-pages] playwright not installed. Run: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  try {
    const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
    const res = await fetch(`${BASE_URL}/api/state`, { headers });
    if (!res.ok) throw new Error(`server returned ${res.status}`);
  } catch (error) {
    console.error(`[record-pages] cannot reach ${BASE_URL} — start \`npm run dev\` first.\n  ${error.message}`);
    process.exit(1);
  }

  fs.mkdirSync(HERO_DIR, { recursive: true });
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log(`[record-pages] launching chromium → ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    extraHTTPHeaders: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Array.isArray(window.AGENTS) && window.AGENTS.length > 0,
      { timeout: 15_000 },
    ).catch(() => { /* tolerate empty roster */ });
    await page.waitForTimeout(1_500);

    let frameIdx = 0;
    for (const stop of TOUR) {
      try {
        await page.evaluate((target) => {
          window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: target } }));
        }, stop.route);
      } catch { /* tolerate missing routes */ }
      await page.waitForTimeout(stop.dwell);
      const file = path.join(FRAMES_DIR, `${String(frameIdx).padStart(3, '0')}-${stop.label}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`[record-pages] frame ${frameIdx + 1}/${TOUR.length} → ${stop.label} (route=${stop.route})`);
      frameIdx++;
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  if (!hasFfmpeg) {
    console.error('[record-pages] ffmpeg not found on PATH — frames saved to docs/hero/frames/. Install ffmpeg to build GIF.');
    process.exit(0);
  }

  const palette = path.join(HERO_DIR, '.palette-pages.png');
  const gifPath = path.join(HERO_DIR, 'c-office-pages.gif');

  const frameFiles = fs.readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.png')).sort();
  if (frameFiles.length === 0) {
    console.error('[record-pages] no frames captured; aborting');
    process.exit(1);
  }

  const concatList = path.join(FRAMES_DIR, 'concat.txt');
  fs.writeFileSync(
    concatList,
    frameFiles
      .map((f) => `file '${path.join(FRAMES_DIR, f).replace(/\\/g, '/')}'\nduration ${(FRAME_MS / 1000).toFixed(2)}`)
      .join('\n')
      + `\nfile '${path.join(FRAMES_DIR, frameFiles[frameFiles.length - 1]).replace(/\\/g, '/')}'\n`,
    'utf8',
  );

  console.log('[record-pages] palette pass …');
  spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-vf', 'scale=960:-1:flags=lanczos,palettegen', palette], { stdio: 'inherit' });

  console.log('[record-pages] gif pass …');
  spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-i', palette, '-filter_complex', 'scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse', '-loop', '0', gifPath], { stdio: 'inherit' });

  try { fs.unlinkSync(palette); } catch { /* ignore */ }
  console.log(`[record-pages] saved ${path.relative(PROJECT_ROOT, gifPath)} (${TOUR.length} pages)`);
}

main().catch((error) => {
  console.error('[record-pages] failed:', error);
  process.exit(1);
});
