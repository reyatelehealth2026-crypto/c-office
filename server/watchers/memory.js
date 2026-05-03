// Walk ~/.claude/projects/*/memory/MEMORY.md to build a knowledge graph.
// Each memory file becomes a node; project root acts as a hub.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const TYPE_COLORS = {
  user: 'pref',
  feedback: 'rule',
  project: 'project',
  reference: 'intel',
};

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0,i).trim()] = line.slice(i+1).trim();
  }
  return out;
}

export async function scanMemory() {
  const nodes = [];
  const edges = [];
  let entries = [];
  try { entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true }); } catch { return { nodes, edges }; }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const memDir = path.join(PROJECTS_DIR, ent.name, 'memory');
    let files = [];
    try { files = await fs.readdir(memDir); } catch { continue; }
    if (files.length === 0) continue;

    const projectId = `proj:${ent.name}`;
    nodes.push({
      id: projectId,
      label: ent.name.replace(/^-/, '').replace(/-/g, '/').slice(0, 32),
      cat: 'project',
      x: Math.random()*80 + 10,
      y: Math.random()*70 + 15,
      size: 16,
      agent: 'orchestra',
    });

    for (const f of files) {
      if (!f.endsWith('.md') || f === 'MEMORY.md') continue;
      const fullPath = path.join(memDir, f);
      let raw = '';
      try { raw = await fs.readFile(fullPath, 'utf8'); } catch { continue; }
      const fm = parseFrontmatter(raw);
      const id = `mem:${ent.name}:${f}`;
      nodes.push({
        id,
        label: (fm.name || f.replace(/\.md$/, '')).slice(0, 32),
        cat: TYPE_COLORS[fm.type] || 'fact',
        x: Math.random()*80 + 10,
        y: Math.random()*70 + 15,
        size: 10,
        agent: 'atlas',
      });
      edges.push([projectId, id]);
    }
  }
  return { nodes, edges };
}
