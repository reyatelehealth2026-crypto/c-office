/* ===== ADVENTURE MODE PAGE ===== */

// ── Constants ──────────────────────────────────────────────────────────────────
const TOOL_MULT = {
  Read: 1.0, Edit: 2.0, Write: 2.5, Bash: 1.5,
  Task: 4.0, Agent: 4.0, Grep: 0.8, Glob: 0.6,
};

function damageOf(ev) {
  if (!ev || (ev.verb !== 'used' && ev.verb !== 'result')) return 0;
  const tok = ev.tokens ?? ((ev.usage?.input_tokens || 0) + (ev.usage?.output_tokens || 0));
  const mult = TOOL_MULT[ev.toolName] ?? 1.0;
  return Math.min(1500, Math.round(Math.sqrt(tok + 1) * 5 * mult));
}

// One strike per tool_use_id: hooks + JSONL emit both `used` and `result` with different dedupe keys.
function buildStrikes(activity, bossSince) {
  const byTool = new Map();
  const chrono = [...(activity || [])].reverse();
  for (const ev of chrono) {
    if (bossSince > 0 && ev.ts < bossSince) continue;
    if (ev.verb !== 'used' && ev.verb !== 'result') continue;
    const key = ev.toolUseId || ('ev:' + (ev.id || String(ev.ts)));
    if (!byTool.has(key)) byTool.set(key, { used: null, result: null });
    const ent = byTool.get(key);
    if (ev.verb === 'used') ent.used = ev;
    if (ev.verb === 'result') ent.result = ev;
  }
  const strikes = [];
  for (const [, ent] of byTool) {
    const dUsed = ent.used ? damageOf(ent.used) : 0;
    const dRes = ent.result ? damageOf(ent.result) : 0;
    const baseDmg = Math.max(dUsed, dRes);
    if (baseDmg <= 0) continue;
    const evPick = ent.result && dRes >= dUsed ? ent.result : (ent.used || ent.result);
    const ts = Math.max(ent.used?.ts || 0, ent.result?.ts || 0);
    strikes.push({ key: evPick.toolUseId || evPick.id, ev: evPick, baseDmg, ts });
  }
  strikes.sort((a, b) => b.ts - a.ts);
  return strikes;
}

function finalStrikeDmg(strike, weakness) {
  let d = strike.baseDmg;
  if (weakness.weak.includes(strike.ev.personaId)) d = Math.round(d * 1.5);
  return d;
}

// ATB full bar: speed 92 → ~1104ms (linear clamp; tuned once for JRPG feel).
function atbFillMs(speed) {
  const s = speed ?? 70;
  return Math.min(6000, Math.max(400, Math.round(10120 - 98 * s)));
}

const isCrit = (dmg) => dmg >= 400;

function bossTier(text) {
  const len = (text || '').length;
  if (len < 50)  return { name: 'Whisper Imp',     hp: 2000,  color: '#22d3ee' };
  if (len < 200) return { name: 'Wandering Wraith', hp: 4000,  color: '#a78bfa' };
  if (len < 500) return { name: 'Iron Tyrant',      hp: 8000,  color: '#fb7185' };
  return           { name: 'World Eater',      hp: 15000, color: '#fbbf24' };
}

// Boss weaknesses — lookup from text → personaIds that get a damage boost
// against this boss. Encourages routing the right agent at the right quest.
const WEAKNESS_RULES = [
  { match: /(bug|crash|fix|debug|error|fail|broken)/i,                 weak: ['vex', 'kai'],     element: '🛡️ Audit' },
  { match: /(write|article|blog|copy|narrative|story|doc|content)/i,    weak: ['lumen', 'astra'], element: '✍️ Word' },
  { match: /(design|ui|ux|visual|video|render|game|3d|xr)/i,            weak: ['echo'],           element: '🎨 Visual' },
  { match: /(deploy|infra|incident|ops|workflow|sprint|pipeline)/i,    weak: ['orbit'],          element: '🛰️ Ops' },
  { match: /(market|tiktok|instagram|sales|growth|seo|ad|campaign)/i,   weak: ['mira'],           element: '📈 Growth' },
  { match: /(research|trend|analy|benchmark|investig|insight)/i,        weak: ['nyx'],            element: '🔍 Intel' },
  { match: /(teach|train|course|mentor|learn|tutor)/i,                  weak: ['astra'],          element: '🎓 Sage' },
  { match: /(plan|coord|orchestrat|delegat|route)/i,                    weak: ['orchestra'],      element: '👑 Lead' },
];

function weaknessOf(text) {
  const t = (text || '').toLowerCase();
  for (const r of WEAKNESS_RULES) if (r.match.test(t)) return r;
  return { match: /./, weak: ['orchestra'], element: '✦ Generic' };
}

// ── Boss SVG — stylized 4-armed crystal wizard silhouette ────────────────────
const BossSVG = ({ color }) => (
  <svg
    viewBox="0 0 280 220"
    width="280"
    height="220"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block', filter: 'drop-shadow(0 0 18px ' + color + ')' }}
  >
    <defs>
      {/* Robe body */}
      <linearGradient id="bossRobe" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%"   stopColor="#1a1140" />
        <stop offset="100%" stopColor="#3a1a6a" />
      </linearGradient>
      {/* Central staff — prismatic */}
      <linearGradient id="bossStaff" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"   stopColor="#a78bfa" />
        <stop offset="33%"  stopColor="#22d3ee" />
        <stop offset="66%"  stopColor="#fb7185" />
        <stop offset="100%" stopColor="#fbbf24" />
      </linearGradient>
      {/* Shard fill using boss tier color */}
      <linearGradient id="bossShard" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={color} stopOpacity="0.9" />
        <stop offset="100%" stopColor={color} stopOpacity="0.3" />
      </linearGradient>
      {/* Eye glow */}
      <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor={color} stopOpacity="1"   />
        <stop offset="100%" stopColor={color} stopOpacity="0.2" />
      </radialGradient>
      {/* Ground aura */}
      <radialGradient id="auraHalo" cx="50%" cy="80%" r="55%">
        <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
        <stop offset="100%" stopColor={color} stopOpacity="0"    />
      </radialGradient>
    </defs>

    {/* Background halo glow */}
    <ellipse cx="140" cy="175" rx="110" ry="55" fill="url(#auraHalo)" />

    {/* ── Robe / body ── */}
    <path d="M100 165 L80 210 L200 210 L180 165 Z" fill="url(#bossRobe)" opacity="0.9" />
    <path d="M108 100 Q90 130 88 165 L192 165 Q190 130 172 100 Z" fill="url(#bossRobe)" />
    <ellipse cx="99"  cy="106" rx="20" ry="12" fill="#2a1555" />
    <ellipse cx="181" cy="106" rx="20" ry="12" fill="#2a1555" />
    {/* Collar accent stripe */}
    <path d="M120 108 Q140 102 160 108 L155 120 Q140 116 125 120 Z" fill={color} opacity="0.4" />

    {/* ── Head ── */}
    <ellipse cx="140" cy="82" rx="30" ry="32" fill="#1e1040" />
    <ellipse cx="140" cy="72" rx="22" ry="18" fill="#261550" opacity="0.7" />
    {/* Hood rim */}
    <path d="M112 78 Q140 58 168 78 L165 90 Q140 68 115 90 Z" fill="#3a1a6a" opacity="0.8" />

    {/* ── Glowing eye sockets ── */}
    <ellipse cx="128" cy="83" rx="9" ry="7" fill="#0a0820" />
    <ellipse cx="152" cy="83" rx="9" ry="7" fill="#0a0820" />
    <ellipse cx="128" cy="83" rx="6" ry="5" fill="url(#eyeGlow)" />
    <ellipse cx="152" cy="83" rx="6" ry="5" fill="url(#eyeGlow)" />
    <ellipse cx="128" cy="83" rx="3" ry="3" fill={color} opacity="0.9" />
    <ellipse cx="152" cy="83" rx="3" ry="3" fill={color} opacity="0.9" />

    {/* ── Four arms holding crystal shards ── */}
    {/* Upper-left */}
    <path d="M108 112 Q70 108 52 125 Q46 138 58 142"
          stroke="#3a1a6a" strokeWidth="10" strokeLinecap="round" fill="none" />
    {/* Lower-left */}
    <path d="M108 130 Q72 135 62 155 Q58 168 70 170"
          stroke="#2a1555" strokeWidth="8"  strokeLinecap="round" fill="none" />
    {/* Upper-right */}
    <path d="M172 112 Q210 108 228 125 Q234 138 222 142"
          stroke="#3a1a6a" strokeWidth="10" strokeLinecap="round" fill="none" />
    {/* Lower-right */}
    <path d="M172 130 Q208 135 218 155 Q222 168 210 170"
          stroke="#2a1555" strokeWidth="8"  strokeLinecap="round" fill="none" />

    {/* ── Crystal shards at arm tips ── */}
    <polygon points="50,125 44,110 56,108 60,128"  fill="url(#bossShard)" opacity="0.85" />
    <polygon points="50,125 40,118 45,108"          fill={color}          opacity="0.5"  />
    <polygon points="66,168 58,153 72,150 76,170"   fill="url(#bossShard)" opacity="0.75" />
    <polygon points="230,125 236,110 224,108 220,128" fill="url(#bossShard)" opacity="0.85" />
    <polygon points="230,125 240,118 235,108"         fill={color}           opacity="0.5"  />
    <polygon points="214,168 222,153 208,150 204,170" fill="url(#bossShard)" opacity="0.75" />

    {/* ── Central crystal staff ── */}
    <rect x="137" y="100" width="6" height="100" rx="3" fill="url(#bossStaff)" opacity="0.85" />
    {/* Staff top crystal spire */}
    <polygon points="140,50 130,72 140,68 150,72" fill="url(#bossStaff)" />
    <polygon points="140,50 133,70 140,65 147,70" fill={color} opacity="0.6" />
    {/* Staff orb */}
    <circle cx="140" cy="70" r="6" fill={color}  opacity="0.9" />
    <circle cx="140" cy="70" r="3" fill="#ffffff" opacity="0.7" />

    {/* ── Floating shard halo (5 shards orbiting head) ── */}
    <polygon points="108,52 102,38 112,36 116,52" fill={color} opacity="0.7" />
    <polygon points="140,32 134,18 146,18 148,34" fill={color} opacity="0.6" />
    <polygon points="172,52 168,36 178,38 178,54" fill={color} opacity="0.7" />
    <polygon points="95,66  88,54  98,52  100,66" fill={color} opacity="0.5" />
    <polygon points="185,66 182,52 192,54 192,68" fill={color} opacity="0.5" />
    {/* Orbit ring trace */}
    <ellipse cx="140" cy="56" rx="52" ry="20"
             fill="none" stroke={color} strokeWidth="1"
             strokeOpacity="0.25" strokeDasharray="4 4" />

    {/* Ground shadow */}
    <ellipse cx="140" cy="210" rx="75" ry="8" fill={color} opacity="0.12" />
  </svg>
);

// ── AdventurePage ─────────────────────────────────────────────────────────────
const AdventurePage = ({ onOpenAgent }) => {
  // Subscribe to live SSE updates — triggers re-render on each server push
  window.useCOfficeRefresh();

  // Detect reduced-motion preference once (stable across renders)
  const reducedMotion = React.useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  // ── 1. Identify Quest Boss ────────────────────────────────────────────────
  const activity = window.ACTIVITY || [];
  const agents   = window.AGENTS   || [];

  // 'prompt' = user message (set by hooks.js UserPromptSubmit + transcripts.js).
  // 'spoke' would be assistant text — wrong actor for boss identification.
  const promptEv = activity.find((e) => e.verb === 'prompt' && (e.text || '').trim());
  const bossText  = (promptEv?.text || 'The Idle Void awaits…').trim();
  const bossSince = promptEv?.ts || 0;
  const tier      = bossTier(bossText);
  const weakness  = weaknessOf(bossText);
  const bossDisplayName =
    bossText.length > 60 ? bossText.slice(0, 60) + '…' : bossText;

  const strikes = React.useMemo(
    () => buildStrikes(window.ACTIVITY || [], bossSince),
    [bossSince, (window.ACTIVITY || []).length]
  );

  const sumDamage = React.useMemo(
    () => strikes.reduce((acc, s) => acc + finalStrikeDmg(s, weakness), 0),
    [strikes, weakness]
  );

  const bossHp = Math.max(0, tier.hp - sumDamage);

  const latestTurnEnd = React.useMemo(() => {
    const arr = window.ACTIVITY || [];
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.verb === 'turn-end' && (!bossSince || e.ts >= bossSince)) return e;
    }
    return null;
  }, [bossSince, (window.ACTIVITY || []).length]);

  // ── 3. Victory overlay (2.5s, once per boss prompt) ───────────────────────
  const [showVictory, setShowVictory] = React.useState(false);
  const victoryShownForBossRef = React.useRef(null);

  React.useEffect(() => {
    victoryShownForBossRef.current = null;
  }, [bossText]);

  React.useEffect(() => {
    const hasCombat = strikes.length > 0;
    const hpWin = bossHp === 0;
    // Policy (b): Stop / turn-end shows VICTORY only after at least one strike this quest.
    const stopWin = !!(latestTurnEnd && hasCombat && bossSince && latestTurnEnd.ts >= bossSince);
    if (!hpWin && !stopWin) return;
    if (victoryShownForBossRef.current === bossText) return;
    victoryShownForBossRef.current = bossText;
    setShowVictory(true);
    fetch('/api/shop/grant-victory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tier.name }),
    }).then(() => window.fetchCOfficeShop?.()).catch(() => {});
    const t = setTimeout(() => setShowVictory(false), 2500);
    return () => clearTimeout(t);
  }, [bossHp, bossText, tier.name, latestTurnEnd?.id, strikes.length, bossSince]);

  // ── 4. Boss hit flash (250ms after a new strike) ───────────────────────────
  const [bossHit, setBossHit] = React.useState(false);
  const lastStrikeKeyRef = React.useRef(null);

  const latestStrike = strikes[0] || null;

  React.useEffect(() => {
    if (!latestStrike) return;
    if (latestStrike.key === lastStrikeKeyRef.current) return;
    lastStrikeKeyRef.current = latestStrike.key;
    if (reducedMotion) return;
    setBossHit(true);
    const t = setTimeout(() => setBossHit(false), 250);
    return () => clearTimeout(t);
  }, [latestStrike?.key, reducedMotion]);

  // ── 5. Floating damage popups ─────────────────────────────────────────────
  const [popups, setPopups] = React.useState([]);
  const seenStrikeKeysRef = React.useRef(new Set());

  React.useEffect(() => {
    seenStrikeKeysRef.current = new Set();
    lastStrikeKeyRef.current = null;
  }, [bossText]);

  // Run after every render to catch new strikes — intentionally no dep array
  React.useEffect(() => {
    if (reducedMotion) return;
    const fresh = [];
    for (let i = 0; i < strikes.length; i++) {
      const s = strikes[i];
      if (!s.key || seenStrikeKeysRef.current.has(s.key)) continue;
      const dmg = finalStrikeDmg(s, weakness);
      if (dmg <= 0) continue;
      seenStrikeKeysRef.current.add(s.key);
      fresh.push({
        key: s.key,
        dmg,
        crit: isCrit(dmg),
        x:   30 + Math.random() * 40,
      });
    }
    if (fresh.length === 0) return;
    setPopups((prev) => [...prev, ...fresh]);
    fresh.forEach((p) => {
      setTimeout(() => {
        setPopups((prev) => prev.filter((x) => x.key !== p.key));
      }, 1400);
    });
  });

  // ── 6. ATB ticker — smooth 250ms interval ────────────────────────────────
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Per-agent computed stats (hp cosmetic, mp/atb derived)
  const stats = React.useMemo(() => {
    const now = Date.now();
    const result = {};
    (window.AGENTS || []).forEach((agent) => {
      const myStrikes = strikes.filter((s) => s.ev.personaId === agent.id);
      let mpDrain = 0;
      for (const s of myStrikes) {
        if (now - s.ts > 30000) continue;
        mpDrain += Math.min(30, finalStrikeDmg(s, weakness) / 5);
      }
      const mpBase = Math.max(0, Math.min(100, 100 - mpDrain));
      const lastStrikeTs = myStrikes.reduce((m, s) => Math.max(m, s.ts || 0), 0);
      const regenSteps = lastStrikeTs ? Math.floor((now - lastStrikeTs) / 1000) : 0;
      const mp = Math.min(100, Math.round(mpBase + regenSteps));

      const lastEv = (window.ACTIVITY || []).find((ev) => ev.personaId === agent.id);
      let atb = 100;
      if (lastEv && lastEv.ts) {
        const speed = agent.personality?.speed ?? 70;
        const fillMs = atbFillMs(speed);
        atb = Math.min(100, ((now - lastEv.ts) / fillMs) * 100);
      }
      if (agent.status === 'idle' || agent.status === 'offline') {
        atb = Math.min(atb, 40);
      }

      result[agent.id] = { hp: 100, mp: Math.round(mp), atb: Math.round(atb) };
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(Date.now() / 250), (window.AGENTS || []).length, (window.ACTIVITY || []).length, strikes, weakness]);

  // ── 7. Attacking dict (flash 600ms on latest damage event) ───────────────
  const [attacking, setAttacking] = React.useState({});
  const attackTimersRef = React.useRef({});

  React.useEffect(() => {
    if (!latestStrike) return;
    const pid = latestStrike.ev.personaId;
    if (!pid) return;
    if (attackTimersRef.current[pid]) clearTimeout(attackTimersRef.current[pid]);
    setAttacking((prev) => ({ ...prev, [pid]: true }));
    attackTimersRef.current[pid] = setTimeout(() => {
      setAttacking((prev) => ({ ...prev, [pid]: false }));
    }, 600);
  }, [latestStrike?.key]);

  // Cleanup all attack timers on unmount
  React.useEffect(() => {
    return () => {
      Object.values(attackTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  // ── Derived display helpers ───────────────────────────────────────────────
  const liveAgents = agents.filter(
    (a) => a.status === 'active' || a.status === 'busy'
  ).length;

  const someoneAttacking = agents.some((a) => attacking[a.id]);

  // ── 8. Combat log — latest 14 strikes (one per tool_use) ───────────────────
  const combatLog = React.useMemo(() => {
    const agts = window.AGENTS || [];
    return strikes.slice(0, 14).map((s) => {
      const ev = s.ev;
      const dmg = finalStrikeDmg(s, weakness);
      const isWeak = weakness.weak.includes(ev.personaId);
      const agent = agts.find((a) => a.id === ev.personaId);
      return {
        id:        s.key,
        actorName: agent ? agent.name : (ev.personaId || 'Unknown'),
        action:    ev.toolName || ev.verb || '?',
        dmg,
        crit:      isCrit(dmg),
        weak:      isWeak,
      };
    });
  }, [strikes, weakness]);

  // Quest log — running tasks become active quests
  const quests = React.useMemo(() => {
    const tasks = window.TASKS || [];
    const agts  = window.AGENTS || [];
    return tasks.slice(0, 8).map(t => ({
      id: t.id,
      title: t.description || 'Unnamed quest',
      status: t.status,
      personaId: t.personaId,
      agent: agts.find(a => a.id === t.personaId),
      startedAt: t.startedAt,
      endedAt: t.endedAt,
    }));
  }, [(window.TASKS || []).length, (window.TASKS || [])[0]?.id]);

  // Quick strike — open the JRPG-style scene to dispatch this quest
  const [quickBusy, setQuickBusy] = React.useState(false);
  function quickStrike() {
    if (quickBusy) return;
    setQuickBusy(true);
    const def = window.PROVIDERS?.default || 'echo';
    const targetAgent = weakness.weak[0] || 'orchestra';
    window.openScene({
      title: bossDisplayName,
      body: bossText,
      message: bossText,
      tag: 'task',
      agentId: targetAgent,
      provider: def,
    });
    setQuickBusy(false);
  }

  const questQueue = (window.NOTES || []).slice(0, 5);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="adv-stage">

      {/* ── Topbar (minimal battle HUD; dispatch under “More”) ── */}
      <div className="topbar">
        <div>
          <h1>Adventure <span className="accent">Mode</span></h1>
          <div className="sub">
            Quest active &middot; Tier {tier.name} &middot; {liveAgents} party members
          </div>
        </div>
        <div className="topbar-actions">
          <span className="chip"><span className="dot"/> battle live</span>
        </div>
      </div>

      {/* ── Boss Zone ── */}
      <div className={'adv-boss-zone' + (bossHit ? ' is-hit' : '')}>
        <div className="adv-boss-portrait">
          <div className="adv-boss-aura" style={{'--aura-color': tier.color}}/>
          <div className="adv-boss-svg-wrap">
            <BossSVG color={tier.color}/>
          </div>
          {bossHit && <div className="adv-boss-flash"/>}
        </div>

        <div className="adv-boss-meta">
          <div className="adv-boss-tier">&#x2694; {tier.name}</div>
          <div className="adv-boss-name">{bossDisplayName}</div>
          <div className="adv-boss-hp">
            <div
              className="adv-boss-hp-fill"
              style={{width: ((bossHp / tier.hp) * 100) + '%'}}
            />
            <div className="adv-boss-hp-label">
              HP {bossHp.toLocaleString()} / {tier.hp.toLocaleString()}
            </div>
          </div>
          <div className="adv-boss-status">
            {bossHp === 0
              ? 'DEFEATED'
              : someoneAttacking
              ? 'INCOMING ATTACK'
              : 'AWAITING ACTION'}
          </div>
        </div>
      </div>

      {/* ── FX Layer — floating damage numbers ── */}
      <div className="adv-fx-layer">
        {popups.map((p) => (
          <span
            key={p.key}
            className={'adv-damage-pop' + (p.crit ? ' is-crit' : '')}
            style={{left: p.x + '%'}}
          >
            {p.crit ? 'CRIT! ' : ''}-{p.dmg}
          </span>
        ))}
      </div>

      {/* ── Bottom Section ── */}
      <div className="adv-bottom">

        {/* Combat Log */}
        <div className="adv-combat-log panel">
          <div className="panel-head">
            <h3>Combat Log</h3>
            <div className="right">last 14 hits</div>
          </div>
          {combatLog.length === 0 && (
            <div className="muted" style={{fontSize: 12, padding: '20px 0'}}>
              No actions yet &mdash; boss awaits the first strike.
            </div>
          )}
          {combatLog.map((row) => (
            <div key={row.id} className="adv-log-row">
              <span className="adv-log-actor">{row.actorName}</span>
              <span className="adv-log-action">
                cast {row.action}
                {row.weak && <span className="adv-log-weak"> ✦ weakness</span>}
              </span>
              <span className={'adv-log-damage' + (row.crit ? ' is-crit' : '') + (row.weak ? ' is-weak' : '')}>
                &minus;{row.dmg}
              </span>
            </div>
          ))}
        </div>

        {/* Party Panel */}
        <div className="adv-party-panel panel">
          <div className="panel-head">
            <h3>Party</h3>
            <div className="right">{liveAgents} active</div>
          </div>
          {agents.map((a) => {
            const partyState =
              a.status === 'busy'    ? 'busy'    :
              a.status === 'offline' ? 'offline' :
              a.status === 'idle'    ? 'idle'    :
              'active';
            const agentStats = stats[a.id] || {hp: 100, mp: 100, atb: 0};
            const isAttacking = !!attacking[a.id];

            return (
              <div
                key={a.id}
                className={'adv-party-row state-' + partyState + (isAttacking ? ' is-attacking' : '')}
                onClick={() => onOpenAgent && onOpenAgent(a.id)}
              >
                {a.image
                  ? <img className="adv-party-portrait" src={a.image} alt={a.name}/>
                  : <div
                      className="adv-party-portrait"
                      style={{
                        background: a.gradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                      }}
                    >{a.avatarInitials}</div>
                }

                <div className="adv-party-info">
                  <div className="adv-party-name">
                    {a.name} <span className="adv-party-lvl">Lv.{a.level}</span>
                  </div>
                  <div className="adv-bars">
                    <div className="adv-mini-bar kind-hp">
                      <div className="adv-mini-fill" style={{width: agentStats.hp + '%'}}/>
                      <span className="adv-mini-label">HP</span>
                    </div>
                    <div className="adv-mini-bar kind-mp">
                      <div className="adv-mini-fill" style={{width: agentStats.mp + '%'}}/>
                      <span className="adv-mini-label">MP</span>
                    </div>
                    <div className="adv-mini-bar kind-atb">
                      <div className="adv-mini-fill" style={{width: agentStats.atb + '%'}}/>
                      <span className="adv-mini-label">ATB</span>
                    </div>
                  </div>
                </div>

                <div className="adv-party-action">
                  {isAttacking ? '⚔' : partyState === 'busy' ? '✦' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <details className="adv-details panel">
        <summary className="adv-details-summary">
          More — dispatch, weaknesses &amp; quests
        </summary>
        <div className="adv-details-body">
          <div className="adv-weakness-row" style={{ marginBottom: 12 }}>
            <span className="adv-weakness-label">Weak to</span>
            <span className="adv-weakness-tag">{weakness.element}</span>
            <span className="adv-weakness-list">
              {weakness.weak.map((id) => {
                const a = agents.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <span key={id} className="adv-weakness-agent" onClick={() => onOpenAgent && onOpenAgent(id)}>
                    {a.name}
                  </span>
                );
              })}
            </span>
            <span className="mono-s" style={{ marginLeft: 'auto' }}>×1.5 dmg bonus</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <button
              className="btn primary"
              onClick={quickStrike}
              disabled={quickBusy || bossHp === 0}
              title={'Dispatch ' + (weakness.weak[0] || 'orchestra') + ' against this quest'}
            >
              {quickBusy ? 'Striking…' : '⚔ Quick Strike'}
            </button>
          </div>
          {questQueue.length > 0 && (
            <div className="adv-quest-board" style={{ marginBottom: 16 }}>
              <div className="panel-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <h3>Quest Queue</h3>
                <div className="right">จากโน้ตสั่งงาน</div>
              </div>
              <div className="adv-quest-list">
                {questQueue.map((q) => {
                  const ag = agents.find((a) => a.id === (q.agentId || q.personaId));
                  return (
                    <div key={q.id} className={'adv-quest-card state-' + q.status}>
                      <AgentDot agent={ag} size={30}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="adv-quest-title">{q.title}</div>
                        <div className="mono-s">{ag?.name || 'ยังไม่เลือก'} · {q.tag || 'task'} · {q.status}</div>
                      </div>
                      <span className="badge gold">{(q.messages || []).length} แชท</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="adv-quest-log">
            <div className="panel-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <h3>Quest Log</h3>
              <div className="right">{quests.length} active · last 8</div>
            </div>
            {quests.length === 0 && (
              <div className="muted" style={{ fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                No quests yet. Use <b>Command Bar</b> on the dashboard or <b>Quick Strike</b> here to dispatch one.
              </div>
            )}
            {quests.map((q) => {
              const elapsed = (q.endedAt || Date.now()) - (q.startedAt || Date.now());
              const mins = Math.max(0, Math.floor(elapsed / 1000));
              return (
                <div
                  key={q.id}
                  className={'adv-quest-row state-' + q.status}
                  onClick={() => q.agent && onOpenAgent && onOpenAgent(q.agent.id)}
                >
                  <span className={'adv-quest-state state-' + q.status}>{q.status}</span>
                  <div className="adv-quest-info">
                    <div className="adv-quest-title">{q.title}</div>
                    <div className="adv-quest-meta">
                      {q.agent && <span><AgentDot agent={q.agent} size={16}/> {q.agent.name}</span>}
                      <span className="mono-s">{mins}s</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </details>

      {/* ── Victory Overlay ── */}
      {showVictory && (
        <div className="adv-victory">
          <div className="adv-victory-banner">VICTORY!</div>
          <div className="adv-victory-exp">+{Math.round(tier.hp / 10)} EXP</div>
        </div>
      )}

    </div>
  );
};

Object.assign(window, { AdventurePage });
