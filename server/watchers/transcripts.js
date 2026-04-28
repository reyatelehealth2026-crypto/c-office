import chokidar from 'chokidar';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { state, pushEvent, recordUsage, startTask, finishTask } from '../state.js';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const partialBuf = new Map();          // path → leftover string (no trailing \n yet)

function summarize(s, max = 90) {
  if (typeof s !== 'string') s = JSON.stringify(s);
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function toolUseSummary(name, input) {
  if (!input || typeof input !== 'object') return name;
  if (name === 'Bash')          return summarize(input.command || '');
  if (name === 'Edit')          return summarize(`${path.basename(input.file_path||'')} ↻`);
  if (name === 'Write')         return summarize(`${path.basename(input.file_path||'')} ✎`);
  if (name === 'Read')          return summarize(path.basename(input.file_path||''));
  if (name === 'Task')          return summarize(input.description || input.prompt || '');
  if (name === 'WebFetch')      return summarize(input.url || '');
  if (name === 'WebSearch')     return summarize(input.query || '');
  return summarize(Object.values(input)[0] || '');
}

function processLine(line, sourcePath) {
  let r;
  try { r = JSON.parse(line); } catch { return; }
  const sessionId = r.sessionId || r.session_id;
  const ts = r.timestamp ? Date.parse(r.timestamp) : Date.now();
  const model = r.model || r.message?.model;

  // Find tool_use blocks inside assistant messages
  const msg = r.message;
  const content = Array.isArray(msg?.content) ? msg.content : [];

  if (r.type === 'assistant') {
    const toolUses = content.filter(c => c?.type === 'tool_use');
    const usage    = msg?.usage;
    const msgKey   = r.uuid || r.message?.id || `${sessionId}:${ts}`;

    // Record usage once per assistant message — uuid-keyed, separate from tool_use dedupe.
    recordUsage({ model, usage, dedupeKey: `usage:${msgKey}`, sessionId });

    if (toolUses.length === 0 && (usage || msg?.content)) {
      // Plain text assistant turn
      pushEvent({
        ts, sessionId, model,
        verb: 'spoke',
        text: summarize(content.find(c => c?.type === 'text')?.text || ''),
        status: 'ok',
        dedupeKey: `say:${msgKey}`,
      });
      return;
    }

    for (const tu of toolUses) {
      const isTask = tu.name === 'Task' || tu.name === 'Agent';
      pushEvent({
        ts, sessionId, model,
        verb: 'used',
        toolName: tu.name,
        text: toolUseSummary(tu.name, tu.input),
        status: 'ok',
        toolUseId: tu.id,
        dedupeKey: `tu:${tu.id}`,
      });
      if (isTask) {
        startTask({
          tool_use_id: tu.id,
          sessionId,
          subagent_type: tu.input?.subagent_type || tu.input?.agent_type,
          description: tu.input?.description || tu.input?.prompt?.slice(0,140) || tu.name,
        });
      }
    }
    return;
  }

  if (r.type === 'user' || r.type === 'tool_result') {
    // Detect tool_result blocks (often wrapped in user records)
    const results = content.filter(c => c?.type === 'tool_result');
    for (const tr of results) {
      const isErr = !!tr.is_error;
      pushEvent({
        ts, sessionId, model,
        verb: 'result',
        text: summarize(typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content || '')),
        status: isErr ? 'err' : 'ok',
        toolUseId: tr.tool_use_id,
        dedupeKey: `tr:${tr.tool_use_id}`,
      });
      if (state.tasks.has(tr.tool_use_id)) {
        finishTask({ tool_use_id: tr.tool_use_id, status: isErr ? 'failed' : 'done' });
      }
    }
    if (r.type === 'user' && results.length === 0 && typeof msg?.content === 'string') {
      pushEvent({
        ts, sessionId, model,
        verb: 'prompt',
        text: summarize(msg.content),
        status: 'ok',
        dedupeKey: `prompt:${r.uuid || ts}`,
      });
    }
    return;
  }
}

async function handleChange(file) {
  let stat;
  try { stat = await fsp.stat(file); } catch { return; }
  let offset = state.fileOffsets.get(file) || 0;
  if (stat.size < offset) offset = 0;          // truncation guard
  if (stat.size === offset) return;

  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file, { start: offset, end: stat.size - 1, encoding: 'utf8' });
    let buf = partialBuf.get(file) || '';
    stream.on('data', chunk => buf += chunk);
    stream.on('end', () => {
      const lines = buf.split('\n');
      // last item may be incomplete — keep for next round
      partialBuf.set(file, lines.pop() || '');
      for (const line of lines) {
        if (line.trim()) processLine(line, file);
      }
      state.fileOffsets.set(file, stat.size);
      resolve();
    });
    stream.on('error', reject);
  });
}

let pending = new Map();
function debouncedHandle(file) {
  clearTimeout(pending.get(file));
  pending.set(file, setTimeout(() => {
    pending.delete(file);
    handleChange(file).catch(() => {});
  }, 80));
}

// Recursively walk a dir and return all .jsonl files with their current sizes.
async function listJsonlSizes(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try { const st = await fsp.stat(full); out.push({ file: full, size: st.size }); }
        catch { /* file vanished mid-walk */ }
      }
    }
  }
  await walk(root);
  return out;
}

export async function startTranscriptsWatcher() {
  await fsp.mkdir(PROJECTS_DIR, { recursive: true });

  // ── Skip historical replay ─────────────────────────────────────────────────
  // By default, seed file offsets to current end-of-file so the watcher only
  // emits events from NEW lines appended after server start. This prevents the
  // dashboard from being flooded with months of pre-existing transcripts.
  // Opt in to full replay with C_OFFICE_REPLAY=1.
  const replayHistory = process.env.C_OFFICE_REPLAY === '1';
  if (!replayHistory) {
    const existing = await listJsonlSizes(PROJECTS_DIR);
    for (const { file, size } of existing) state.fileOffsets.set(file, size);
    console.log(`[c-office] skipped replay: seeded offsets for ${existing.length} JSONL transcripts (set C_OFFICE_REPLAY=1 to replay)`);
  }

  // chokidar v4 dropped glob support → watch the dir recursively and filter ourselves.
  const isJsonl = f => typeof f === 'string' && f.endsWith('.jsonl');
  const watcher = chokidar.watch(PROJECTS_DIR, {
    ignoreInitial: !replayHistory,   // skip 'add' for files that exist at boot when not replaying
    persistent: true,
    awaitWriteFinish: false,
    ignored: (p, stats) => stats?.isFile() && !p.endsWith('.jsonl'),
  });
  watcher.on('add',    file => { if (isJsonl(file)) debouncedHandle(file); });
  watcher.on('change', file => { if (isJsonl(file)) debouncedHandle(file); });
  watcher.on('unlink', file => { if (isJsonl(file)) { state.fileOffsets.delete(file); partialBuf.delete(file); } });
  return watcher;
}
