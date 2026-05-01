# C-Office Redesign: Professional AI Agent Hub

## Brief

Redesign C-Office from a gacha/RPG game theme into a **clean, professional AI Agent workspace** that makes it immediately obvious what the app does: **manage and dispatch tasks to AI agents**.

### Core Problems with Current Design
1. **Gacha game theme is confusing** — gacha rarity (SSR/SR/R/N), guild terminology, boss hunts distract from the actual purpose
2. **No task-focused workflow** — users can't see a "Marketing" agent and immediately click to give it a marketing task
3. **Too much visual noise** — purple/cyan/gold neon gradients, sparklines, collab graphs add clutter without value
4. **Agent roles are generic** — agents should have clear professional roles (Marketing, Content, Research, Code, Design, etc.)

### Target Design Direction

**Style: Warm Professional** — Think Linear meets Notion with a touch of warmth. NOT cold corporate. Warm, inviting, but clearly a productivity tool.

**Color Palette:**
- Background: Warm dark (#1a1a2e → #16213e range, or similar warm darks)
- Primary accent: A warm coral/orange (#FF6B6B → #EE5A24) for CTAs and highlights
- Secondary: Soft teal/cyan (#4ECDC4) for status indicators
- Text: Clean whites and warm grays
- Cards: Subtle glass-morphism with warm undertones

**Layout Principles:**
1. **Dashboard = Command Center** — Show agent cards by ROLE category (Marketing, Development, Research, Content, etc.)
2. **Click agent → Chat interface** — Clicking an agent opens a task input where you type what you need (e.g., "ค้นหาคอนเท้นมาแรงในเฟส, TT, X")
3. **Results panel** — Agent results appear inline, like a chat thread
4. **Sidebar navigation** — Clean, minimal sidebar with: Dashboard, Agents, Tasks, Notes, Settings

### Specific Pages to Redesign

#### 1. Dashboard (Main page)
- **Agent Grid by Category**: Group agents into role categories with clear labels
  - 📊 Marketing (marketing agent, social media agent)
  - 💻 Development (code agent, debug agent)
  - 🔬 Research (research agent, data agent)
  - ✍️ Content (writer agent, translator agent)
  - 🎨 Creative (design agent, image agent)
- **Quick Task Bar**: A prominent search-bar-like input at top: "Type a task for any agent..."
- **Recent Activity**: Clean timeline of recent agent runs and results
- **Stats Strip**: Token usage, active tasks, online agents — simple numbers, no sparklines

#### 2. Agent Detail View (when clicking an agent)
- **Chat-style interface**: Like ChatGPT but agent-specific
- **Pre-built action buttons**: For marketing agent: "🔍 Trending Content", "📊 Analytics Report", "📝 Content Calendar"
- **History**: Previous tasks and results for this agent
- **Agent info card**: Small sidebar showing agent capabilities, status, model

#### 3. Sidebar Navigation
- Remove game terminology (กิลด์, เควสต์, บอสฮันต์, etc.)
- Use clear labels: Dashboard, Agents, Tasks, Notes, Shop, Settings
- Keep it minimal — icon + label, no group headers

### Agent Personas (Professional Roles)
Replace the gacha-style agents with clearly defined professional roles:

1. **Orchestra** (Orchestrator) — Decomposes complex tasks and delegates
2. **Marketing Agent** — Trending content research, social media analysis
3. **Content Writer** — Blog posts, captions, articles
4. **Research Agent** — Deep research, data gathering, analysis
5. **Code Agent** — Code generation, debugging, review
6. **Design Agent** — Image generation, visual concepts
7. **Translator Agent** — Multi-language translation
8. **Data Agent** — Data analysis, spreadsheet work

### Key Interactions

1. **Dashboard → Agent**: Click agent card → opens agent chat view
2. **Agent Chat → Task**: Type task or click quick action → agent runs task
3. **Task Result → Follow-up**: Results appear as chat messages, user can ask follow-ups
4. **Trending Content Flow**: Marketing agent specifically has "Trending on Facebook/TikTok/X" quick action that searches for viral content

### Technical Constraints
- Must work with existing Express + React (CDN) setup
- No build step — JSX via Babel in-browser
- Keep existing API endpoints and data flow (SSE, /api/state, etc.)
- Keep existing window globals pattern (AGENTS, ACTIVITY, etc.)
- Thai + English bilingual labels (Thai primary, English secondary)

### Files to Modify
1. `public/styles.css` — Complete theme overhaul
2. `public/page-dashboard.jsx` — New dashboard layout
3. `public/page-agents.jsx` — Agent grid by role category
4. `public/components.jsx` — Sidebar, cards, common components
5. `public/page-detail.jsx` — Agent chat-style detail view
6. `public/data.js` — May need minor updates if data shape changes
7. `public/index.html` — Page title and meta updates
8. Optional CSS files (guild.css, adventure.css, cards.css, etc.) — Remove or replace

### Success Criteria
- A new user immediately understands: "This is where I manage AI agents for work"
- Clicking a marketing agent and asking for trending content feels natural
- The design is warm, professional, and inviting — not gamey
- Thai language is supported naturally throughout
