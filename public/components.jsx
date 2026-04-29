/* C-Office Components — Warm Professional Theme */

/* ====== SIDEBAR — Clean Professional Navigation ====== */
const NAV = [
  { id: 'dashboard',  label: 'Dashboard',   icon: '📊' },
  { id: 'agents',     label: 'Agents',      icon: '👥' },
  { id: 'notes',      label: 'Tasks',       icon: '📋' },
  { id: 'tasks',      label: 'Mission Log', icon: '📝' },
  { id: 'shop',       label: 'Shop',        icon: '🛒' },
  { id: 'skills',     label: 'Skills',      icon: '✨' },
  { id: 'memory',     label: 'Memory',      icon: '🧠' },
  { id: 'adventure',  label: 'Boss Hunt',   icon: '⚔️' },
  { id: 'settings',   label: 'Settings',    icon: '⚙️' },
  // Hidden legacy fallback
  { id: 'mission-control', label: 'Mission Control', icon: '▤', hidden: true },
];

const Sidebar = ({ page, setPage }) => {
  const visibleNav = NAV.filter(n => !n.hidden);
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"/>
        <div>
          <div className="brand-name">C-OFFICE</div>
          <div className="brand-sub">AI Agent Hub</div>
        </div>
      </div>
      {visibleNav.map(n => (
        <div key={n.id}
          className={`nav-item ${page === n.id ? 'active' : ''}`}
          onClick={() => setPage(n.id)}>
          <span className="ico">{n.icon}</span>
          <span>{n.label}</span>
          {n.id === 'agents' && <span className="badge" style={{marginLeft:'auto', fontSize:9}}>{AGENTS.length}</span>}
          {n.id === 'notes' && (window.NOTES?.length || 0) > 0 && (
            <span className="badge cyan" style={{marginLeft:'auto', fontSize:9}}>{window.NOTES.length}</span>
          )}
          {n.id === 'shop' && <span className="badge gold" style={{marginLeft:'auto', fontSize:9}}>New</span>}
          {n.id === 'tasks' && TASKS.filter(t=>t.status==='running').length > 0 && (
            <span className="badge gold" style={{marginLeft:'auto', fontSize:9}}>{TASKS.filter(t=>t.status==='running').length}</span>
          )}
        </div>
      ))}
      <div className="sidebar-foot">
        <div className="pilot-avatar">P</div>
        <div className="pilot-meta">
          <b>Commander</b><br/><span>Admin</span>
        </div>
      </div>
    </aside>
  );
};

/* ====== PROFESSIONAL AGENT CARD ====== */
const AgentCard = ({ agent, onClick, compact }) => {
  const statusMap = {
    busy:    { label: 'Working',  color: 'var(--gold)' },
    active:  { label: 'Online',   color: 'var(--green)' },
    idle:    { label: 'Idle',     color: 'var(--text-3)' },
    offline: { label: 'Offline',  color: 'var(--text-4)' },
  };
  const st = statusMap[agent.status] || statusMap.idle;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: compact ? '8px 10px' : '12px 14px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--bg-2)',
        cursor: 'pointer',
        transition: 'all 140ms ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--border-2)';
        e.currentTarget.style.background = 'var(--bg-3)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'var(--bg-2)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <AgentDot agent={agent} size={compact ? 32 : 40}/>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2}}>
          <span style={{fontSize: 13, fontWeight: 600}}>{agent.name}</span>
          <span style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: st.color,
            padding: '1px 6px',
            borderRadius: 999,
            border: '1px solid currentColor',
            opacity: 0.8,
          }}>{st.label}</span>
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{agent.role}</div>
        {!compact && agent.currentTask && (
          <div style={{
            fontSize: 10,
            color: 'var(--text-4)',
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{agent.currentTask}</div>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-4)',
        letterSpacing: '0.06em',
      }}>Lv.{agent.level || 1}</div>
    </div>
  );
};

/* Small activity-row with agent avatar */
const AgentDot = ({ agent, size = 28 }) => {
  if (!agent) {
    return <div style={{
      width: size, height: size, borderRadius: 8,
      background: 'var(--bg-3)', flexShrink: 0,
    }}/>;
  }
  if (agent.image) {
    return <img src={agent.image} alt={agent.name}
      style={{
        width: size, height: size, borderRadius: 8, objectFit: 'cover', objectPosition: 'center top',
        flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 4px 10px -2px rgba(0,0,0,0.4)',
      }}/>;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: agent.gradient,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700,
      fontSize: size*0.38, color: '#fff',
      flexShrink: 0,
      boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 4px 10px -2px rgba(0,0,0,0.4)'
    }}>{agent.avatarInitials}</div>
  );
};

/* Sparkline SVG for dashboard mini-metrics */
const Sparkline = ({ data, color = 'var(--coral)', h = 28 }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*100;
    const y = 100 - ((v-min)/(max-min || 1))*100;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" width="100%" height={h} preserveAspectRatio="none" style={{display:'block'}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
};

/* Radar chart for personality */
const Radar = ({ data, size = 220, color = 'var(--coral)' }) => {
  const keys = Object.keys(data);
  const n = keys.length;
  const cx = size/2, cy = size/2, r = size/2 - 30;
  const angle = (i) => (Math.PI*2*i)/n - Math.PI/2;
  const pt = (i, v) => {
    const rr = r * (v/100);
    return [cx + Math.cos(angle(i))*rr, cy + Math.sin(angle(i))*rr];
  };
  const poly = keys.map((k,i) => pt(i, data[k]).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((rr,i) => {
        const pts = keys.map((_,j) => {
          const p = [cx + Math.cos(angle(j))*r*rr, cy + Math.sin(angle(j))*r*rr];
          return p.join(',');
        }).join(' ');
        return <polygon key={i} points={pts} fill="none" stroke="rgba(255,107,107,0.12)" strokeWidth="1"/>;
      })}
      {keys.map((_,j) => {
        const p = [cx + Math.cos(angle(j))*r, cy + Math.sin(angle(j))*r];
        return <line key={j} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="rgba(255,107,107,0.08)" />;
      })}
      <polygon points={poly} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2"/>
      {keys.map((k,i) => {
        const p = [cx + Math.cos(angle(i))*(r+16), cy + Math.sin(angle(i))*(r+16)];
        return (
          <text key={k} x={p[0]} y={p[1]} textAnchor="middle" dominantBaseline="middle"
            style={{fontFamily:'var(--font-mono)', fontSize: 9, letterSpacing:'0.12em', textTransform:'uppercase', fill:'var(--text-3)'}}>
            {k}
          </text>
        );
      })}
      {keys.map((k,i) => {
        const [x,y] = pt(i, data[k]);
        return <circle key={k} cx={x} cy={y} r="3" fill={color} stroke="#fff" strokeWidth="1"/>;
      })}
    </svg>
  );
};

Object.assign(window, { AgentCard, AgentDot, Sparkline, Radar });
