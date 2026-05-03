/* C-Office UI Kit — Sidebar Navigation */

const KIT_NAV = [
  { id:'dashboard', label:'Dashboard', icon:'DB', color:'var(--ux-accent-primary)' },
  { id:'mission-control', label:'Mission Control', icon:'MC', color:'var(--ux-accent-secondary)' },
  { id:'agents', label:'Agents', icon:'AG', color:'var(--ux-accent-secondary)' },
  { id:'notes', label:'Notes', icon:'NT', color:'var(--ux-accent-gold)' },
  { id:'tasks', label:'Tasks', icon:'TS', color:'var(--ux-accent-pink)' },
  { id:'images', label:'Images', icon:'IM', color:'var(--ux-success)' },
  { id:'skills', label:'Playbooks', icon:'SK', color:'var(--ux-accent-secondary)' },
  { id:'memory', label:'Archive', icon:'MM', color:'var(--ux-accent-primary)' },
  { id:'settings', label:'Settings', icon:'ST', color:'var(--ux-text-muted)' },
];

const icoStyle = (active, color) => ({
  width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center',
  borderRadius:8, fontSize:10, fontFamily:'var(--font-mono)', fontWeight:600, letterSpacing:0, flexShrink:0,
  border:'1px solid rgba(255,255,255,0.06)',
  color: active ? color : 'var(--ux-text-muted)',
  background: active ? `color-mix(in srgb, ${color} 13%, transparent)` : 'rgba(42,45,90,0.45)',
  boxShadow: active ? `0 0 16px color-mix(in srgb, ${color} 28%, transparent)` : 'none',
});

const KitSidebar = ({ page, setPage }) => {
  const [expanded, setExpanded] = React.useState(false);
  return React.createElement('aside', {
    onMouseEnter:()=>setExpanded(true), onMouseLeave:()=>setExpanded(false),
    style:{
      borderRight:'2px solid #2a2d5a',
      background:'#0e1028',
      boxShadow: expanded ? '24px 0 60px rgba(0,0,0,0.5)' : 'none',
      padding:'14px 12px', position:'sticky', top:0, width: expanded ? 240 : 72, height:'100vh',
      display:'flex', flexDirection:'column', gap:4, overflow:'hidden', zIndex:20,
      transition:'width 240ms cubic-bezier(.2,.8,.2,1), box-shadow 240ms',
    }
  },
    // Brand
    React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:10, padding:'8px 2px 18px', borderBottom:'2px solid #2a2d5a', marginBottom:10, minWidth:216 } },
      React.createElement('div', { style:{ width:46, height:46, borderRadius:12, flexShrink:0, backgroundImage:'url(../../assets/images/Orchestra.png)', backgroundSize:'180% auto', backgroundPosition:'center 10%', backgroundRepeat:'no-repeat', backgroundColor:'var(--bg-2)', boxShadow:'0 0 0 1px rgba(255,255,255,0.10),0 0 22px rgba(34,211,238,0.26),0 14px 28px rgba(0,0,0,0.28)' } }),
      React.createElement('div', { style:{ transition:'opacity 160ms', opacity: expanded ? 1 : 0 } },
        React.createElement('div', { style:{ font:'700 15px var(--font-display)', letterSpacing:'0.08em', color:'var(--ux-text-primary)' } }, 'C-OFFICE'),
        React.createElement('div', { style:{ fontSize:10, color:'var(--ux-text-muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.12em' } }, 'AI Agent Hub'),
      ),
    ),
    // Nav items
    ...KIT_NAV.map(n =>
      React.createElement('button', {
        key:n.id, onClick:()=>setPage(n.id),
        style:{
          all:'unset', display:'flex', alignItems:'center', gap:10, padding:'10px 9px',
          borderRadius:12, color: page===n.id ? '#fff' : 'var(--ux-text-secondary)',
          cursor:'pointer', fontSize:13, fontWeight:500, minWidth:216, minHeight:42,
          border:'1px solid', transition:'all 140ms ease',
          borderColor: page===n.id ? `color-mix(in srgb, ${n.color} 42%, rgba(255,255,255,0.10))` : 'transparent',
          borderLeftColor: page===n.id ? n.color : 'transparent', borderLeftWidth: page===n.id ? 3 : 1,
          background: page===n.id ? `linear-gradient(90deg, color-mix(in srgb, ${n.color} 18%, transparent), rgba(255,255,255,0.04))` : 'transparent',
        }
      },
        React.createElement('span', { style:icoStyle(page===n.id, n.color) }, n.icon),
        React.createElement('span', { style:{ transition:'opacity 160ms', opacity: expanded ? 1 : 0 } }, n.label),
      )
    ),
    // Footer
    React.createElement('div', { style:{ marginTop:'auto', paddingTop:12, borderTop:'2px solid #2a2d5a', display:'flex', gap:10, alignItems:'center', minWidth:216 } },
      React.createElement('div', { style:{ width:42, height:42, borderRadius:10, background:'linear-gradient(135deg,var(--ux-accent-secondary),var(--ux-accent-primary))', display:'flex', alignItems:'center', justifyContent:'center', font:'700 13px var(--font-display)', color:'#fff' } }, 'P'),
      React.createElement('div', { style:{ transition:'opacity 160ms', opacity: expanded ? 1 : 0, fontSize:12, lineHeight:1.3 } },
        React.createElement('b', { style:{ fontWeight:600, color:'var(--ux-text-primary)' } }, 'Commander'),
        React.createElement('br'),
        React.createElement('span', { style:{ color:'var(--ux-text-muted)', fontSize:10, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.1em' } }, 'Admin'),
      ),
    ),
  );
};

Object.assign(window, { KitSidebar, KIT_NAV });
