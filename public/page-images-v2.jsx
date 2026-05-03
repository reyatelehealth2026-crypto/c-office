/* Images Studio V2 — creative studio override.
   Keeps existing image endpoints while giving the user a clearer studio UI. */

const IX_PRESETS = [
  { label: 'Office Hero', value: 'Create a cinematic AI operations command center hero image, premium dark dashboard mood, agent workstations, soft neon cyan and violet accents, clean composition, no readable text, no watermark.' },
  { label: 'Staff Avatar', value: 'Create a full-body AI office staff avatar cutout, premium game character style, clear silhouette, centered pose, transparent or clean plain background, no text, no card frame.' },
  { label: 'UI Asset', value: 'Create a polished product-style dashboard visual asset for an AI workflow system, clean premium 3D illustration, useful for UI panel placement, no readable text, no watermark.' },
  { label: 'Guild Scene', value: 'Create a premium JRPG guild hall command room for AI agents, fantasy operations board, glowing mission table, cozy but high-tech, no readable text, no watermark.' },
];

const IX_STYLES = [
  { id: 'cinematic', label: 'Cinematic', mod: 'cinematic lighting, high-end key art, atmospheric depth, premium color grade' },
  { id: '3d', label: '3D Render', mod: 'modern 3D render, soft studio lighting, glossy materials, game UI asset quality' },
  { id: 'anime', label: 'Anime JRPG', mod: 'high-quality anime JRPG concept art, expressive cel shading, vivid fantasy accents' },
  { id: 'flat', label: 'Flat Vector', mod: 'clean flat vector illustration, editorial layout, minimal but premium' },
  { id: 'pixel', label: 'Pixel Art', mod: 'detailed 32-bit pixel art, sharp sprite aesthetic, retro game UI mood' },
  { id: 'photoreal', label: 'Photoreal', mod: 'photorealistic professional photography, natural depth of field, realistic material detail' },
];

const IX_ASPECTS = [
  { id: '1:1', label: 'Square', size: '1024x1024' },
  { id: '16:9', label: 'Wide', size: '1536x1024' },
  { id: '9:16', label: 'Vertical', size: '1024x1536' },
  { id: '4:3', label: 'Standard', size: '1536x1024' },
  { id: '3:4', label: 'Portrait', size: '1024x1536' },
];

const IX_RES = [
  { id: '1k', label: '1K Draft', quality: 'medium', mod: 'high quality 1K draft' },
  { id: '2k', label: '2K Balanced', quality: 'high', mod: '2K resolution, sharp detail' },
  { id: '4k', label: '4K Detail', quality: 'high', mod: '4K ultra-sharp detail, premium finish' },
];

const ixTime = (v) => {
  if (!v) return 'unknown';
  const ts = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(ts)) return 'recent';
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const ixImageUrl = (img) => img?.imageUrl || img?.url || img?.path || img?.href || (img?.name ? `/generated/images/${img.name}` : '');
const ixImagePrompt = (img) => img?.prompt || img?.metadata?.prompt || img?.meta?.prompt || '';

const IXImageTile = ({ img, selected, onSelect }) => {
  const url = ixImageUrl(img);
  return (
    <button className={'ux-image-tile ' + (selected ? 'is-selected' : '')} onClick={onSelect}>
      <div className="ux-image-preview">{url ? <img src={url} alt={img.name || 'generated image'} loading="lazy"/> : null}</div>
      <div className="ux-image-tile-name">{img.name || img.filename || 'generated image'}</div>
      <div className="ux-image-tile-meta"><span>{img.provider || 'image'}</span><span>{ixTime(img.createdAt || img.mtime || img.updatedAt)}</span></div>
    </button>
  );
};

const IXInspector = ({ img, onDelete }) => {
  if (!img) {
    return (
      <aside className="ux-image-panel ux-image-inspector ux-image-body">
        <UXEmptyState title="Select an image" body="Generated assets and uploads will show metadata here." />
      </aside>
    );
  }
  const url = ixImageUrl(img);
  const prompt = ixImagePrompt(img);
  const copyPrompt = () => navigator.clipboard?.writeText(prompt || '').catch(() => window.prompt('Copy prompt', prompt || ''));
  const copyUrl = () => navigator.clipboard?.writeText(location.origin + url).catch(() => window.prompt('Copy URL', url));
  return (
    <aside className="ux-image-panel ux-image-inspector">
      <div className="ux-image-head">
        <div className="ux-image-title-row">
          <h3 className="ux-image-title">Selected asset</h3>
          <UXStatusChip label={img.provider || 'image'} state="active" />
        </div>
        <div className="ux-image-subtitle">Inspect metadata, copy prompt, or remove the asset from library.</div>
      </div>
      <div className="ux-image-body ux-field-stack">
        <div className="ux-selected-image">{url ? <img src={url} alt={img.name || 'selected image'}/> : null}</div>
        <div className="ux-inspector-actions">
          {url && <a className="ux-soft-button" href={url} target="_blank" rel="noreferrer">Open</a>}
          <button className="ux-soft-button" onClick={copyUrl}>Copy URL</button>
          <button className="ux-soft-button" onClick={copyPrompt}>Copy prompt</button>
          <button className="ux-soft-button" onClick={() => onDelete?.(img)}>Delete</button>
        </div>
        <div className="ux-image-meta-grid">
          <div className="ux-image-meta-cell"><label>Name</label><b>{img.name || img.filename || 'image'}</b></div>
          <div className="ux-image-meta-cell"><label>Provider</label><b>{img.provider || 'unknown'}</b></div>
          <div className="ux-image-meta-cell"><label>Created</label><b>{ixTime(img.createdAt || img.mtime || img.updatedAt)}</b></div>
          <div className="ux-image-meta-cell"><label>Size</label><b>{img.size || img.bytes || '—'}</b></div>
        </div>
        <div className="ux-image-label">Prompt</div>
        <pre className="ux-prompt-box">{prompt || 'No prompt metadata found for this image.'}</pre>
      </div>
    </aside>
  );
};

const ImageStudioPageV2 = () => {
  window.useCOfficeRefresh?.();
  const [status, setStatus] = React.useState(null);
  const [images, setImages] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [provider, setProvider] = React.useState('codex-cli');
  const [mode, setMode] = React.useState('general');
  const [style, setStyle] = React.useState('cinematic');
  const [aspect, setAspect] = React.useState('1:1');
  const [res, setRes] = React.useState('4k');
  const [prompt, setPrompt] = React.useState(IX_PRESETS[0].value);
  const [referenceUrl, setReferenceUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef(null);

  const refreshStatus = React.useCallback(() => fetch('/api/images/status').then(r => r.json()).then(setStatus).catch(() => {}), []);
  const refreshLibrary = React.useCallback(() => fetch('/api/images/library').then(r => r.json()).then(j => setImages(Array.isArray(j.images) ? j.images : [])).catch(() => setImages([])), []);
  React.useEffect(() => { refreshStatus(); refreshLibrary(); }, [refreshStatus, refreshLibrary]);

  const providers = status?.providers || [];
  const providerReady = providers.some(p => p.provider === provider && p.connected);
  const filtered = images.filter(img => {
    const hay = `${img.name || ''} ${img.provider || ''} ${ixImagePrompt(img)}`.toLowerCase();
    return !query || hay.includes(query.toLowerCase());
  });
  const current = selected || filtered[0] || images[0] || null;

  const decoratedPrompt = () => {
    const st = IX_STYLES.find(s => s.id === style) || IX_STYLES[0];
    const ar = IX_ASPECTS.find(a => a.id === aspect) || IX_ASPECTS[0];
    const rq = IX_RES.find(r => r.id === res) || IX_RES[2];
    return `${prompt.trim()}\n\n--- LOOK LOCK ---\nStyle: ${st.mod}.\nAspect ratio: ${ar.id}.\nQuality: ${rq.mod}.`;
  };

  const generate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const ar = IX_ASPECTS.find(a => a.id === aspect) || IX_ASPECTS[0];
      const rq = IX_RES.find(r => r.id === res) || IX_RES[2];
      const r = await fetch('/api/images/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: decoratedPrompt(), provider, mode, size: ar.size, quality: rq.quality, style, aspectRatio: ar.id, resolution: rq.id, referenceUrl: referenceUrl || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Image generation failed');
      await refreshLibrary();
      if (j.image) setSelected(j.image);
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  };

  const uploadRef = async (file) => {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(file);
      });
      const r = await fetch('/api/images/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl, filename: file.name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      setReferenceUrl(j.url);
      await refreshLibrary();
    } catch (e) { setError(e.message || String(e)); }
    finally { setUploading(false); }
  };

  const deleteImage = async (img) => {
    if (!img?.name) return;
    if (!confirm(`Delete image "${img.name}"?`)) return;
    await fetch(`/api/images/library/${encodeURIComponent(img.name)}`, { method: 'DELETE' });
    if (selected?.name === img.name) setSelected(null);
    await refreshLibrary();
  };

  return (
    <div className="ux-images">
      <aside className="ux-image-panel ux-image-controls">
        <div className="ux-image-head">
          <div className="ux-image-title-row"><h3 className="ux-image-title">Prompt studio</h3><UXStatusChip label={providerReady ? 'ready' : 'setup'} state={providerReady ? 'active' : 'danger'} /></div>
          <div className="ux-image-subtitle">Generate dashboard assets, staff avatars, and creative UI visuals.</div>
        </div>
        <div className="ux-image-body ux-field-stack">
          <div className="ux-mode-row">
            <button className={'ux-mode-btn ' + (mode === 'general' ? 'is-active' : '')} onClick={() => setMode('general')}>General</button>
            <button className={'ux-mode-btn ' + (mode === 'character' ? 'is-active' : '')} onClick={() => setMode('character')}>Avatar</button>
          </div>
          <div className="ux-image-field"><label>Provider</label><select value={provider} onChange={e => setProvider(e.target.value)}><option value="codex-cli">Codex CLI Image</option><option value="nanobanana2pro">Nano Banana 2 Pro</option><option value="flashgen">Gemini Flash Gen</option></select></div>
          <div className="ux-image-field"><label>Style</label><select value={style} onChange={e => setStyle(e.target.value)}>{IX_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div className="ux-image-field"><label>Aspect</label><select value={aspect} onChange={e => setAspect(e.target.value)}>{IX_ASPECTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
            <div className="ux-image-field"><label>Quality</label><select value={res} onChange={e => setRes(e.target.value)}>{IX_RES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
          </div>
          <div className="ux-preset-grid">{IX_PRESETS.map(p => <button key={p.label} className="ux-preset-btn" onClick={() => setPrompt(p.value)}>{p.label}</button>)}</div>
          <div className="ux-image-field"><label>Prompt</label><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the image..." /></div>
          <div className="ux-reference-card">
            <div className="ux-reference-thumb">{referenceUrl ? <img src={referenceUrl} alt="reference"/> : '📎'}</div>
            <div><div className="ux-image-label">Reference image</div><div className="ux-image-subtitle">Optional visual anchor for style, layout, or character.</div></div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={e => { uploadRef(e.target.files?.[0]); e.target.value=''; }}/><button className="ux-soft-button" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading' : 'Upload'}</button>{referenceUrl && <button className="ux-soft-button" onClick={() => setReferenceUrl('')}>Clear</button>}</div>
          </div>
          {error && <UXErrorState title="Image action failed" body={error} />}
          <button className="ux-hero-button" onClick={generate} disabled={busy || !prompt.trim()}>{busy ? 'Generating...' : 'Generate image'}</button>
        </div>
      </aside>

      <main className="ux-image-panel ux-gallery-panel">
        <div className="ux-image-head">
          <div className="ux-image-title-row"><h3 className="ux-image-title">Asset library</h3><UXStatusChip label={`${images.length} assets`} state={images.length ? 'active' : 'muted'} /></div>
          <div className="ux-image-subtitle">Generated and uploaded images from the local C-Office library.</div>
        </div>
        <div className="ux-gallery-toolbar"><input className="ux-gallery-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search image name, provider, prompt..."/><button className="ux-soft-button" onClick={() => { refreshStatus(); refreshLibrary(); }}>Refresh</button></div>
        {filtered.length ? <div className="ux-gallery-grid">{filtered.map(img => <IXImageTile key={img.name || ixImageUrl(img)} img={img} selected={current?.name === img.name} onSelect={() => setSelected(img)} />)}</div> : <div className="ux-image-body"><UXEmptyState title="No images yet" body="Generate an asset or upload a reference to start the library." /></div>}
      </main>

      <IXInspector img={current} onDelete={deleteImage}/>
    </div>
  );
};

window.ImageStudioPage = ImageStudioPageV2;
