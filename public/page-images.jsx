/* ===== IMAGE STUDIO - Gemini generation and image library ===== */

const IMAGE_PROMPT_PRESETS = [
  {
    label: 'Office Hero',
    value: 'Create a cinematic sim-office hero image for an AI operations dashboard: modern office floor, agent workstations, monitors, warm practical lighting, clean UI-friendly composition, no text.',
  },
  {
    label: 'Staff Avatar',
    value: 'Create a full-body AI office staff avatar cutout, modern operations outfit, clear silhouette, standing pose, transparent or plain background, no text, no card frame.',
  },
  {
    label: 'Work Asset',
    value: 'Create a clean product-style visual asset for an AI office workflow, high-detail, professional, useful in a dashboard panel, no text, no watermark.',
  },
];

const ImageStudioPage = () => {
  window.useCOfficeRefresh?.();
  const [status, setStatus] = React.useState(null);
  const [images, setImages] = React.useState([]);
  const [prompt, setPrompt] = React.useState(IMAGE_PROMPT_PRESETS[0].value);
  const [provider, setProvider] = React.useState('nanobanana2pro');
  const [mode, setMode] = React.useState('general');
  const [agentId, setAgentId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  // Character Builder State
  const [charGender, setCharGender] = React.useState('หญิง');
  const [charStyle, setCharStyle] = React.useState('อนิเมะญี่ปุ่นแฟนตาซี');
  const [charRole, setCharRole] = React.useState('นักเวทย์ (Mage)');
  const [charOutfit, setCharOutfit] = React.useState('ชุดผ้าไหมพริ้วไหวประดับอัญมณี');
  const [charWeapon, setCharWeapon] = React.useState('คทาเวทย์มนต์เรืองแสง');
  const [charColor, setCharColor] = React.useState('สีทองสว่าง (Bright Gold)');

  const compilePrompt = () => {
    const styleMap = {
      'อนิเมะญี่ปุ่นแฟนตาซี': 'high-quality JRPG anime style, vibrant colors, detailed cel shading',
      'แฟนตาซีตะวันตก': 'epic western fantasy, semi-realistic, oil painting texture, dramatic lighting',
      'จอมยุทธ์จีน': 'elegant Wuxia style, flowing ink aesthetics, traditional Chinese elements',
      'ไทยประยุกต์แฟนตาซี': 'modern Thai fantasy fusion, intricate golden ornaments, tropical mythical atmosphere',
      'ไซไฟโลกอนาคต': 'cyberpunk sci-fi, neon glows, metallic surfaces, high-tech intricate details',
      'พิกเซลอาร์ต': 'detailed 32-bit pixel art style, retro game aesthetic, sharp colors',
      '3D Render': 'modern 3D game render, Unreal Engine 5 style, octane render, cinematic'
    };

    const promptText = [
      `A highly detailed ${styleMap[charStyle] || charStyle} character concept illustration.`,
      `Gender: ${charGender}.`,
      `Role/Profession: ${charRole}.`,
      `Outfit and Appearance: ${charOutfit}.`,
      `Weapon/Equipment: ${charWeapon}.`,
      `Signature theme color: ${charColor}.`,
      `Pose: heroic professional stance, expressive facial features, full body composition, centered portrait.`,
      `Quality: masterwork, crisp lines, vivid accents, game-ready art, 8k resolution.`
    ].join(' ');
    
    setPrompt(promptText);
  };

  const CHAR_OPTIONS = {
    gender: ['ชาย (Male)', 'หญิง (Female)', 'Androgynous (ไร้เพศ)', 'หุ่นยนต์/จักรกล', 'สัตว์ป่ากึ่งมนุษย์'],
    style: ['อนิเมะญี่ปุ่นแฟนตาซี', 'แฟนตาซีตะวันตก', 'จอมยุทธ์จีน', 'ไทยประยุกต์แฟนตาซี', 'ไซไฟโลกอนาคต', 'พิกเซลอาร์ต', '3D Render'],
    role: [
      'นักดาบ (Swordsman)', 'อัศวินเกราะหนัก (Knight)', 'นักเวทย์ (Mage)', 'มือสังหาร (Assassin)', 
      'สไนเปอร์ (Sniper)', 'หมอ/นักบุญ (Healer)', 'พ่อค้า (Merchant)', 'วิศวกร (Engineer)',
      'นินจา (Ninja)', 'ซามูไร (Samurai)', 'นักล่า (Hunter)', 'กัปตันเรือ (Captain)'
    ],
    outfit: [
      'ชุดผ้าไหมพริ้วไหวประดับอัญมณี', 'เกราะเหล็กเต็มตัวขัดเงา', 'ชุดหนังรัดรูปสีดำสไตล์สายลับ',
      'เสื้อคลุมยาวขอบทองดูหรูหรา', 'ชุดสตรีทแวร์ล้ำยุคมีไฟนีออน', 'ชุดไทยประยุกต์เครื่องทองจัดเต็ม',
      'ผ้าคลุมขาดๆ ลุคนักเดินทาง', 'ชุดสูททางการมาดเนี้ยบ', 'เกราะเบาประดับขนนก'
    ],
    weapon: [
      'คทาเวทย์มนต์เรืองแสง', 'ดาบใหญ่สองมือ (Greatsword)', 'ปืนคู่สไตล์เลเซอร์',
      'ธนูไม้มงคลประดับมนต์', 'มีดสั้นคู่สีเงิน', 'ขลุ่ยหยกบรรเลงเพลงยุทธ์',
      'โดรนจิ๋วบินรอบตัว', 'โล่ขนาดยักษ์', 'พัดเหล็กประดับลวดลาย', 'ไม่มีอาวุธ (มือเปล่า)'
    ],
    themeColor: [
      'สีทองสว่าง (Bright Gold)', 'สีแดงเพลิง (Crimson Red)', 'สีน้ำเงินเข้ม (Deep Blue)',
      'สีเขียวมรกต (Emerald Green)', 'สีม่วงลึกลับ (Mystic Purple)', 'สีชมพูซากุระ (Sakura Pink)',
      'สีดำรัตติกาล (Obsidian Black)', 'สีเงินโครเมียม (Chrome Silver)', 'สีขาวบริสุทธิ์ (Pure White)'
    ]
  };

  const agents = Array.isArray(window.AGENTS) ? window.AGENTS : [];
  const providers = status?.providers || [];
  const googleReady = providers.some((p) => p.provider === 'google' && p.connected);
  const selectedImage = selected || images[0] || null;

  const refreshStatus = React.useCallback(() => {
    fetch('/api/images/status').then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  const refreshLibrary = React.useCallback(() => {
    fetch('/api/images/library')
      .then((r) => r.json())
      .then((j) => setImages(Array.isArray(j.images) ? j.images : []))
      .catch(() => setImages([]));
  }, []);

  React.useEffect(() => {
    refreshStatus();
    refreshLibrary();
  }, [refreshStatus, refreshLibrary]);

  React.useEffect(() => {
    if (mode === 'character' && !agentId && agents[0]?.id) setAgentId(agents[0].id);
  }, [mode, agentId, agents.length]);

  const generate = async () => {
    const bodyPrompt = prompt.trim();
    if (!bodyPrompt || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: bodyPrompt,
          provider,
          mode,
          agentId: mode === 'character' ? agentId : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Image generation failed');
      await refreshLibrary();
      if (j.image) setSelected(j.image);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (image) => {
    if (!image?.name) return;
    if (!confirm(`Delete image "${image.name}"?`)) return;
    await fetch(`/api/images/library/${encodeURIComponent(image.name)}`, { method: 'DELETE' });
    if (selected?.name === image.name) setSelected(null);
    await refreshLibrary();
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Image <span className="accent">Studio</span></h1>
          <div className="sub">Generate with Gemini token · store every result in the office image library</div>
        </div>
        <div className="topbar-actions">
          <span className={'chip ' + (googleReady ? '' : 'muted')}>
            <span className="dot"/> Gemini {googleReady ? 'ready' : 'not connected'}
          </span>
          <button className="btn ghost" onClick={() => { refreshStatus(); refreshLibrary(); }}>Refresh</button>
        </div>
      </div>

      <div className="image-studio-layout">
        <section className="panel image-generator-panel">
          <div className="panel-head">
            <h3>Generate Image</h3>
            <div className="right">Gemini / Nano Banana</div>
          </div>

          <div className="image-mode-row">
            <button className={'btn ' + (mode === 'general' ? 'primary' : '')} onClick={() => setMode('general')}>General Asset</button>
            <button className={'btn ' + (mode === 'character' ? 'primary' : '')} onClick={() => setMode('character')}>Staff Avatar</button>
          </div>

          <label className="image-field">
            Provider
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="nanobanana2pro">Nano Banana 2 · Gemini 3.1 Flash Image Preview</option>
              <option value="flashgen">3.1 Flash Gen · Gemini Flash Image</option>
            </select>
          </label>

          {mode === 'character' && (
            <label className="image-field">
              Staff profile
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>)}
              </select>
            </label>
          )}

          <div className="image-presets">
            {IMAGE_PROMPT_PRESETS.map((preset) => (
              <button key={preset.label} onClick={() => setPrompt(preset.value)}>{preset.label}</button>
            ))}
          </div>

          {mode === 'character' && (
            <div style={{ background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--text-1)' }}>
              <div style={{ fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>✨</span> ระบบปั้นตัวละคร (Pro Character Builder)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
                  <label className="image-field">
                    <span>เพศ:</span>
                    <select value={charGender} onChange={e => setCharGender(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                      {CHAR_OPTIONS.gender.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                  <label className="image-field">
                    <span>สไตล์ภาพ:</span>
                    <select value={charStyle} onChange={e => setCharStyle(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                      {CHAR_OPTIONS.style.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                </div>
                
                <label className="image-field">
                  <span>อาชีพ / บทบาท:</span>
                  <select value={charRole} onChange={e => setCharRole(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                    {CHAR_OPTIONS.role.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>

                <label className="image-field">
                  <span>ชุดและรูปลักษณ์:</span>
                  <select value={charOutfit} onChange={e => setCharOutfit(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                    {CHAR_OPTIONS.outfit.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>

                <label className="image-field">
                  <span>อาวุธและอุปกรณ์:</span>
                  <select value={charWeapon} onChange={e => setCharWeapon(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                    {CHAR_OPTIONS.weapon.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>

                <label className="image-field">
                  <span>โทนสีหลัก (Theme):</span>
                  <select value={charColor} onChange={e => setCharColor(e.target.value)} style={{padding: 6, borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text)', border: '1px solid var(--border)'}}>
                    {CHAR_OPTIONS.themeColor.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>

                <button className="btn gold" style={{ marginTop: 8, height: 40, fontWeight: 700 }} onClick={compilePrompt}>
                  อัปเกรดเป็น Pro Prompt และสรุปด้านล่าง 👇
                </button>
              </div>
            </div>
          )}

          <label className="image-field">
            Prompt
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={9}
              placeholder="พิมพ์รายละเอียดตัวละครหรือภาพที่ต้องการที่นี่..."
            />
          </label>

          {error && <div className="image-error">{error}</div>}

          <button className="btn primary image-generate-btn" disabled={busy || !prompt.trim()} onClick={generate}>
            {busy ? 'Generating...' : 'Generate With Gemini'}
          </button>
        </section>

        <section className="panel image-preview-panel">
          <div className="panel-head">
            <h3>Preview</h3>
            <div className="right">{selectedImage?.provider || 'latest'}</div>
          </div>
          {selectedImage ? (
            <>
              <a className="image-preview-frame" href={selectedImage.imageUrl} target="_blank" rel="noreferrer">
                <img src={selectedImage.imageUrl} alt={selectedImage.prompt || selectedImage.name}/>
              </a>
              <div className="image-meta">
                <b>{selectedImage.name}</b>
                <span>{selectedImage.model || 'unknown model'} · {selectedImage.bytes ? `${Math.round(selectedImage.bytes / 1024)} KB` : 'stored'}</span>
                {selectedImage.prompt && <p>{selectedImage.prompt}</p>}
              </div>
              <div className="image-actions">
                <a className="btn ghost" href={selectedImage.imageUrl} target="_blank" rel="noreferrer">Open</a>
                <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(selectedImage.imageUrl)}>Copy URL</button>
                <button className="btn ghost" onClick={() => removeImage(selectedImage)}>Delete</button>
              </div>
            </>
          ) : (
            <div className="muted" style={{fontSize: 12, padding: 40, textAlign: 'center'}}>No generated images yet.</div>
          )}
        </section>
      </div>

      <section className="panel image-library-panel">
        <div className="panel-head">
          <h3>Image Library</h3>
          <div className="right">{images.length} stored assets</div>
        </div>
        <div className="image-library-grid">
          {images.map((image) => (
            <button
              key={image.name}
              className={'image-library-card ' + (selectedImage?.name === image.name ? 'is-selected' : '')}
              onClick={() => setSelected(image)}
              title={image.prompt || image.name}
            >
              <img src={image.imageUrl} alt={image.prompt || image.name}/>
              <span>{image.provider || 'image'}</span>
            </button>
          ))}
          {images.length === 0 && <div className="muted" style={{fontSize: 12}}>Generate an image to start the library.</div>}
        </div>
      </section>
    </div>
  );
};

Object.assign(window, { ImageStudioPage });
