/* C-Office UI Kit — Shared Components */

const PERSONAS = [
  { id:'atlas', name:'Atlas', role:'Maestro · Lead Conductor', rarity:'SSR', element:'👑', elementName:'Command', image:'../../assets/portraits/atlas.png', gradient:'linear-gradient(155deg,#fbbf24,#f472b6 35%,#9d5cff 65%,#22d3ee)', level:60, status:'busy', tagline:'Routing goals and delegating to the crew.' },
  { id:'oracle', name:'Oracle', role:'Mentor · Knowledge Architect', rarity:'SSR', element:'🎓', elementName:'Education', image:'../../assets/portraits/oracle.png', gradient:'linear-gradient(155deg,#fbbf24,#f472b6 50%,#9d5cff)', level:47, status:'active', tagline:'Designing learning journeys.' },
  { id:'scribe', name:'Scribe', role:'Scribe · Content Lead', rarity:'SSR', element:'✒️', elementName:'Narrative', image:'../../assets/portraits/scribe.png', gradient:'linear-gradient(155deg,#818cf8,#a78bfa)', level:44, status:'idle', tagline:'Ready for content tasks.' },
  { id:'warden', name:'Warden', role:'Sentinel · Audit & Security', rarity:'SR', element:'🛡️', elementName:'Defense', image:'../../assets/portraits/warden.png', gradient:'linear-gradient(155deg,#f43f5e,#fb7185)', level:41, status:'offline', tagline:'Standing by for audit.' },
  { id:'vector', name:'Vector', role:'Builder · Code Forge', rarity:'SSR', element:'⚡', elementName:'Engineering', image:'../../assets/portraits/vector.png', gradient:'linear-gradient(155deg,#22d3ee,#3b82f6)', level:52, status:'busy', tagline:'Full-stack engineering sprint.' },
  { id:'pulse', name:'Pulse', role:'Growth · Multi-platform Strategist', rarity:'SR', element:'📈', elementName:'Commerce', image:'../../assets/portraits/pulse.png', gradient:'linear-gradient(155deg,#f472b6,#ec4899)', level:39, status:'active', tagline:'Analyzing campaign metrics.' },
  { id:'forge', name:'Forge', role:'Studio · Visual Craft', rarity:'SR', element:'🎨', elementName:'Creative', image:'../../assets/portraits/forge.png', gradient:'linear-gradient(155deg,#34d399,#22d3ee)', level:38, status:'idle', tagline:'Ready for visual tasks.' },
  { id:'scout', name:'Scout', role:'Intel · Insights Analyst', rarity:'SR', element:'🔍', elementName:'Research', image:'../../assets/portraits/scout.png', gradient:'linear-gradient(155deg,#a78bfa,#818cf8)', level:36, status:'active', tagline:'Tracking market trends.' },
  { id:'relay', name:'Relay', role:'Operations · DevOps Lead', rarity:'R', element:'⚙️', elementName:'Operations', image:'../../assets/portraits/relay.png', gradient:'linear-gradient(155deg,#64748b,#94a3b8)', level:34, status:'idle', tagline:'Monitoring infrastructure.' },
];

const STATUS_MAP = {
  busy:    { label:'Working',  color:'var(--ux-accent-gold)', state:'busy' },
  active:  { label:'Online',   color:'var(--ux-success)', state:'active' },
  idle:    { label:'Idle',     color:'var(--ux-text-muted)', state:'muted' },
  offline: { label:'Offline',  color:'var(--ux-offline)', state:'muted' },
};

const kitStatusChipStyles = { display:'inline-flex', alignItems:'center', gap:7, minHeight:26, padding:'4px 9px', border:'1px solid var(--ux-border-soft)', borderRadius:999, background:'rgba(255,255,255,0.045)', font:'700 10px var(--font-mono)', letterSpacing:'0.08em', textTransform:'uppercase', whiteSpace:'nowrap' };

const KitStatusChip = ({ label, state='muted' }) => {
  const colors = { active:'var(--ux-success)', busy:'var(--ux-accent-gold)', danger:'var(--ux-danger)', muted:'var(--ux-text-muted)' };
  const c = colors[state] || colors.muted;
  return React.createElement('span', { style:{ ...kitStatusChipStyles, color:c, borderColor: state !== 'muted' ? `color-mix(in srgb, ${c} 32%, transparent)` : undefined, background: state !== 'muted' ? `color-mix(in srgb, ${c} 7.5%, transparent)` : undefined } },
    React.createElement('span', { style:{ width:7, height:7, borderRadius:'50%', background:c, boxShadow:`0 0 12px ${c}` } }),
    label
  );
};

const KitAgentCard = ({ agent, onClick }) => {
  const st = STATUS_MAP[agent.status] || STATUS_MAP.idle;
  const [hovered, setHovered] = React.useState(false);
  return React.createElement('button', {
    onClick, onMouseEnter:()=>setHovered(true), onMouseLeave:()=>setHovered(false),
    style:{ all:'unset', display:'flex', gap:12, alignItems:'center', padding:'12px 14px', borderRadius:10, border:'1px solid', borderColor: hovered ? '#4a4d8a' : '#2a2d5a', background: hovered ? '#1e2148' : '#181b3a', cursor:'pointer', transition:'all 140ms ease', transform: hovered ? 'translateY(-1px)' : 'none', width:'100%', textAlign:'left', boxShadow: hovered ? 'var(--ux-shadow-card)' : 'none' }
  },
    React.createElement('img', { src:agent.image, alt:agent.name, style:{ width:40, height:40, borderRadius:8, objectFit:'cover', objectPosition:'center top', flexShrink:0, boxShadow:'0 0 0 1px rgba(0,0,0,0.3),0 4px 10px -2px rgba(0,0,0,0.4)' } }),
    React.createElement('div', { style:{ flex:1, minWidth:0 } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:6, marginBottom:2 } },
        React.createElement('span', { style:{ fontSize:13, fontWeight:600, color:'var(--ux-text-primary)' } }, agent.name),
        React.createElement(KitStatusChip, { label:st.label, state:st.state })
      ),
      React.createElement('div', { style:{ fontSize:11, color:'var(--ux-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, agent.role),
    ),
    React.createElement('span', { style:{ font:'500 10px var(--font-mono)', color:'var(--ux-text-faint)', letterSpacing:'0.06em' } }, `Lv.${agent.level}`)
  );
};

const KitMetricCard = ({ label, value, note, color='var(--ux-accent-secondary)' }) => {
  const [hovered, setHovered] = React.useState(false);
  return React.createElement('div', {
    onMouseEnter:()=>setHovered(true), onMouseLeave:()=>setHovered(false),
    style:{ position:'relative', overflow:'hidden', minHeight:100, padding:16, border:'2px solid', borderColor: hovered ? '#4a4d8a' : '#2a2d5a', borderRadius:10, background:'#1a1d42', transition:'all 160ms ease', transform: hovered ? 'translateY(-2px)' : 'none', boxShadow: hovered ? `var(--ux-shadow-card), 0 0 32px color-mix(in srgb, ${color} 20%, transparent)` : 'none' }
  },
    React.createElement('div', { style:{ position:'absolute', bottom:10, right:12, width:64, height:64, borderRadius:999, background:`color-mix(in srgb, ${color} 18%, transparent)`, filter:'blur(10px)', opacity:0.8 } }),
    React.createElement('div', { style:{ position:'relative', zIndex:1, font:'800 10px var(--font-mono)', letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--ux-text-muted)', marginBottom:8 } }, label),
    React.createElement('div', { style:{ position:'relative', zIndex:1, font:'800 28px var(--font-display)', color:'var(--ux-text-primary)', letterSpacing:'-0.02em' } }, value),
    React.createElement('div', { style:{ position:'relative', zIndex:1, font:'500 11px var(--font-body)', color:'var(--ux-text-muted)', marginTop:4 } }, note),
  );
};

const KitEmptyState = ({ title='No data yet', body='Panel will wake up when activity appears.' }) => (
  React.createElement('div', { style:{ display:'grid', placeItems:'center', minHeight:140, padding:28, textAlign:'center', border:'2px dashed #2a2d5a', borderRadius:12, background:'#161938' } },
    React.createElement('div', {},
      React.createElement('b', { style:{ display:'block', marginBottom:6, color:'var(--ux-text-primary)', font:'700 16px var(--font-display)' } }, title),
      React.createElement('span', { style:{ color:'var(--ux-text-muted)', fontSize:13 } }, body),
    )
  )
);

Object.assign(window, { PERSONAS, STATUS_MAP, KitStatusChip, KitAgentCard, KitMetricCard, KitEmptyState });
