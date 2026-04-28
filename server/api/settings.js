import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

export async function getSettings(req, res) {
  try {
    const txt = await fs.readFile(SETTINGS, 'utf8');
    const j = JSON.parse(txt);
    // expose only non-secret fields
    const safe = {
      hooks: j.hooks || {},
      statusLine: j.statusLine || null,
      language: j.language,
      effortLevel: j.effortLevel,
      autoMemoryEnabled: !!j.autoMemoryEnabled,
      autoDreamEnabled:  !!j.autoDreamEnabled,
    };
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
