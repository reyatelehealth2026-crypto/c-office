# Contributing to C-Office

Thanks for taking the time to contribute. C-Office is a small, opinionated
project, so the bar for changes is "make the workspace clearer for the next
person who has to debug a Claude Code agent at 2 AM."

## Development setup

```bash
git clone https://github.com/reyatelehealth2026-crypto/c-office.git
cd c-office
npm install
npm run dev          # node --watch — auto-restart on server file changes
```

Open `http://127.0.0.1:7878`. Frontend `.jsx` is served from `public/` and
edits are picked up on browser reload — `node --watch` is **not** needed for
frontend changes.

Run the UI smoke test before opening a PR:

```bash
node scripts/ux-smoke.js
```

It boots a headless Chromium (Playwright must be installed globally), visits
every route at three viewports, and writes screenshots + a markdown report
to `tmp/ux-smoke/`.

## Project conventions

- **ESM only.** `package.json` has `"type": "module"`. Use `import`, no CommonJS.
- **No new runtime deps casually.** Two prod deps total (`express`, `chokidar`).
  The lack of a build step is a feature; keep it.
- **In-memory state.** Don't add a database without an explicit ask; clients
  tolerate restart-loss because JSONL replay covers the historical case.
- **New events need a `dedupeKey`.** Hooks and JSONL tail are the two ingestion
  paths and must not double-emit. See `server/util/dedupe.js`.
- **Persona display names live in `personas.js`.** Don't hard-code "Aira" /
  "Vivi" / etc. elsewhere — read them from the persona object so future
  renames stay localized.
- **Persona id ≠ display name.** Use ids in code (`nyx`, `lumen`, `echo`),
  display names only in UI.
- **Hook script must stay non-blocking.** `hooks/post-event.sh` runs inside
  the user's Claude Code process. Anything that can't finish in 400ms must be
  backgrounded with `&` + `disown` and exit 0.
- **Pricing constants** live in `server/mapping/pricing.js`. Add new model IDs
  there when Claude Code starts emitting them.

## Pull request checklist

- [ ] `node scripts/ux-smoke.js` passes (33/33 page renders, 0 console errors)
- [ ] No secrets committed — credentials live in `~/.c-office/credentials.json`
      (encrypted), never in code or env files
- [ ] No new runtime dependencies added (devDeps are fine when justified)
- [ ] CLAUDE.md updated if you changed an architecture-level invariant
- [ ] README.md updated if you added a user-facing feature

## Reporting issues

Please include:

1. What you ran (`npm run dev`, what page, what action)
2. What you expected vs. what you observed
3. Console errors from the browser (F12 → Console) and the server stdout
4. Output of `curl http://127.0.0.1:7878/api/state | jq '.sessions'` if the
   issue is about session/agent routing

## Security

If you find a security issue (token leak, code execution path, hook bypass),
do **not** open a public issue. Open a private security advisory through the
GitHub security tab instead.

## License

By contributing you agree that your contributions are licensed under the same
[MIT License](LICENSE) as the project.
