/* ===== AGENT SHOP / SKILL INSTALLER ===== */

const SHOP_AGENT_PRICES = { SSR: 900, SR: 620, R: 360, N: 180 };

const AgentShopPage = ({ onOpenAgent }) => {
  window.useCOfficeRefresh();
  const agents = window.AGENTS || [];
  const catalog = window.SHOP_CATALOG || { skills: [], items: [], agents: [] };
  const inventory = window.INVENTORY || { gold: 0, ownedAgents: ['orchestra'], skills: {}, items: {} };
  const ownedAgents = new Set(inventory.ownedAgents || ['orchestra']);
  const [selectedAgent, setSelectedAgent] = React.useState('orchestra');
  const [selectedSkill, setSelectedSkill] = React.useState('');
  const [busy, setBusy] = React.useState('');
  const selected = agents.find((a) => a.id === selectedAgent) || agents[0];
  const installed = inventory.skills?.[selectedAgent] || [];
  const skills = catalog.skills || [];

  React.useEffect(() => {
    if (!selectedSkill && skills[0]) setSelectedSkill(skills[0].id);
  }, [skills.length, selectedSkill]);

  async function refreshShop() {
    await window.fetchCOfficeShop?.();
  }

  async function postShop(path, body) {
    setBusy(path + ':' + (body.id || body.personaId || ''));
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) alert(j.error || 'ทำรายการไม่สำเร็จ');
      await refreshShop();
      return j;
    } finally {
      setBusy('');
    }
  }

  const buyAgent = async (agent) => {
    if (!agent || ownedAgents.has(agent.id)) return;
    const result = await postShop('/api/shop/buy', { type: 'agent', id: agent.id });
    if (result?.ok !== false) setSelectedAgent(agent.id);
  };

  const installSkill = async () => {
    if (!selected || !selectedSkill || installed.includes(selectedSkill)) return;
    await postShop('/api/shop/buy', { type: 'skill', id: selectedSkill, personaId: selected.id });
  };

  const removeSkill = async (skillId) => {
    if (!selected || !skillId) return;
    await postShop('/api/shop/unequip', { id: skillId, personaId: selected.id });
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>ตลาด <span className="accent">สมาคม</span></h1>
          <div className="sub">เกณฑ์สมาชิก · ฝึกความสามารถ · ใช้ทองจากรางวัลภารกิจและงานจริง</div>
        </div>
        <div className="topbar-actions">
          <span className="shop-wallet">{Number(inventory.gold || 0).toLocaleString()} ทอง</span>
          <button className="btn ghost" onClick={refreshShop}>รีเฟรช</button>
        </div>
      </div>

      <div className="shop-layout">
        <section className="panel">
          <div className="panel-head">
            <h3>ตลาดสมาชิก</h3>
            <div className="right">{ownedAgents.size}/{agents.length} owned</div>
          </div>
          <div className="shop-agent-grid">
            {agents.map((agent) => {
              const isOwned = ownedAgents.has(agent.id);
              const price = SHOP_AGENT_PRICES[agent.rarity] || 300;
              const canBuy = !isOwned && inventory.gold >= price;
              return (
                <div
                  key={agent.id}
                  role="button"
                  tabIndex={0}
                  className={'shop-agent-card' + (selectedAgent === agent.id ? ' active' : '')}
                  onClick={() => setSelectedAgent(agent.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedAgent(agent.id); }}
                >
                  <AgentDot agent={agent} size={46}/>
                  <div className="shop-agent-main">
                    <div className="shop-agent-name">{agent.name}</div>
                    <div className="shop-agent-role">{agent.role}</div>
                    <div className="shop-agent-tags">
                      <span className={`badge ${agent.rarity === 'SSR' ? 'gold' : agent.rarity === 'SR' ? '' : 'cyan'}`}>{agent.rarity}</span>
                      <span className="badge slate">Lv.{agent.level}</span>
                    </div>
                  </div>
                  <div className="shop-agent-buy">
                    {isOwned ? (
                      <span className="badge green">มีแล้ว</span>
                    ) : (
                      <button
                        className="btn gold"
                        disabled={!canBuy || !!busy}
                        onClick={(e) => { e.stopPropagation(); buyAgent(agent); }}
                      >
                        {price} ทอง
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>ติดตั้งความสามารถ</h3>
            <div className="right">{selected?.name || 'เลือกเอเจนท์'}</div>
          </div>
          {selected && (
            <div className="shop-loadout">
              <div className="shop-selected-agent">
                <AgentDot agent={selected} size={64}/>
                <div>
                  <h2>{selected.name}</h2>
                  <div className="muted" style={{fontSize:13}}>{selected.tagline}</div>
                  <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:8}}>
                    {selected.traits.map((t) => <span key={t} className="badge gold">{t}</span>)}
                  </div>
                </div>
              </div>

              {!ownedAgents.has(selected.id) && (
                <button className="btn gold" disabled={inventory.gold < (SHOP_AGENT_PRICES[selected.rarity] || 300) || !!busy} onClick={() => buyAgent(selected)}>
                  ซื้อ {selected.name} - {(SHOP_AGENT_PRICES[selected.rarity] || 300).toLocaleString()} ทอง
                </button>
              )}

              {ownedAgents.has(selected.id) && (
                <>
                  <div className="shop-slot-list">
                    {[0, 1, 2].map((slot) => {
                      const skill = skills.find((s) => s.id === installed[slot]);
                      return (
                        <div key={slot} className="shop-slot">
                          <span className="mono-s">ช่อง {slot + 1}</span>
                          {skill ? (
                            <>
                              <b>{skill.name}</b>
                              <button className="btn ghost" disabled={!!busy} onClick={() => removeSkill(skill.id)}>ถอด</button>
                            </>
                          ) : <span className="muted">ว่าง</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="shop-install-row">
                    <select className="cmd-select" value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)}>
                      {skills.map((skill) => (
                        <option key={skill.id} value={skill.id} disabled={installed.includes(skill.id)}>
                          {skill.name} - {skill.cost} ทอง
                        </option>
                      ))}
                    </select>
                    <button className="btn primary" disabled={installed.length >= 3 || !selectedSkill || !!busy} onClick={installSkill}>
                      ติดตั้ง
                    </button>
                  </div>

                  <div className="shop-skill-catalog">
                    {skills.map((skill) => (
                      <div key={skill.id} className={'shop-skill-card' + (installed.includes(skill.id) ? ' installed' : '')}>
                        <div className="shop-skill-head">
                          <b>{skill.name}</b>
                          <span className="badge cyan">{skill.tier}</span>
                        </div>
                        <div className="muted" style={{fontSize:12}}>{skill.desc}</div>
                        <div className="mono-s">{skill.cost} ทอง</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

Object.assign(window, { AgentShopPage });
