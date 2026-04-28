#!/usr/bin/env node
// Safe deep-merge installer for ~/.claude/settings.json hooks.
// - Creates timestamped backup before write
// - Idempotent: skips entries that already point to our post-event.sh
// - Preserves existing hooks (e.g. rtk-rewrite.sh)
// - `install` adds, `uninstall` restores most recent backup

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_SCRIPT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'hooks', 'post-event.sh');
const MARK = 'c-office:post-event';   // marker we embed in hook command for detection

const EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit',
  'PreToolUse', 'PostToolUse',
  'SubagentStart', 'SubagentStop', 'Stop',
];

async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(SETTINGS, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

async function backup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dst = `${SETTINGS}.bak.${ts}`;
  try {
    await fs.copyFile(SETTINGS, dst);
    console.log(`[install-hooks] backup → ${dst}`);
    return dst;
  } catch (e) {
    if (e.code === 'ENOENT') { console.log('[install-hooks] no existing settings.json — nothing to backup'); return null; }
    throw e;
  }
}

function alreadyHasCOffice(group) {
  if (!Array.isArray(group)) return false;
  return group.some(g => Array.isArray(g.hooks) && g.hooks.some(h => typeof h.command === 'string' && h.command.includes(MARK)));
}

function makeHookEntry(eventName) {
  // matcher only meaningful for PreToolUse/PostToolUse. Use catch-all "*".
  const needsMatcher = (eventName === 'PreToolUse' || eventName === 'PostToolUse');
  const entry = {
    hooks: [{
      type: 'command',
      // embed MARK in a comment-style suffix so we can detect ourselves later
      command: `${HOOK_SCRIPT} ${eventName} # ${MARK}`,
    }],
  };
  if (needsMatcher) entry.matcher = '*';
  return entry;
}

async function install() {
  await backup();
  const cfg = await readSettings();
  cfg.hooks = cfg.hooks || {};

  let added = 0;
  for (const ev of EVENTS) {
    cfg.hooks[ev] = cfg.hooks[ev] || [];
    if (alreadyHasCOffice(cfg.hooks[ev])) continue;
    cfg.hooks[ev].push(makeHookEntry(ev));
    added++;
  }

  await fs.writeFile(SETTINGS, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`[install-hooks] added ${added} hook entries (idempotent — existing entries preserved)`);
  console.log(`[install-hooks] now restart any running Claude Code session for hooks to take effect`);
}

async function uninstall() {
  const cfg = await readSettings();
  if (!cfg.hooks) { console.log('[install-hooks] no hooks block found'); return; }
  let removed = 0;
  for (const ev of EVENTS) {
    if (!Array.isArray(cfg.hooks[ev])) continue;
    const before = cfg.hooks[ev].length;
    cfg.hooks[ev] = cfg.hooks[ev]
      .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !(typeof h.command === 'string' && h.command.includes(MARK))) }))
      .filter(g => Array.isArray(g.hooks) && g.hooks.length > 0);
    if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev];
    removed += (before - (cfg.hooks[ev]?.length || 0));
  }
  await backup();
  await fs.writeFile(SETTINGS, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`[install-hooks] removed ${removed} hook group(s) tagged ${MARK}`);
}

const cmd = process.argv[2] || 'install';
if (cmd === 'install') await install();
else if (cmd === 'uninstall') await uninstall();
else { console.error(`unknown command: ${cmd}. use 'install' or 'uninstall'`); process.exit(1); }
