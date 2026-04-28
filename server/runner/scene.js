// Turn a raw provider response into a structured "scene script":
//   intro      → player greets the agent ("Agent X, ภารกิจของคุณ...")
//   acknowledge→ agent stays in-character ("เข้าใจ — ผมจะ...")
//   strategy   → 1-3 in-character beats describing the plan
//   action     → agent narrates what they did (verbs from the response)
//   reply      → final reply, condensed into 1-2 dialogue lines
//   outro      → player closes the scene
//
// Each beat: { speaker: 'player'|'agent'|'system', text, mood?, emoji? }
// Frontend renders these one at a time in a JRPG dialogue box.

const PERSONA_VOICE = {
  orchestra: {
    intro:      'Maestro takes the podium. The crew falls silent.',
    ack:        ['Understood. I\'ll route this through the right hands.', 'Leave it to the Maestro — I\'ll keep everyone in tempo.'],
    moodBusy:   'Composing the score…',
    sigil:      '👑',
  },
  astra: {
    intro:      'Aira opens her tome with a warm smile.',
    ack:        ['I\'ll structure this so it\'s easy to learn.', 'Let me build the path — step by step.'],
    moodBusy:   'Drafting the curriculum…',
    sigil:      '🎓',
  },
  lumen: {
    intro:      'Luna dips her crystal quill in starlight ink.',
    ack:        ['I\'ll find the words for it.', 'Watch — I\'ll make them feel it.'],
    moodBusy:   'Spinning the prose…',
    sigil:      '✍️',
  },
  vex: {
    intro:      'Vivi cracks her knuckles, eyes already scanning.',
    ack:        ['Don\'t waste my time. Let\'s find what\'s broken.', 'I\'ll tear this apart and tell you what bleeds.'],
    moodBusy:   'Auditing every line…',
    sigil:      '🛡️',
  },
  kai: {
    intro:      'Kira draws a runic dagger — sigils crackling.',
    ack:        ['On it. Ship-mode engaged.', 'I\'ll forge this — give me the spec.'],
    moodBusy:   'Compiling the spell…',
    sigil:      '🔨',
  },
  mira: {
    intro:      'Miku flips her teal mic, lights pop on.',
    ack:        ['Show time! I\'ll make this trend.', 'Gonna be a vibe — trust me.'],
    moodBusy:   'Crafting the hook…',
    sigil:      '📈',
  },
  echo: {
    intro:      'Emi notches her bow, framing the shot.',
    ack:        ['I see the composition. Hold still.', 'Quietly, then — I\'ll make it beautiful.'],
    moodBusy:   'Sketching frames…',
    sigil:      '🎨',
  },
  nyx: {
    intro:      'Nana tilts her magnifier, runes spin.',
    ack:        ['Let me see the data first. No guesses.', 'Patterns rising — give me a moment.'],
    moodBusy:   'Cross-referencing sources…',
    sigil:      '🔍',
  },
  orbit: {
    intro:      'Ori unfurls the scrolled deploy plan.',
    ack:        ['Roger. I\'ll keep the pipes flowing.', 'I\'ve got it — relax, the lights stay on.'],
    moodBusy:   'Coordinating the runbook…',
    sigil:      '🛰️',
  },
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Strip the echo provider's templated header so the user sees pure "reply".
// Echo output begins with: 「Name」 received your task: ...
// followed by the prompt we built. We extract everything AFTER the section
// titled "## Your reply ..." OR — if absent — keep only the last paragraph.
function extractReply(raw, providerName) {
  if (!raw) return '';
  let t = String(raw).trim();
  // Remove our prompt-template echo if present
  const replyMarker = /## Your reply[^\n]*\n+/i;
  const m = t.match(replyMarker);
  if (m) t = t.slice(m.index + m[0].length).trim();
  // Drop the echo footer reminder if present
  t = t.replace(/\(echo provider —[^)]*\)\s*$/i, '').trim();
  // Drop the "received your task" preamble if echo
  t = t.replace(/^「[^」]+」\s*received your task:[\s\S]*?\n\n/, '').trim();
  return t;
}

// Cut a long string into 1–3 dialogue chunks at sentence boundaries.
function chunkLines(text, maxChunks = 3, maxLen = 180) {
  if (!text) return [];
  const norm = text.replace(/\s+/g, ' ').trim();
  if (!norm) return [];
  const sentences = norm.match(/[^.!?。!?…]+[.!?。!?…]+|[^.!?。!?…]+$/g) || [norm];
  const out = [];
  let buf = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((buf + ' ' + piece).trim().length > maxLen && buf) {
      out.push(buf.trim());
      buf = piece;
    } else {
      buf = (buf ? buf + ' ' : '') + piece;
    }
    if (out.length >= maxChunks - 1) break;
  }
  if (buf) out.push(buf.trim());
  return out.slice(0, maxChunks);
}

// Build a beat script from the dispatch context + the (possibly raw) reply.
export function buildSceneScript({
  persona,
  note,
  userMessage,
  providerName,
  rawOutput,
  ok,
}) {
  const voice  = PERSONA_VOICE[persona?.id] || PERSONA_VOICE.orchestra;
  const name   = persona?.name || 'Agent';
  const role   = persona?.role || '';
  const reply  = extractReply(rawOutput || '', providerName);
  const replyLines = reply ? chunkLines(reply, 3, 200) : [];

  const beats = [];

  // Player intro — frame the mission
  const userPrompt = (userMessage || note.title || note.body || '').trim();
  beats.push({
    speaker: 'system',
    text: `Mission Brief — ${note.title || 'Untitled'}`,
    mood: 'mission',
  });
  beats.push({
    speaker: 'player',
    text: `เอเจนต์ ${name}, นี่คือภารกิจของคุณ:\n${userPrompt || note.body || '(ไม่มีรายละเอียด)'}`,
  });

  // Agent enters
  beats.push({
    speaker: 'system',
    text: voice.intro,
    mood: 'enter',
  });
  beats.push({
    speaker: 'agent',
    text: pick(voice.ack),
    mood: 'ack',
  });

  // Strategy / busy
  beats.push({
    speaker: 'agent',
    text: voice.moodBusy,
    mood: 'busy',
  });

  // Reply lines (in-character delivery)
  if (replyLines.length > 0) {
    for (const line of replyLines) {
      beats.push({ speaker: 'agent', text: line, mood: 'reply' });
    }
  } else if (!ok) {
    beats.push({
      speaker: 'agent',
      text: 'Hmm — I hit a wall. Try a different CLI provider, or rephrase the brief.',
      mood: 'fail',
    });
  } else {
    beats.push({
      speaker: 'agent',
      text: '(silence — the dispatch produced no readable reply.)',
      mood: 'fail',
    });
  }

  // Outro
  beats.push({
    speaker: ok ? 'agent' : 'agent',
    text: ok
      ? `${voice.sigil} Mission ${name === 'Vivi' ? 'audited' : 'complete'}. Ping me again whenever you need.`
      : `${voice.sigil} I\'ll regroup. Re-dispatch when ready.`,
    mood: ok ? 'win' : 'fail',
  });
  beats.push({
    speaker: 'system',
    text: ok ? '— Scene cleared —' : '— Scene paused —',
    mood: 'finale',
  });

  return {
    persona: persona ? {
      id: persona.id, name: persona.name, role: persona.role,
      image: persona.image, gradient: persona.gradient,
      tagline: persona.tagline, tone: persona.tone, sigil: voice.sigil,
      rarity: persona.rarity,
    } : null,
    note: {
      id: note.id, title: note.title, body: note.body, tag: note.tag,
    },
    userMessage: userPrompt,
    beats,
    provider: providerName,
    ok,
    rawOutput: rawOutput || '',
  };
}
