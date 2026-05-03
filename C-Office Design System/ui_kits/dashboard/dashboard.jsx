/* C-Office UI Kit — Dashboard Page (Agentic Edition) */

/* CSS animations injected into head */
const agenticCSS = document.createElement('style');
agenticCSS.textContent = `
@keyframes agThink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
@keyframes agPulse { 0%,100%{box-shadow:0 0 0 0 var(--ac)} 50%{box-shadow:0 0 0 6px transparent} }
@keyframes agScan { from{transform:translateX(-100%)} to{transform:translateX(100%)} }
.ag-thinking span{animation:agThink 1.2s ease-in-out infinite}
.ag-thinking span:nth-child(2){animation-delay:.15s}
.ag-thinking span:nth-child(3){animation-delay:.3s}
.ag-busy-ring{animation:agPulse 2s ease-in-out infinite}
.ag-scan-line{position:absolute;bottom:0;left:0;right:0;height:2px;overflow:hidden}
.ag-scan-line::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,var(--ac),transparent);animation:agScan 2s linear infinite}
`;
document.head.appendChild(agenticCSS);

const KitTopbar = ({ page }) => {
  const meta = {
    dashboard:{ title:'Dashboard', kicker:'Command Deck' },
    'mission-control':{ title:'Mission Control', kicker:'Event Stream' },
    agents:{ title:'Agents', kicker:'Roster' },
    notes:{ title:'Notes', kicker:'Work Inbox' },
    tasks:{ title:'Tasks', kicker:'Atlas Runs' },
    images:{ title:'Images', kicker:'Studio' },
    skills:{ title:'Playbooks', kicker:'Skills' },
    memory:{ title:'Archive', kicker:'Memory' },
    settings:{ title:'Settings', kicker:'Control Room' },
  }[page] || { title:'Dashboard', kicker:'Command Deck' };

  const busy = PERSONAS.filter(a=>a.status==='busy').length;
  const online = PERSONAS.filter(a=>['busy','active'].includes(a.status)).length;

  return React.createElement('header', { style:{
    position:'sticky', top:0, zIndex:15, display:'grid',
    gridTemplateColumns:'minmax(220px,1fr) minmax(320px,560px) auto',
    gap:16, alignItems:'center', padding:'14px 28px',
    background:'#161938', borderBottom:'2px solid #2a2d5a',
  } },
    React.createElement('div', {},
      React.createElement('div', { style:{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:3, font:'800 10px var(--font-mono)', letterSpacing:'0.18em', textTransform:'uppercase', color:'#22d3ee' } },
        React.createElement('span', { style:{ width:7, height:7, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 12px #34d399' } }),
        meta.kicker,
      ),
      React.createElement('div', { style:{ font:'750 clamp(18px,2vw,24px) var(--font-display)', letterSpacing:'-0.02em', color:'#fff' } }, meta.title),
    ),
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, padding:6, border:'2px solid #2a2d5a', borderRadius:14, background:'#1a1d42' } },
      React.createElement('input', { placeholder:'Send a mission to Atlas...', readOnly:true, style:{ border:0, outline:'none', background:'transparent', color:'#f8fafc', padding:'8px 10px', font:'500 13px var(--font-body)' } }),
      React.createElement('button', { style:{ border:0, borderRadius:10, padding:'8px 14px', color:'#080a14', cursor:'pointer', font:'800 11px var(--font-mono)', letterSpacing:'0.08em', textTransform:'uppercase', background:'linear-gradient(135deg,#22d3ee,#9d5cff)' } }, 'Launch'),
    ),
    React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:8, flexWrap:'wrap' } },
      React.createElement(KitStatusChip, { label:`${busy} busy`, state:'busy' }),
      React.createElement(KitStatusChip, { label:`${online} online`, state:'active' }),
      React.createElement(KitStatusChip, { label:'1 run', state:'busy' }),
    ),
  );
};

/* Agentic card — shows what the agent is DOING right now */
const AgenticCard = ({ agent, onClick }) => {
  const isBusy = agent.status === 'busy';
  const isActive = agent.status === 'active';
  const borderColor = isBusy ? '#fbbf24' : isActive ? '#34d399' : agent.status === 'offline' ? '#334155' : '#2a2d5a';
  
  const TASKS = {
    atlas: { tool:'Agent', detail:'Delegating to Vector: deploy landing page', progress:45 },
    kai: { tool:'Edit', detail:'server/api/hooks.js — rate limiter', progress:72 },
    mira: { tool:'Read', detail:'analytics/dashboard-metrics-Q2.json', progress:30 },
    astra: { tool:'Write', detail:'curriculum/onboarding-v3-outline.md', progress:88 },
    nyx: { tool:'Bash', detail:'npm test — watching for regressions', progress:55 },
  };
  const task = TASKS[agent.id];

  return React.createElement('button', {
    onClick,
    style:{ all:'unset', display:'flex', flexDirection:'column', gap:0, borderRadius:10, border:`2px solid ${borderColor}`, background:'#1a1d42', cursor:'pointer', overflow:'hidden', width:'100%', position:'relative', transition:'transform 180ms, border-color 180ms', textAlign:'left' },
    onMouseEnter: e => { e.currentTarget.style.transform='translateY(-3px)' },
    onMouseLeave: e => { e.currentTarget.style.transform='none' },
  },
    // Top row — avatar + name + status
    React.createElement('div', { style:{ display:'flex', gap:12, alignItems:'center', padding:'12px 14px' } },
      // Avatar with status ring
      React.createElement('div', { style:{ position:'relative', flexShrink:0 } },
        React.createElement('img', { src:agent.image, alt:agent.name, style:{ width:44, height:44, borderRadius:10, objectFit:'cover', objectPosition:'center top', border:`2px solid ${borderColor}` } }),
        isBusy && React.createElement('div', { className:'ag-busy-ring', style:{ '--ac':borderColor, position:'absolute', inset:-3, borderRadius:13, border:`2px solid ${borderColor}`, pointerEvents:'none' } }),
        React.createElement('div', { style:{ position:'absolute', bottom:-2, right:-2, width:12, height:12, borderRadius:'50%', background: isBusy ? '#fbbf24' : isActive ? '#34d399' : '#64748b', border:'2px solid #1a1d42' } }),
      ),
      React.createElement('div', { style:{ flex:1, minWidth:0 } },
        React.createElement('div', { style:{ font:'700 14px var(--font-display)', color:'#fff' } }, agent.name),
        React.createElement('div', { style:{ font:'500 10px var(--font-mono)', color:'#a0a3c0', letterSpacing:'0.04em' } }, agent.role),
      ),
      React.createElement('div', { style:{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 } },
        React.createElement('span', { style:{ font:'800 10px var(--font-mono)', color: isBusy ? '#fbbf24' : isActive ? '#34d399' : '#64748b', letterSpacing:'0.08em', textTransform:'uppercase' } }, isBusy ? 'WORKING' : isActive ? 'ONLINE' : agent.status === 'offline' ? 'OFFLINE' : 'IDLE'),
        React.createElement('span', { style:{ font:'600 9px var(--font-mono)', color:'#6f739b' } }, `Lv.${agent.level}`),
      ),
    ),
    // Task section — only for busy/active agents
    (isBusy || isActive) && task && React.createElement('div', { style:{ padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:6 } },
      // Current tool use
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:8 } },
        React.createElement('span', { style:{ font:'800 9px var(--font-mono)', color:'#22d3ee', padding:'2px 6px', background:'rgba(34,211,238,0.15)', border:'1px solid rgba(34,211,238,0.3)', borderRadius:4, letterSpacing:'0.06em' } }, task.tool),
        React.createElement('span', { style:{ font:'500 11px var(--font-body)', color:'#cbd5e1', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 } }, task.detail),
      ),
      // Progress bar
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:8 } },
        React.createElement('div', { style:{ flex:1, height:4, borderRadius:999, background:'#252850', overflow:'hidden' } },
          React.createElement('span', { style:{ display:'block', height:'100%', borderRadius:999, width:`${task.progress}%`, background: isBusy ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : '#34d399' } }),
        ),
        React.createElement('span', { style:{ font:'700 9px var(--font-mono)', color:'#6f739b' } }, `${task.progress}%`),
      ),
      // Thinking dots for busy
      isBusy && React.createElement('div', { className:'ag-thinking', style:{ display:'flex', gap:3, marginTop:2 } },
        React.createElement('span', { style:{ width:4, height:4, borderRadius:'50%', background:'#fbbf24' } }),
        React.createElement('span', { style:{ width:4, height:4, borderRadius:'50%', background:'#fbbf24' } }),
        React.createElement('span', { style:{ width:4, height:4, borderRadius:'50%', background:'#fbbf24' } }),
      ),
    ),
    // Idle message
    !isBusy && !isActive && React.createElement('div', { style:{ padding:'0 14px 12px' } },
      React.createElement('span', { style:{ font:'400 11px var(--font-body)', color:'#526072' } }, agent.tagline),
    ),
    // Scan line for busy
    isBusy && React.createElement('div', { className:'ag-scan-line', style:{ '--ac': borderColor } }),
  );
};

/* Active Mission panel */
const ActiveMission = () => {
  const orch = PERSONAS.find(a=>a.id==='atlas');
  const kira = PERSONAS.find(a=>a.id==='vector');
  const steps = [
    { agent:orch, action:'Received goal', detail:'"Deploy landing page v2 with updated copy"', done:true, time:'2m ago' },
    { agent:orch, action:'Decomposed into 3 subtasks', detail:'copy update → code deploy → security audit', done:true, time:'1m ago' },
    { agent:kira, action:'Edit', detail:'public/index.html — updating hero section copy', done:false, time:'28s ago' },
  ];
  return React.createElement('section', { style:{ padding:18, border:'2px solid #fbbf24', borderRadius:12, background:'#1a1d42', position:'relative', overflow:'hidden' } },
    React.createElement('div', { className:'ag-scan-line', style:{ '--ac':'#fbbf24' } }),
    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:10 } },
        React.createElement('img', { src:orch.image, style:{ width:32, height:32, borderRadius:8, objectFit:'cover', objectPosition:'center top', border:'2px solid #fbbf24' } }),
        React.createElement('div', {},
          React.createElement('div', { style:{ font:'800 14px var(--font-display)', color:'#fff' } }, 'Active Mission'),
          React.createElement('div', { style:{ font:'600 10px var(--font-mono)', color:'#fbbf24', letterSpacing:'0.08em', textTransform:'uppercase' } }, 'Atlas conducting'),
        ),
      ),
      React.createElement('div', { className:'ag-thinking', style:{ display:'flex', gap:3 } },
        React.createElement('span', { style:{ width:5, height:5, borderRadius:'50%', background:'#fbbf24' } }),
        React.createElement('span', { style:{ width:5, height:5, borderRadius:'50%', background:'#fbbf24' } }),
        React.createElement('span', { style:{ width:5, height:5, borderRadius:'50%', background:'#fbbf24' } }),
      ),
    ),
    // Steps timeline
    React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:0 } },
      ...steps.map((s,i) => React.createElement('div', { key:i, style:{ display:'flex', gap:12, padding:'8px 0', position:'relative' } },
        // Timeline line
        React.createElement('div', { style:{ display:'flex', flexDirection:'column', alignItems:'center', width:24, flexShrink:0 } },
          React.createElement('div', { style:{ width:10, height:10, borderRadius:'50%', background: s.done ? '#34d399' : '#fbbf24', border: s.done ? 'none' : '2px solid #fbbf24', flexShrink:0 } }),
          i < steps.length-1 && React.createElement('div', { style:{ width:2, flex:1, background: s.done ? '#34d399' : '#2a2d5a', marginTop:2 } }),
        ),
        React.createElement('div', { style:{ flex:1, paddingBottom:8 } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:6, marginBottom:2 } },
            React.createElement('img', { src:s.agent.image, style:{ width:18, height:18, borderRadius:4, objectFit:'cover', objectPosition:'center top' } }),
            React.createElement('span', { style:{ font:'700 12px var(--font-body)', color:'#fff' } }, s.agent.name),
            React.createElement('span', { style:{ font:'800 9px var(--font-mono)', color: s.done ? '#34d399' : '#fbbf24', padding:'1px 5px', background: s.done ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)', borderRadius:3, letterSpacing:'0.06em' } }, s.action),
            React.createElement('span', { style:{ font:'500 9px var(--font-mono)', color:'#526072', marginLeft:'auto' } }, s.time),
          ),
          React.createElement('div', { style:{ font:'400 11px var(--font-body)', color:'#a0a3c0' } }, s.detail),
        ),
      )),
    ),
  );
};

/* Live feed with agent avatars */
const MOCK_FEED = [
  { agent:'atlas', tool:'Agent', title:'Delegating to Vector: deploy landing page v2', time:'12s ago' },
  { agent:'vector', tool:'Edit', title:'server/api/hooks.js — added rate limiter middleware', time:'28s ago' },
  { agent:'pulse', tool:'Read', title:'analytics/dashboard-metrics-Q2.json — 42 rows', time:'1m ago' },
  { agent:'oracle', tool:'Write', title:'curriculum/onboarding-v3-outline.md — 2,400 tokens', time:'3m ago' },
  { agent:'scout', tool:'Bash', title:'npm test — 14 passed, 0 failed', time:'5m ago' },
  { agent:'vector', tool:'Read', title:'package.json — checking dependencies', time:'8m ago' },
];

const KitDashboard = ({ onOpenAgent }) => {
  const busy = PERSONAS.filter(a=>a.status==='busy').length;
  const online = PERSONAS.filter(a=>['busy','active'].includes(a.status)).length;

  return React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:18 } },
    // Active mission (top priority)
    React.createElement(ActiveMission),

    // Metrics row
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 } },
      React.createElement(KitMetricCard, { label:'Agents working', value:String(busy), note:`${online} online total`, color:'#fbbf24' }),
      React.createElement(KitMetricCard, { label:'Active runs', value:'1', note:'3 completed today', color:'#22d3ee' }),
      React.createElement(KitMetricCard, { label:'Tool calls', value:'147', note:'last 30 minutes', color:'#9d5cff' }),
      React.createElement(KitMetricCard, { label:'Tokens used', value:'24.1K', note:'$0.48 spent today', color:'#34d399' }),
    ),

    // Agent roster — agentic cards
    React.createElement('section', { style:{ padding:18, border:'2px solid #2a2d5a', borderRadius:12, background:'#161938' } },
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 } },
        React.createElement('div', {},
          React.createElement('h3', { style:{ font:'800 16px var(--font-display)', color:'#fff' } }, 'Agent Status Board'),
          React.createElement('div', { style:{ font:'500 11px var(--font-body)', color:'#7f8da3', marginTop:2 } }, `${busy} working · ${online - busy} standby · ${9 - online} offline`),
        ),
        React.createElement('div', { style:{ display:'flex', gap:6 } },
          React.createElement('span', { style:{ font:'800 9px var(--font-mono)', color:'#fbbf24', padding:'4px 8px', background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:6, letterSpacing:'0.06em' } }, `${busy} WORKING`),
          React.createElement('span', { style:{ font:'800 9px var(--font-mono)', color:'#34d399', padding:'4px 8px', background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', borderRadius:6, letterSpacing:'0.06em' } }, `${online-busy} READY`),
        ),
      ),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:10 } },
        ...PERSONAS.map(a => React.createElement(AgenticCard, { key:a.id, agent:a, onClick:()=>onOpenAgent?.(a.id) })),
      ),
    ),

    // Live activity feed with avatars and tool badges
    React.createElement('section', { style:{ padding:18, border:'2px solid #2a2d5a', borderRadius:12, background:'#161938' } },
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 } },
        React.createElement('h3', { style:{ font:'800 16px var(--font-display)', color:'#fff' } }, 'Live Activity Stream'),
        React.createElement('div', { className:'ag-thinking', style:{ display:'flex', alignItems:'center', gap:3 } },
          React.createElement('span', { style:{ font:'700 10px var(--font-mono)', color:'#34d399', marginRight:6 } }, 'LIVE'),
          React.createElement('span', { style:{ width:4, height:4, borderRadius:'50%', background:'#34d399' } }),
          React.createElement('span', { style:{ width:4, height:4, borderRadius:'50%', background:'#34d399' } }),
          React.createElement('span', { style:{ width:4, height:4, borderRadius:'50%', background:'#34d399' } }),
        ),
      ),
      React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:6 } },
        ...MOCK_FEED.map((ev,i) => {
          const agent = PERSONAS.find(a=>a.id===ev.agent);
          return React.createElement('div', { key:i, style:{ display:'flex', gap:12, padding:'10px 12px', borderRadius:8, background: i===0 ? 'rgba(251,191,36,0.06)' : 'transparent', border: i===0 ? '1px solid rgba(251,191,36,0.15)' : '1px solid transparent' } },
            React.createElement('img', { src:agent?.image, style:{ width:32, height:32, borderRadius:8, objectFit:'cover', objectPosition:'center top', flexShrink:0, border: i===0 ? '1px solid #fbbf24' : '1px solid #2a2d5a' } }),
            React.createElement('div', { style:{ flex:1, minWidth:0 } },
              React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:6, marginBottom:2 } },
                React.createElement('span', { style:{ font:'700 12px var(--font-body)', color:'#fff' } }, agent?.name),
                React.createElement('span', { style:{ font:'800 8px var(--font-mono)', color:'#22d3ee', padding:'1px 5px', background:'rgba(34,211,238,0.12)', border:'1px solid rgba(34,211,238,0.25)', borderRadius:3, letterSpacing:'0.06em' } }, ev.tool),
                React.createElement('span', { style:{ font:'500 9px var(--font-mono)', color:'#526072', marginLeft:'auto', flexShrink:0 } }, ev.time),
              ),
              React.createElement('div', { style:{ font:'400 12px var(--font-body)', color:'#a0a3c0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, ev.title),
            ),
          );
        }),
      ),
    ),

    // Provider readiness
    React.createElement('section', { style:{ padding:18, border:'2px solid #2a2d5a', borderRadius:12, background:'#161938' } },
      React.createElement('h3', { style:{ font:'800 16px var(--font-display)', color:'#fff', marginBottom:14 } }, 'Provider Connections'),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 } },
        [{ name:'Anthropic', hint:'Atlas / Claude SDK', ready:true },{ name:'Google', hint:'Gemini / Imagen', ready:true },{ name:'OpenAI', hint:'GPT compatible', ready:false },{ name:'Replicate', hint:'Image fallback', ready:true }].map((p,i) =>
          React.createElement('div', { key:i, style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', border:'2px solid', borderColor: p.ready ? '#2a2d5a' : 'rgba(251,113,133,0.3)', borderRadius:10, background:'#1e2148' } },
            React.createElement('div', {},
              React.createElement('div', { style:{ font:'700 13px var(--font-body)', color:'#fff' } }, p.name),
              React.createElement('div', { style:{ font:'500 11px var(--font-body)', color:'#7f8da3', marginTop:1 } }, p.hint),
            ),
            React.createElement(KitStatusChip, { label: p.ready ? 'ready' : 'setup', state: p.ready ? 'active' : 'danger' }),
          ),
        ),
      ),
    ),
  );
};

Object.assign(window, { KitTopbar, KitDashboard, AgenticCard, ActiveMission });
