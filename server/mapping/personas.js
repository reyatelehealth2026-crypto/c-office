// 9 static personas for the gacha overlay.
// Live runtime fields (status, currentTask, derived stats) are merged on top
// in state.js — these definitions are the immutable visual identity.
//
// Each persona represents a *function*, not one specialist: the role, skills,
// and personality should reflect the full range of real subagents that map
// into this persona via PERSONA_RULES below.

export const PERSONAS = [
  // ─────────────────────────────────────────────────────────
  // 1 · Orchestra — Maestro (interactive sessions always land here)
  // ─────────────────────────────────────────────────────────
  {
    id: 'orchestra',
    name: 'Orchestra',
    role: 'Maestro · Lead Conductor',
    rarity: 'SSR',
    element: '👑',
    elementName: 'Command',
    avatarInitials: 'OC',
    image: '/images/Orchestra.png',
    gradient: 'linear-gradient(155deg, #fbbf24 0%, #f472b6 35%, #9d5cff 65%, #22d3ee 100%)',
    tagline: 'Main conductor — routes goals, delegates to the crew, and keeps everyone in harmony.',
    level: 60,
    power: 12400,
    personality: { creativity: 88, precision: 92, empathy: 90, speed: 82, autonomy: 95, collab: 98 },
    traits: ['Leader', 'Decisive', 'Harmonizer'],
    tone: 'Confident, warm, directive',
    skills: [
      { name: 'Goal decomposition', level: 10, cat: 'Core' },
      { name: 'Agent routing & delegation', level: 10, cat: 'Core' },
      { name: 'Conflict resolution', level: 9, cat: 'Core' },
      { name: 'Product strategy', level: 9, cat: 'Leadership' },
      { name: 'UX vision & planning', level: 8, cat: 'Leadership' },
      { name: 'Human-in-the-loop', level: 9, cat: 'Leadership' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 2 · Aira — Mentor / Knowledge Architect
  //     absorbs: corporate-training, study-abroad, book-co-author,
  //              developer-advocate, cultural-intelligence, zk-steward
  // ─────────────────────────────────────────────────────────
  {
    id: 'astra',
    name: 'Aira',
    role: 'Mentor · Knowledge Architect',
    rarity: 'SSR',
    element: '🎓',
    elementName: 'Education',
    avatarInitials: 'AI',
    image: '/images/Aira.png',
    gradient: 'linear-gradient(155deg, #fbbf24 0%, #f472b6 50%, #9d5cff 100%)',
    tagline: 'Designs learning journeys, course structures, developer enablement, and knowledge systems.',
    level: 47,
    power: 9420,
    personality: { creativity: 88, precision: 82, empathy: 92, speed: 62, autonomy: 78, collab: 85 },
    traits: ['Patient', 'Methodical', 'Learner-first'],
    tone: 'Warm, professorial, encouraging',
    skills: [
      { name: 'Curriculum & corporate training', level: 10, cat: 'Core' },
      { name: 'Developer advocacy', level: 9, cat: 'Core' },
      { name: 'Book & long-form authoring', level: 8, cat: 'Content' },
      { name: 'Study-abroad & career coaching', level: 8, cat: 'Mentorship' },
      { name: 'Cultural intelligence', level: 7, cat: 'Craft' },
      { name: 'Zettelkasten / knowledge graphs', level: 8, cat: 'Systems' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 3 · Luna — Scribe / Content Lead
  //     absorbs: content-creator, technical-writer, narrative-designer,
  //              proposal-strategist, executive-summary-generator,
  //              platform content (Zhihu/Bilibili/LinkedIn/Podcast/Xiaohongshu/…)
  // ─────────────────────────────────────────────────────────
  {
    id: 'lumen',
    name: 'Luna',
    role: 'Scribe · Content Lead',
    rarity: 'SSR',
    element: '✍️',
    elementName: 'Writing',
    avatarInitials: 'LN',
    image: '/images/Luna.png',
    gradient: 'linear-gradient(155deg, #f472b6, #9d5cff 60%, #22d3ee)',
    tagline: 'Crafts copy, docs, narratives, and long-form content across every surface and platform.',
    level: 44,
    power: 8980,
    personality: { creativity: 95, precision: 78, empathy: 88, speed: 82, autonomy: 72, collab: 80 },
    traits: ['Poetic', 'Precise', 'Bilingual'],
    tone: 'Warm, playful, writerly',
    skills: [
      { name: 'Copy & scriptwriting', level: 10, cat: 'Core' },
      { name: 'Technical documentation', level: 9, cat: 'Core' },
      { name: 'Narrative design', level: 9, cat: 'Craft' },
      { name: 'Proposal & executive summaries', level: 8, cat: 'Craft' },
      { name: 'Thai/English bilingual', level: 9, cat: 'Language' },
      { name: 'Multi-platform content (Zhihu/Bilibili/LinkedIn)', level: 8, cat: 'Distribution' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 4 · Vivi — Sentinel / Audit & Security Lead  (ROLE CHANGED)
  //     absorbs: security-engineer, code-reviewer, threat-detection,
  //              blockchain-security-auditor, compliance-auditor,
  //              legal-compliance, paid-media-auditor, accessibility-auditor,
  //              testing (api-tester, evidence-collector, reality-checker, results-analyzer)
  // ─────────────────────────────────────────────────────────
  {
    id: 'vex',
    name: 'Vivi',
    role: 'Sentinel · Audit & Security',
    rarity: 'SSR',
    element: '🛡️',
    elementName: 'Guardian',
    avatarInitials: 'VV',
    image: '/images/Vivi.png',
    gradient: 'linear-gradient(155deg, #22d3ee, #7c3aed 60%, #fbbf24)',
    tagline: 'Reviews code, audits contracts, hunts threats, enforces compliance, and breaks tests before users do.',
    level: 52,
    power: 10180,
    personality: { creativity: 60, precision: 98, empathy: 50, speed: 72, autonomy: 92, collab: 65 },
    traits: ['Rigorous', 'Skeptic', 'Paranoid'],
    tone: 'Direct, terse, no-bullshit',
    skills: [
      { name: 'Code review & secure coding', level: 10, cat: 'Core' },
      { name: 'Smart-contract audit', level: 9, cat: 'Core' },
      { name: 'Threat detection & SIEM', level: 9, cat: 'Intel' },
      { name: 'Compliance & legal review', level: 9, cat: 'Compliance' },
      { name: 'QA: evidence, reality, results', level: 8, cat: 'Testing' },
      { name: 'Accessibility & API testing', level: 8, cat: 'Testing' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 5 · Kira — Builder / Code Forge  (EXPANDED)
  //     fallback + explicit: backend, frontend, database, mobile, firmware,
  //              AI eng, data eng, solidity, wechat-mini-program, feishu,
  //              senior-dev, rapid-prototyper, software-architect, lsp-index
  // ─────────────────────────────────────────────────────────
  {
    id: 'kai',
    name: 'Kira',
    role: 'Builder · Code Forge',
    rarity: 'SR',
    element: '🔨',
    elementName: 'Build',
    avatarInitials: 'KR',
    image: '/images/Kira.png',
    gradient: 'linear-gradient(160deg, #9d5cff, #3b82f6 70%, #06b6d4)',
    tagline: 'Ships across stacks — web, mobile, firmware, blockchain, data pipelines, AI features.',
    level: 42,
    power: 8120,
    personality: { creativity: 80, precision: 88, empathy: 58, speed: 92, autonomy: 85, collab: 72 },
    traits: ['Pragmatic', 'Fast', 'Polyglot'],
    tone: 'Terse, engineer-direct',
    skills: [
      { name: 'Full-stack web (React/Next/TS)', level: 10, cat: 'Frontend' },
      { name: 'Backend & API architecture', level: 9, cat: 'Backend' },
      { name: 'Database design & optimization', level: 9, cat: 'Data' },
      { name: 'Data engineering & pipelines', level: 8, cat: 'Data' },
      { name: 'Mobile & embedded firmware', level: 8, cat: 'Native' },
      { name: 'Blockchain & Solidity', level: 7, cat: 'Web3' },
      { name: 'AI/ML engineering', level: 8, cat: 'AI' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 6 · Miku — Growth / Multi-platform Strategist  (EXPANDED)
  //     absorbs: all social platforms (TikTok/Douyin/Kuaishou/Instagram/Reddit/
  //              Twitter/Weibo/LinkedIn/Xiaohongshu/Zhihu/Bilibili/Podcast),
  //              paid media (PPC/paid-social/programmatic/ad-creative),
  //              sales (coach/deal/discovery/engineer/outbound/pipeline/account),
  //              commerce (cross-border/china-ecommerce/private-domain),
  //              SEO, app-store, growth-hacker, carousel, recruitment,
  //              regional (french-consulting, korean-business, presales)
  // ─────────────────────────────────────────────────────────
  {
    id: 'mira',
    name: 'Miku',
    role: 'Growth · Multi-platform Strategist',
    rarity: 'SR',
    element: '📈',
    elementName: 'Growth',
    avatarInitials: 'MK',
    image: '/images/Miku.png',
    gradient: 'linear-gradient(160deg, #f472b6, #ef4444 70%, #fbbf24)',
    tagline: 'Runs social, ads, sales, and commerce playbooks — from TikTok to TikTok Shop to LinkedIn ABM.',
    level: 38,
    power: 7580,
    personality: { creativity: 92, precision: 76, empathy: 85, speed: 88, autonomy: 74, collab: 90 },
    traits: ['Audience-first', 'Trend-aware', 'Data-curious'],
    tone: 'Energetic, persuasive',
    skills: [
      { name: 'Short-video & social (TikTok/Douyin/Kuaishou)', level: 9, cat: 'Core' },
      { name: 'Community (Reddit/Twitter/Weibo/LinkedIn)', level: 8, cat: 'Core' },
      { name: 'Paid media (PPC/paid-social/programmatic)', level: 9, cat: 'Paid' },
      { name: 'SEO & app-store optimization', level: 8, cat: 'Organic' },
      { name: 'Sales engineering & pipeline', level: 8, cat: 'Sales' },
      { name: 'Livestream & commerce ops', level: 7, cat: 'Commerce' },
      { name: 'Cross-border & regional', level: 7, cat: 'Commerce' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 7 · Emi — Studio / Visual Craft  (EXPANDED)
  //     absorbs: video-editing, blender, visual-storyteller, design-ui,
  //              design-brand, image-prompt, whimsy, inclusive-visuals,
  //              game (designer/audio/level/technical-artist/narrative),
  //              godot/unity/unreal/roblox, xr, visionos, macos-spatial,
  //              terminal-integration
  // ─────────────────────────────────────────────────────────
  {
    id: 'echo',
    name: 'Emi',
    role: 'Studio · Visual Craft',
    rarity: 'SR',
    element: '🎨',
    elementName: 'Visual',
    avatarInitials: 'EM',
    image: '/images/Emi.png',
    gradient: 'linear-gradient(160deg, #34d399, #06b6d4 70%, #6366f1)',
    tagline: 'Video, UI, 3D, games, XR — anything visual, spatial, or aesthetic.',
    level: 34,
    power: 6820,
    personality: { creativity: 92, precision: 84, empathy: 72, speed: 80, autonomy: 74, collab: 76 },
    traits: ['Visual', 'Meticulous', 'Tasteful'],
    tone: 'Quiet, detail-driven',
    skills: [
      { name: 'Video editing & motion graphics', level: 9, cat: 'Video' },
      { name: 'UI & brand design', level: 9, cat: 'Design' },
      { name: 'Image generation & prompting', level: 8, cat: 'Design' },
      { name: '3D & real-time (Blender/Unity/Unreal/Godot)', level: 8, cat: '3D' },
      { name: 'Game design & level craft', level: 8, cat: 'Games' },
      { name: 'XR, visionOS & spatial computing', level: 7, cat: 'Spatial' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 8 · Nana — Intel / Insights Analyst  (REGEX FIXED)
  //     absorbs: trend-researcher, feedback-synthesizer, search-query-analyst,
  //              tracking-specialist, analytics-reporter, ux-researcher,
  //              performance-benchmarker, tool-evaluator, experiment-tracker,
  //              model-qa, finance-tracker, data-consolidation,
  //              sales-data-extraction, report-distribution, academic-*
  // ─────────────────────────────────────────────────────────
  {
    id: 'nyx',
    name: 'Nana',
    role: 'Intel · Insights Analyst',
    rarity: 'R',
    element: '🔍',
    elementName: 'Intel',
    avatarInitials: 'NN',
    image: '/images/Nana.png',
    gradient: 'linear-gradient(160deg, #22d3ee, #3b82f6)',
    tagline: 'Researches trends, analyzes data, benchmarks models, and pulls signal from noise.',
    level: 28,
    power: 5420,
    personality: { creativity: 72, precision: 92, empathy: 58, speed: 85, autonomy: 82, collab: 68 },
    traits: ['Curious', 'Skeptical', 'Thorough'],
    tone: 'Clinical, bulleted, sourced',
    skills: [
      { name: 'Trend & market research', level: 9, cat: 'Core' },
      { name: 'Analytics & reporting', level: 9, cat: 'Core' },
      { name: 'UX research & feedback synthesis', level: 8, cat: 'Research' },
      { name: 'Performance benchmarking', level: 8, cat: 'Data' },
      { name: 'Model QA & tool evaluation', level: 7, cat: 'Data' },
      { name: 'Finance & data tracking', level: 7, cat: 'Data' },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // 9 · Ori — Operations / DevOps Lead  (EXPANDED)
  //     absorbs: devops-automator, sre, incident-response, infra-maintainer,
  //              git-workflow, autonomous-optimization, mcp-builder,
  //              workflow-architect/optimizer, jira-workflow, project-shepherd,
  //              project-manager (senior/sprint), studio-ops/producer,
  //              automation-governance, accounts-payable, agentic-identity-trust,
  //              identity-graph, support-responder
  // ─────────────────────────────────────────────────────────
  {
    id: 'orbit',
    name: 'Ori',
    role: 'Operations · DevOps Lead',
    rarity: 'R',
    element: '🛰️',
    elementName: 'Ops',
    avatarInitials: 'OR',
    image: '/images/Ori.png',
    gradient: 'linear-gradient(160deg, #94a3b8, #64748b 70%, #3b82f6)',
    tagline: 'Keeps the lights on — deploys, workflows, incidents, project flow, and payment ops.',
    level: 26,
    power: 4920,
    personality: { creativity: 58, precision: 92, empathy: 72, speed: 88, autonomy: 78, collab: 94 },
    traits: ['Reliable', 'Connector', 'Calm-under-fire'],
    tone: 'Friendly dispatcher, dependable',
    skills: [
      { name: 'DevOps & infrastructure', level: 9, cat: 'Core' },
      { name: 'Incident response & SRE', level: 9, cat: 'Ops' },
      { name: 'Workflow automation & governance', level: 9, cat: 'Automation' },
      { name: 'Project management (Jira/sprint/studio)', level: 8, cat: 'PM' },
      { name: 'Git workflow & MCP builder', level: 7, cat: 'Tooling' },
      { name: 'Finance & payments ops', level: 7, cat: 'Finance' },
    ],
  },
];

export const PERSONAS_BY_ID = new Map(PERSONAS.map(p => [p.id, p]));

// Persona routing rules — evaluated in order, first match wins.
// Most specific functional categories come first so that ambiguous multi-word
// agent names (e.g. "paid-media-search-query-analyst" → Nana not Miku) route
// to the *functional* persona rather than the surface keyword.
const PERSONA_RULES = [
  // Vivi — security, audit, compliance, review, testing
  {
    match: /(security|audit|compliance|threat-detect|code-review|review|legal-compliance|evidence-collector|reality-checker|api-tester|accessibility-auditor|test-results-analyzer|vex|vivi)/i,
    persona: 'vex',
  },

  // Nana — research, analytics, intel, benchmarking, trends
  {
    match: /(trend-researcher|feedback-synthesizer|search-query-analyst|tracking-specialist|tracking-measurement|analytics-reporter|ux-researcher|performance-benchmarker|tool-evaluator|experiment-tracker|model-qa|data-consolidation|data-extraction|report-distribution|finance-tracker|\banalyst\b|\btrend\b|\bresearch\b|academic-|explore|recon|\bnyx\b|\bnana\b)/i,
    persona: 'nyx',
  },

  // Ori — devops, infra, ops, workflow, PM, governance, payments
  {
    match: /(devops|incident-response|\bsre\b|infrastructure-maintainer|infrastructure|git-workflow|autonomous-optimization|mcp-builder|lsp-index|workflow-architect|workflow-optimizer|jira-workflow|project-shepherd|project-manager|project-management|sprint-prioritizer|studio-operations|studio-producer|automation-governance|accounts-payable|agentic-identity|identity-graph|support-responder|\bops\b|orbit|\bori\b)/i,
    persona: 'orbit',
  },

  // Aira — education, training, mentorship, knowledge systems
  {
    match: /(corporate-training|curriculum|course|training|study-abroad|book-co-author|developer-advocate|cultural-intelligence|zk-steward|teach|tutor|mentor|astra|\baira\b)/i,
    persona: 'astra',
  },

  // Luna — writing, content, narrative, copy, docs
  {
    match: /(content-creator|content-writer|content-strategist|technical-writer|narrative-designer|\bnarrative\b|\bcopy\b|\bscribe\b|executive-summary|proposal-strategist|fb-content|thai-content|bilibili-content|podcast-strategist|zhihu|xiaohongshu|linkedin-content|wechat-official|document-generator|lumen|\bluna\b)/i,
    persona: 'lumen',
  },

  // Emi — visual, video, design, games, XR, spatial
  // Match BOTH slug form (design-ui) AND display-name form (ui-designer)
  {
    match: /(short-video-editing|video-editing|\bvideo\b|\bvideo-editor|blender|visual-storyteller|inclusive-visuals|design-ui|\bui-designer|\bux-designer|design-brand|\bbrand-guardian|design-image-prompt|\bimage-prompt|design-whimsy|\bwhimsy|motion|technical-artist|game-designer|game-audio|level-designer|godot|\bunity-|\bunreal-|\broblox-|\bxr-|visionos|macos-spatial|terminal-integration|\becho\b|\bemi\b)/i,
    persona: 'echo',
  },

  // Miku — social, growth, marketing, sales, paid, commerce
  {
    match: /(tiktok|douyin|kuaishou|weibo|reddit|twitter|instagram|livestream-commerce|carousel|growth-hacker|growth-engine|ai-citation|app-store-optimizer|seo-specialist|baidu-seo|social-media-strategist|paid-social|paid-media|\bppc\b|programmatic|ad-creative|outbound-strategist|account-strategist|salesforce|pipeline-analyst|deal-strategist|discovery-coach|sales-coach|sales-engineer|recruitment|china-ecommerce|cross-border|private-domain|presales-consultant|supply-chain|french-consulting|korean-business|behavioral-nudge|\bsales\b|\bmarketing\b|mira|\bmiku\b)/i,
    persona: 'mira',
  },

  // Orchestra — planners / product / UX vision / agent orchestrators
  {
    match: /(\bplan\b|product-manager|design-ux-architect|\bux-architect\b|agents-orchestrator|orchestrator)/i,
    persona: 'orchestra',
  },

  // Kira — default: any engineering/code agent not caught above
];

/**
 * Map a Claude Code subagent_type to one of the 9 personas.
 * Main interactive sessions always map to Orchestra.
 *
 * subagent_type can arrive as "Content Creator" (display name) OR
 * "marketing-content-creator" (slug). Normalize both to the slug form
 * so a single rule set matches both.
 */
export function mapPersona(subagentType, sessionKind) {
  if (sessionKind === 'interactive' || !subagentType) return 'orchestra';
  const norm = String(subagentType).trim().toLowerCase().replace(/\s+/g, '-');
  if (PERSONAS_BY_ID.has(norm)) return norm;
  const direct = PERSONAS.find(p => {
    const name = p.name.toLowerCase().replace(/\s+/g, '-');
    return name === norm || p.avatarInitials?.toLowerCase() === norm;
  });
  if (direct) return direct.id;
  for (const r of PERSONA_RULES) if (r.match.test(norm)) return r.persona;
  return 'kai';
}
