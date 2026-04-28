/* Gacha card component: flexible — renders from agent data */
const GachaCard = ({ agent, variant = 'default', onClick }) => {
  const rarityStars = { SSR: '★★★★★', SR: '★★★★', R: '★★★', N: '★★' }[agent.rarity] || '★';
  const statusClass = agent.status === 'busy' ? 'busy' : agent.status === 'idle' ? 'idle' : agent.status === 'offline' ? 'offline' : '';
  const statusLabel = agent.status === 'busy' ? 'On Task' : agent.status === 'idle' ? 'Idle' : agent.status === 'offline' ? 'Offline' : 'Active';

  // random sparkle positions (stable per mount)
  const sparkles = React.useMemo(() =>
    Array.from({length: agent.rarity === 'SSR' ? 8 : agent.rarity === 'SR' ? 5 : 3}).map((_,i) => ({
      l: Math.random()*90+5, t: Math.random()*60+5, d: Math.random()*3, s: Math.random()*2+1
    }))
  , [agent.id, agent.rarity]);

  return (
    <div className="gacha-wrap" onClick={onClick}>
      <div
        className={`gacha rarity-${agent.rarity} variant-${variant}`}
        data-rarity={agent.rarity}
        style={{ '--art-gradient': agent.gradient }}
      >
        <div className="gacha-art">
          {sparkles.map((s,i) => (
            <span key={i} className="spark" style={{
              left: s.l+'%', top: s.t+'%',
              width: s.s+'px', height: s.s+'px',
              animationDelay: s.d+'s'
            }} />
          ))}
          {agent.image ? (
            <img src={agent.image} alt={agent.name}
              style={{
                position:'absolute', inset:0, width:'100%', height:'100%',
                objectFit:'cover', objectPosition:'center top',
                zIndex:1, pointerEvents:'none',
              }}/>
          ) : (
            <div className="art-placeholder">
              <div className="ap-icon">{agent.avatarInitials}</div>
              <div className="ap-label">Agent portrait · {agent.name}</div>
            </div>
          )}
        </div>

        <div className="gacha-head">
          <span className="rarity-tag">
            {agent.rarity} <span className="stars">{rarityStars}</span>
          </span>
          <span className="elem-badge" title={agent.elementName}>{agent.element}</span>
        </div>

        <div className={`status-ribbon ${statusClass}`}>{statusLabel}</div>
        <div className="level-pip">Lv <b>{agent.level}</b></div>

        <div className="gacha-foot">
          <div>
            <div className="agent-name">{agent.name}</div>
            <div className="agent-role">{agent.role}</div>
          </div>
          <div className="gacha-stats">
            <div className="gs"><div className="gs-label">PWR</div><div className="gs-value">{(agent.power/1000).toFixed(1)}k</div></div>
            <div className="gs"><div className="gs-label">TASK</div><div className="gs-value">{agent.stats.tasks}</div></div>
            <div className="gs"><div className="gs-label">SR</div><div className="gs-value">{agent.stats.success}%</div></div>
          </div>
        </div>
      </div>
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
const Sparkline = ({ data, color = 'var(--purple)', h = 28 }) => {
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
const Radar = ({ data, size = 220, color = 'var(--purple)' }) => {
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
        return <polygon key={i} points={pts} fill="none" stroke="rgba(157,92,255,0.15)" strokeWidth="1"/>;
      })}
      {keys.map((_,j) => {
        const p = [cx + Math.cos(angle(j))*r, cy + Math.sin(angle(j))*r];
        return <line key={j} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="rgba(157,92,255,0.1)" />;
      })}
      <polygon points={poly} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2"/>
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

Object.assign(window, { GachaCard, AgentDot, Sparkline, Radar });
