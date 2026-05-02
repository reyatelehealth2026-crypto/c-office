/* ===== IMAGE STUDIO - Codex CLI image generation and image library ===== */

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

// Top-level visual style — applied in EITHER mode. The `modifier` is appended
// to the prompt before sending. Grouped roughly: photo → cinematic → comic →
// painterly → graphic → niche.
const IMAGE_STYLES = [
  // Photo / cinematic
  { id: 'photorealistic',    label: 'Photorealistic (ภาพถ่ายจริง)',        modifier: 'photorealistic, hyper-detailed, professional photography, natural lighting, realistic skin texture, depth of field, shot on full-frame DSLR, no illustration look' },
  { id: 'cinematic',         label: 'Cinematic Film',                      modifier: 'cinematic still frame, movie production lighting, anamorphic lens, color graded, dramatic atmosphere, film grain' },
  { id: 'flash-photo',       label: 'Flash Photography (ภาพแฟลช)',         modifier: 'on-camera direct flash photography, harsh shadows, washed highlights, tabloid paparazzi look, 35mm film grain, 1990s magazine aesthetic' },
  { id: 'polaroid',          label: 'Polaroid (โพลารอยด์)',                modifier: 'instant Polaroid SX-70 photograph, slight color shift, soft vignette, white border frame, vintage film texture' },
  { id: 'movie-poster',      label: 'Movie Poster (โปสเตอร์หนัง)',         modifier: 'theatrical movie poster composition, dramatic title-treatment space at top and bottom, high-contrast colored lighting, hero figure centered, billing block placeholder, IMAX-grade key art' },
  { id: 'ad-poster',         label: 'Advertising Poster (โปสเตอร์โฆษณา)',  modifier: 'editorial advertising poster, bold product hero shot, large empty headline space, premium brand campaign aesthetic, magazine-spread quality, high-end commercial photography lighting' },
  // Anime / comic
  { id: 'anime-jrpg',        label: 'Anime · JRPG',                        modifier: 'high-quality anime illustration, vibrant cel shading, expressive linework, JRPG character art style' },
  { id: 'anime-ghibli',      label: 'Anime · Studio-Ghibli style',         modifier: 'soft hand-painted anime in the style of classic Studio Ghibli, watercolor backgrounds, warm natural light, gentle character expressions, 2D cel animation' },
  { id: 'anime-shonen',      label: 'Anime · Shonen action',               modifier: 'high-energy shonen anime keyframe, dynamic motion lines, dramatic pose, vivid saturated colors, screentone effects, manga-action panel feel' },
  { id: 'manga',             label: 'Manga (ขาว-ดำ)',                       modifier: 'black and white manga panel, screen-tone shading, dynamic ink lines, Japanese comic style' },
  { id: 'comic-american',    label: 'American Comic Book',                 modifier: 'American comic book panel, bold ink outlines, halftone dot shading, saturated four-color print look, dramatic Kirby/Lee pose' },
  { id: 'caricature',        label: 'Caricature (ภาพล้อเลียน)',             modifier: 'exaggerated caricature illustration, oversized features, playful expression, cartoonish proportions, bold ink outlines, bright cel-shaded fill' },
  // Painterly
  { id: 'oil-painting',      label: 'Oil Painting (คลาสสิก)',                modifier: 'classical oil painting, visible brushstrokes, rich pigments, museum-quality canvas texture' },
  { id: 'watercolor',        label: 'Watercolor (สีน้ำ)',                    modifier: 'soft watercolor painting, paper texture, gentle bleeding pigments, light pastel tones' },
  { id: 'ink-wash',          label: 'Ink Wash (หมึกจีน)',                    modifier: 'East-Asian ink wash painting, sumi-e brushwork, monochrome black ink on rice paper, negative space composition, subtle gradients' },
  { id: 'concept-art',       label: 'Concept Art',                         modifier: 'professional concept art, matte painting, atmospheric perspective, environment design' },
  // Graphic / technical
  { id: 'blueprint',         label: 'Blueprint (พิมพ์เขียว)',                modifier: 'technical blueprint schematic, white linework on cyanotype blue background, dimension annotations, isometric exploded-view diagram, drafting precision' },
  { id: 'flat',              label: 'Flat Vector / Illustration',          modifier: 'clean flat vector illustration, minimal shading, geometric shapes, modern editorial style' },
  { id: '3d-render',         label: '3D Render (Unreal-style)',            modifier: 'modern 3D game render, Unreal Engine 5 lookdev, octane render, ray-traced lighting, subsurface scattering' },
  { id: 'isometric',         label: 'Isometric Diorama',                   modifier: 'tilted isometric 3D scene, miniature diorama feel, soft pastel palette, clean geometric forms, infographic-friendly composition' },
  { id: 'low-poly',          label: 'Low Poly',                            modifier: 'stylized low-poly 3D, faceted geometric shading, flat colored triangles, minimal lighting, clean studio backdrop' },
  { id: 'pixel',             label: 'Pixel Art (16/32-bit)',               modifier: 'detailed 32-bit pixel art, retro game sprite aesthetic, sharp limited palette' },
  // Niche / poster culture
  { id: 'risograph',         label: 'Risograph Print',                     modifier: 'risograph zine print aesthetic, two-color ink overlay, slight registration misprint, grainy paper, indie poster vibe' },
  { id: 'cyberpunk',         label: 'Cyberpunk Neon',                      modifier: 'cyberpunk sci-fi night city, neon signage glow, wet asphalt reflections, atmospheric haze, cinematic Blade-Runner color grading' },
  { id: 'retro-80s',         label: 'Retro 80s Synthwave',                 modifier: 'retro 80s synthwave, gradient grid horizon, magenta and cyan neon, chrome typography placeholder, VHS scanlines' },
  { id: 'vaporwave',         label: 'Vaporwave',                           modifier: 'vaporwave aesthetic, pastel pink and cyan, classical statue + glitch overlay, 90s mall imagery, soft VHS distortion' },
  { id: 'sketch',            label: 'Pencil Sketch',                       modifier: 'graphite pencil sketch on textured paper, cross-hatched shading, loose construction lines, study drawing feel' },
  { id: 'storyboard',        label: 'Storyboard Frame',                    modifier: 'pre-production storyboard frame, rough marker rendering, action arrows, camera-angle annotations, monochrome value sketch' },
];

// gpt-image-2 accepts only: 1024x1024, 1536x1024 (landscape), 1024x1536
// (portrait), or 'auto'. Each aspect picks the nearest valid bucket so the
// model doesn't reject the request — the visual aspect intent still reaches
// the model via the prompt's "Aspect ratio: …" line.
const ASPECT_RATIOS = [
  { id: '1:1',  label: 'Square 1:1',          size: '1024x1024' },
  { id: '4:3',  label: 'Standard 4:3',        size: '1536x1024' },
  { id: '3:4',  label: 'Portrait 3:4',        size: '1024x1536' },
  { id: '16:9', label: 'Widescreen 16:9',     size: '1536x1024' },
  { id: '9:16', label: 'Vertical 9:16',       size: '1024x1536' },
  { id: '21:9', label: 'Cinematic (auto)',    size: 'auto'      },
];

const RESOLUTIONS = [
  { id: '1k', label: '1K (fast, draft)',  modifier: 'high quality 1K resolution',                                                                       quality: 'medium' },
  { id: '2k', label: '2K (balanced)',     modifier: '2K resolution, sharp details',                                                                      quality: 'high'   },
  { id: '4k', label: '4K (high detail)',  modifier: '4K ultra-sharp resolution, fine detail',                                                            quality: 'high'   },
  { id: '8k', label: '8K (max detail)',   modifier: '8K resolution, masterwork-level detail, every fine texture rendered crisply',                       quality: 'high'   },
];

const ImageStudioPage = () => {
  window.useCOfficeRefresh?.();
  const [status, setStatus] = React.useState(null);
  const [images, setImages] = React.useState([]);
  const [prompt, setPrompt] = React.useState(IMAGE_PROMPT_PRESETS[0].value);
  const [provider, setProvider] = React.useState('codex-cli');
  const [mode, setMode] = React.useState('general');
  const [agentId, setAgentId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [selected, setSelected] = React.useState(null);

  // Top-level look-lock controls — apply to both general & character modes
  const [imgStyle, setImgStyle] = React.useState(IMAGE_STYLES[0].id);
  const [aspectRatio, setAspectRatio] = React.useState(ASPECT_RATIOS[0].id);
  const [resolution, setResolution] = React.useState('4k');
  // Reference image upload — passed to provider as a visual anchor.
  const [referenceUrl, setReferenceUrl] = React.useState('');
  const [refUploading, setRefUploading] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const onUploadReference = async (file) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setError('Reference image too large (max 12MB)'); return; }
    setRefUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const r = await fetch('/api/images/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'upload failed');
      setReferenceUrl(j.url);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRefUploading(false);
    }
  };

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

    const resMod = (RESOLUTIONS.find(r => r.id === resolution) || RESOLUTIONS[2]).modifier;
    const aspect = ASPECT_RATIOS.find(a => a.id === aspectRatio) || ASPECT_RATIOS[0];
    const promptText = [
      `A highly detailed ${styleMap[charStyle] || charStyle} character concept illustration.`,
      `Gender: ${charGender}.`,
      `Role/Profession: ${charRole}.`,
      `Outfit and Appearance: ${charOutfit}.`,
      `Weapon/Equipment: ${charWeapon}.`,
      `Signature theme color: ${charColor}.`,
      `Pose: heroic professional stance, expressive facial features, full body composition, centered portrait.`,
      `Aspect ratio: ${aspect.id} (${aspect.label}).`,
      `Quality: masterwork, crisp lines, vivid accents, game-ready art, ${resMod}.`
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
  const codexReady = providers.some((p) => p.provider === 'codex-cli' && p.connected);
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

  const decoratePrompt = (raw) => {
    const style = IMAGE_STYLES.find(s => s.id === imgStyle);
    const aspect = ASPECT_RATIOS.find(a => a.id === aspectRatio);
    const res = RESOLUTIONS.find(r => r.id === resolution);
    const tail = [
      style && `Style: ${style.modifier}.`,
      aspect && `Aspect ratio: ${aspect.id}.`,
      res && `Quality: ${res.modifier}.`,
    ].filter(Boolean).join(' ');
    if (!tail) return raw;
    return `${raw}\n\n--- LOOK LOCK ---\n${tail}`;
  };

  const generate = async () => {
    const bodyPromptRaw = prompt.trim();
    if (!bodyPromptRaw || busy) return;
    setBusy(true);
    setError('');
    try {
      const aspect = ASPECT_RATIOS.find(a => a.id === aspectRatio) || ASPECT_RATIOS[0];
      const res = RESOLUTIONS.find(r => r.id === resolution) || RESOLUTIONS[2];
      const r = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: decoratePrompt(bodyPromptRaw),
          provider,
          mode,
          agentId: mode === 'character' ? agentId : undefined,
          size: aspect.size,
          quality: res.quality,
          style: imgStyle,
          aspectRatio: aspect.id,
          resolution: res.id,
          referenceUrl: referenceUrl || undefined,
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
          <div className="sub">Generate through Codex CLI image_generation · store every result in the office image library</div>
        </div>
        <div className="topbar-actions">
          <span className={'chip ' + (codexReady ? '' : 'muted')}>
            <span className="dot"/> Codex CLI {codexReady ? 'ready' : 'not connected'}
          </span>
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
            <div className="right">Codex CLI / GPT Image 2</div>
          </div>

          <div className="image-mode-row">
            <button className={'btn ' + (mode === 'general' ? 'primary' : '')} onClick={() => setMode('general')}>General Asset</button>
            <button className={'btn ' + (mode === 'character' ? 'primary' : '')} onClick={() => setMode('character')}>Staff Avatar</button>
          </div>

          <div style={{ background:'rgba(255,191,0,0.05)', border:'1px solid rgba(255,191,0,0.2)', borderRadius:8, padding:'10px 14px', marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--gold)', marginBottom:8 }}>🔒 Look Lock — กำหนดสไตล์ / อัตราส่วน / ความละเอียด</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <label className="image-field">
                <span style={{ fontSize:11 }}>สไตล์ภาพ</span>
                <select value={imgStyle} onChange={(e) => setImgStyle(e.target.value)}>
                  {IMAGE_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="image-field">
                <span style={{ fontSize:11 }}>อัตราส่วน</span>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                  {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label className="image-field">
                <span style={{ fontSize:11 }}>ความละเอียด</span>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  {RESOLUTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
            </div>
            {/* Reference image — optional anchor passed to provider */}
            <div style={{ marginTop:10, paddingTop:10, borderTop:'1px dashed rgba(255,191,0,0.2)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {referenceUrl ? (
                  <div style={{ position:'relative' }}>
                    <img src={referenceUrl} alt="reference" style={{ width:64, height:64, objectFit:'cover', borderRadius:6, border:'1px solid var(--gold)' }}/>
                    <button onClick={() => setReferenceUrl('')} title="Remove reference"
                      style={{ position:'absolute', top:-6, right:-6, width:18, height:18, borderRadius:'50%', background:'var(--red)', color:'#fff', border:'none', cursor:'pointer', fontSize:11, lineHeight:1 }}>×</button>
                  </div>
                ) : (
                  <div style={{ width:64, height:64, borderRadius:6, border:'1px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, color:'var(--text-3)' }}>📎</div>
                )}
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--gold)', marginBottom:2 }}>Reference image (optional)</div>
                  <div style={{ fontSize:10, color:'var(--text-3)' }}>{referenceUrl ? 'Will be passed to the model as visual anchor.' : 'อัปโหลดรูปอ้างอิงเพื่อใช้ตั้งต้น (สี / องค์ประกอบ / ตัวละคร)'}</div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display:'none' }} onChange={(e) => { onUploadReference(e.target.files?.[0]); e.target.value = ''; }}/>
                <button className="btn ghost" disabled={refUploading} onClick={() => fileInputRef.current?.click()} style={{ fontSize:11, padding:'6px 10px' }}>
                  {refUploading ? '…' : referenceUrl ? 'เปลี่ยน' : '📤 อัปโหลด'}
                </button>
              </div>
            </div>
          </div>

          <label className="image-field">
            Provider
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="codex-cli">Codex CLI Image · GPT Image 2</option>
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
            {busy ? 'Generating...' : provider === 'codex-cli' ? 'Generate With Codex CLI' : 'Generate With Gemini'}
          </button>
          {busy && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:11, color:'var(--text-2)', marginBottom:4 }}>กำลังเจนรูป... (Codex CLI ใช้เวลา ~60–90 วินาที, Gemini ~10–20 วินาที)</div>
              <div style={{ height:6, borderRadius:999, background:'var(--bg-2)', overflow:'hidden', position:'relative' }}>
                <div style={{
                  position:'absolute', top:0, bottom:0, left:0, right:0,
                  background:'linear-gradient(90deg, transparent 0%, var(--accent-cyan) 50%, transparent 100%)',
                  backgroundSize:'200% 100%',
                  animation:'cofficeProgressShimmer 1.6s linear infinite',
                }}/>
              </div>
            </div>
          )}
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
