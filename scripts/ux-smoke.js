#!/usr/bin/env node
/**
 * Automated UX/UI smoke test for C-Office.
 *
 * Visits every page in the SPA, asserts V2 globals are bound, captures console
 * errors, takes screenshots, and probes a few key interactions. Run against a
 * live server on http://127.0.0.1:7878 (start with `npm run dev`).
 *
 * Usage:
 *   node scripts/ux-smoke.js
 *   BASE=http://127.0.0.1:7878 HEADLESS=1 node scripts/ux-smoke.js
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const _require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = _require('playwright'));
} catch {
  // Fall back to global npm root install (Playwright is not a project dep on purpose).
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = _require(path.join(globalRoot, 'playwright')));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const OUT_DIR    = path.join(ROOT, 'tmp', 'ux-smoke');
const BASE       = process.env.BASE || 'http://127.0.0.1:7878';
const HEADLESS   = process.env.HEADLESS !== '0';
const VIEWPORTS  = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'tablet',  width: 1024, height: 768 },
  { label: 'mobile',  width: 390,  height: 844 },
];

const PAGES = [
  { id: 'dashboard',       label: 'Dashboard'        },
  { id: 'mission-control', label: 'Mission Control'  },
  { id: 'guild',           label: 'Guild Hall'       },
  { id: 'agents',          label: 'Agents Roster'    },
  { id: 'images',          label: 'Image Studio'     },
  { id: 'tasks',           label: 'Tasks / Ops'      },
  { id: 'projects',        label: 'Projects'         },
  { id: 'skills',          label: 'Skills / Shop'    },
  { id: 'memory',          label: 'Memory'           },
  { id: 'settings',        label: 'Settings'         },
  { id: 'notes',           label: 'Notes'            },
];

const REQUIRED_GLOBALS = [
  'Sidebar', 'Dashboard', 'MissionControlPage', 'GuildHall', 'AgentsPage',
  'ImageStudioPage', 'AgentDetail', 'TasksPage', 'ProjectsPage',
  'SkillsPage', 'MemoryPanel', 'SettingsPage', 'NotesPage', 'RunDock',
  'UXTopbar',
];

const REQUIRED_ASSETS = [
  '/ux-system.css', '/ux-dashboard.css', '/ux-mission-control.css',
  '/ux-notes.css', '/ux-tasks.css', '/ux-images.css', '/ux-settings.css',
  '/ux-projects.css', '/ux-agent-detail.css',
  '/ux-components.jsx', '/ux-nav.jsx', '/ux-nav-projects.jsx',
  '/page-dashboard-v2.jsx', '/page-mission-control.jsx',
  '/page-mission-control-polish.jsx', '/page-detail-v2.jsx',
  '/page-notes-v2.jsx', '/page-tasks-v2.jsx', '/page-projects-v2.jsx',
  '/page-images-v2.jsx', '/page-settings-v2.jsx',
];

const RESULT = {
  startedAt: new Date().toISOString(),
  base: BASE,
  pages: [],
  globals: { missing: [], present: [] },
  assets: [],
  consoleByPage: {},
  interactions: [],
  errors: [],
};

const log = (...a) => console.log('[ux-smoke]', ...a);

async function ensureDir() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const v of VIEWPORTS) await mkdir(path.join(OUT_DIR, v.label), { recursive: true });
}

async function setRoute(page, routeId) {
  await page.evaluate((id) => {
    try { localStorage.setItem('c-office-page', id); } catch {}
    window.dispatchEvent(new CustomEvent('c-office:navigate', { detail: { page: id } }));
  }, routeId);
  await page.waitForTimeout(700);
}

async function snap(page, viewport, slug) {
  const file = path.join(OUT_DIR, viewport.label, `${slug}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

async function probeGlobals(page) {
  return await page.evaluate((names) => {
    const present = [];
    const missing = [];
    for (const n of names) (window[n] ? present : missing).push(n);
    return { present, missing };
  }, REQUIRED_GLOBALS);
}

async function probeAssets(page) {
  return await page.evaluate(async (paths) => {
    const results = [];
    for (const p of paths) {
      try {
        const r = await fetch(p, { method: 'GET' });
        results.push({ path: p, ok: r.ok, status: r.status, ct: r.headers.get('content-type') });
      } catch (e) { results.push({ path: p, ok: false, status: 0, error: String(e) }); }
    }
    return results;
  }, REQUIRED_ASSETS);
}

async function probeRouteShape(page, routeId) {
  return await page.evaluate((id) => {
    const screen = document.querySelector(`.app[data-screen-label="${id}"]`);
    const main   = document.querySelector('.app .main');
    const sidebar = document.querySelector('.app .sidebar, .app aside, .ux-sidebar');
    const topbar = document.querySelector('.ux-topbar, .topbar, header');
    const nodes  = main ? main.querySelectorAll('*').length : 0;
    const text   = main ? (main.innerText || '').slice(0, 600) : '';
    return { hasScreen: !!screen, hasMain: !!main, hasSidebar: !!sidebar, hasTopbar: !!topbar, mainNodeCount: nodes, mainTextHead: text };
  }, routeId);
}

async function probeInteractions(page) {
  const interactions = [];

  await setRoute(page, 'mission-control');
  await page.waitForTimeout(400);
  const mcSearch = await page.$('input[placeholder*="Search" i], input[placeholder*="ค้นหา"], .ux-search input');
  if (mcSearch) {
    await mcSearch.fill('test');
    await page.waitForTimeout(200);
    interactions.push({ name: 'mission-control.search', ok: true });
    await mcSearch.fill('');
  } else interactions.push({ name: 'mission-control.search', ok: false, note: 'no search input' });

  await setRoute(page, 'notes');
  await page.waitForTimeout(400);
  const newNoteBtn = await page.$('button:has-text("New Note"), button:has-text("เพิ่มโน้ต"), button:has-text("New note"), .ux-btn-primary');
  interactions.push({ name: 'notes.newComposerButton', ok: !!newNoteBtn });

  await setRoute(page, 'tasks');
  await page.waitForTimeout(400);
  const taskCard = await page.$('.ux-task-card-v2, .ux-task-list, .tasks-list, .task-card');
  interactions.push({ name: 'tasks.listRendered', ok: !!taskCard });

  await setRoute(page, 'projects');
  await page.waitForTimeout(400);
  const boardCols = await page.$$('.ux-board-column, .kanban-column, .board-column');
  interactions.push({ name: 'projects.boardColumns', ok: boardCols.length >= 1, count: boardCols.length });

  await setRoute(page, 'settings');
  await page.waitForTimeout(400);
  const providerCards = await page.$$('.ux-provider-card-v2, .provider-card, .ux-card, [data-provider]');
  interactions.push({ name: 'settings.providerCards', ok: providerCards.length >= 1, count: providerCards.length });

  await setRoute(page, 'images');
  await page.waitForTimeout(400);
  const promptInput = await page.$('textarea, input[placeholder*="prompt" i], input[placeholder*="คำสั่ง"]');
  interactions.push({ name: 'images.promptInput', ok: !!promptInput });

  await setRoute(page, 'dashboard');
  await page.waitForTimeout(400);
  const topbarInput = await page.$('.ux-topbar input, .topbar input, header input');
  interactions.push({ name: 'topbar.goalInput', ok: !!topbarInput });

  const sidebarEl = await page.$('.app .sidebar, .ux-sidebar, aside');
  if (sidebarEl) {
    const beforeWidth = await sidebarEl.evaluate(el => el.getBoundingClientRect().width);
    await sidebarEl.hover();
    await page.waitForTimeout(350);
    const afterWidth  = await sidebarEl.evaluate(el => el.getBoundingClientRect().width);
    interactions.push({ name: 'sidebar.hoverExpand', ok: afterWidth >= beforeWidth, beforeWidth, afterWidth });
  } else interactions.push({ name: 'sidebar.hoverExpand', ok: false, note: 'no sidebar element' });

  return interactions;
}

async function run() {
  await ensureDir();
  log('starting', { BASE, HEADLESS });

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const allConsole = [];
  page.on('console', (msg) => allConsole.push({ ts: Date.now(), route: page.__route || '?', type: msg.type(), text: msg.text().slice(0, 600) }));
  page.on('pageerror', (err) => allConsole.push({ ts: Date.now(), route: page.__route || '?', type: 'pageerror', text: String(err).slice(0, 800) }));
  page.on('requestfailed', (req) => allConsole.push({ ts: Date.now(), route: page.__route || '?', type: 'reqfail', text: `${req.failure()?.errorText || 'failed'} ${req.url()}` }));
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 400) allConsole.push({ ts: Date.now(), route: page.__route || '?', type: 'http' + s, text: `${resp.request().method()} ${resp.url()}` });
  });

  for (const vp of VIEWPORTS) {
    log('viewport', vp.label);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    if (vp === VIEWPORTS[0]) {
      try { await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }); }
      catch (e) { RESULT.errors.push({ phase: 'goto', error: String(e) }); }
      await page.waitForTimeout(1500);
      RESULT.globals = await probeGlobals(page);
      RESULT.assets  = await probeAssets(page);
    } else {
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    for (const route of PAGES) {
      page.__route = route.id;
      const before = allConsole.length;
      await setRoute(page, route.id);
      await page.waitForTimeout(800);
      const shape = await probeRouteShape(page, route.id).catch(() => null);
      const file  = await snap(page, vp, route.id);
      const consoleSlice = allConsole.slice(before);
      RESULT.pages.push({ viewport: vp.label, route: route.id, label: route.label, shape, screenshot: path.relative(ROOT, file), consoleErrors: consoleSlice.filter(c => c.type === 'error' || c.type === 'pageerror').length });
    }

    if (vp.label === 'desktop') {
      const interactions = await probeInteractions(page).catch((e) => [{ name: 'interaction.fatal', ok: false, error: String(e) }]);
      RESULT.interactions = interactions;
    }
  }

  RESULT.consoleByPage = allConsole;
  RESULT.finishedAt = new Date().toISOString();

  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(RESULT, null, 2));
  const md = renderMarkdown(RESULT);
  await writeFile(path.join(OUT_DIR, 'report.md'), md);

  await browser.close();
  log('done', path.relative(ROOT, OUT_DIR));
  console.log('\n' + md);
}

function renderMarkdown(r) {
  const lines = [];
  lines.push(`# C-Office UX/UI Smoke Report`);
  lines.push(``);
  lines.push(`- base: ${r.base}`);
  lines.push(`- started: ${r.startedAt}`);
  lines.push(`- finished: ${r.finishedAt}`);
  lines.push(``);
  lines.push(`## Required globals`);
  lines.push(`- present (${r.globals.present.length}): ${r.globals.present.join(', ')}`);
  lines.push(`- missing (${r.globals.missing.length}): ${r.globals.missing.join(', ') || '_none_'}`);
  lines.push(``);
  lines.push(`## Required assets`);
  lines.push(`| asset | status | content-type |`);
  lines.push(`| --- | --- | --- |`);
  for (const a of r.assets) lines.push(`| ${a.path} | ${a.status} | ${a.ct || ''} |`);
  lines.push(``);
  lines.push(`## Pages × viewports`);
  lines.push(`| viewport | route | hasMain | hasTopbar | hasSidebar | nodes | console errors |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const p of r.pages) {
    const s = p.shape || {};
    lines.push(`| ${p.viewport} | ${p.route} | ${!!s.hasMain} | ${!!s.hasTopbar} | ${!!s.hasSidebar} | ${s.mainNodeCount ?? ''} | ${p.consoleErrors} |`);
  }
  lines.push(``);
  lines.push(`## Interactions (desktop)`);
  lines.push(`| name | ok | extra |`);
  lines.push(`| --- | --- | --- |`);
  for (const i of r.interactions) {
    const extra = Object.entries(i).filter(([k]) => !['name','ok'].includes(k)).map(([k,v]) => `${k}=${typeof v==='string'?v:JSON.stringify(v)}`).join(' ');
    lines.push(`| ${i.name} | ${i.ok ? 'PASS' : 'FAIL'} | ${extra} |`);
  }
  lines.push(``);
  const errs = r.consoleByPage.filter(c => c.type === 'error' || c.type === 'pageerror');
  lines.push(`## Errors (${errs.length})`);
  if (!errs.length) lines.push(`_no console/page errors_`);
  for (const e of errs.slice(0, 25)) lines.push(`- [${e.route}] ${e.type}: ${e.text}`);
  return lines.join('\n');
}

run().catch((e) => { console.error(e); process.exit(1); });
