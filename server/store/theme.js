import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.c-office');
const THEMES = ['anime_command', 'dark_ops', 'game_guild', 'rpg_guild'];
const DEFAULT_THEME = 'game_guild';

function themeFile() {
  return process.env.C_OFFICE_THEME_PATH || path.join(DEFAULT_DATA_DIR, 'theme.json');
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function normalize(value) {
  return THEMES.includes(value) ? value : DEFAULT_THEME;
}

function readState() {
  const file = themeFile();
  ensureDir(file);
  if (!fs.existsSync(file)) {
    const state = { theme: DEFAULT_THEME, updatedAt: Date.now() };
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    return state;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { theme: normalize(parsed.theme), updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now() };
  } catch {
    return { theme: DEFAULT_THEME, updatedAt: Date.now() };
  }
}

function writeState(state) {
  const file = themeFile();
  ensureDir(file);
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  return state;
}

export function listThemes() {
  return [...THEMES];
}

export function getThemeState() {
  return readState();
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) {
    const err = new Error(`unknown theme: ${theme}`);
    err.statusCode = 400;
    throw err;
  }
  return writeState({ theme, updatedAt: Date.now() });
}

export const themeStoreInfo = { defaultTheme: DEFAULT_THEME, themes: THEMES, get file() { return themeFile(); } };
