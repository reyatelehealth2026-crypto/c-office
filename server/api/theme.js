import express from 'express';
import { bus } from '../state.js';
import { getThemeState, listThemes, setTheme } from '../store/theme.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ ...getThemeState(), themes: listThemes() });
});

router.patch('/', (req, res) => {
  try {
    const next = setTheme(req.body?.theme);
    const payload = { ...next, themes: listThemes() };
    bus.emit('theme', payload);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || String(error) });
  }
});

export default router;
