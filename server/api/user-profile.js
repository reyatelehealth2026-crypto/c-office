import {
  loadUserProfile, saveUserProfile, getProfilePath, DEFAULT_TEMPLATE,
} from '../agents/user-profile.js';

export function getUserProfile(_req, res) {
  try {
    const text = loadUserProfile();
    res.json({
      ok: true,
      text,
      path: getProfilePath(),
      defaultTemplate: DEFAULT_TEMPLATE,
      bytes: Buffer.byteLength(text, 'utf8'),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}

export async function putUserProfile(req, res) {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const info = await saveUserProfile(text);
    res.json({ ok: true, ...info });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
}
