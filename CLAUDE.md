# LoL Ultimate Roster (v2)

Svelte + Vite rebuild of LoL Ultimate Team. Same game, modern architecture.

## Stack
- **Svelte** — component framework (compiled, no virtual DOM)
- **Vite** — dev server + bundler
- **Firebase** — auth (email/password), Firestore (saves/leaderboard/friends)
- **Tailwind CSS** — via CDN import in global.css (migrate to PostCSS later)

## Commands
- `npm run dev` — start dev server on port 3000
- `npm run build` — production build to dist/
- `npm run preview` — preview production build

## Architecture
```
src/
  main.js                  — Svelte mount point
  App.svelte               — root shell (Header + TabContent + modals)
  styles/global.css         — all CSS (tier system, animations, responsive)
  lib/
    stores/                 — Svelte writable stores (game state, UI state, toasts)
    components/
      card/Card.svelte      — single card component (replaces createCardElement)
      layout/               — Header, TabContent, ToastContainer
      modals/               — ConfirmModal, AuthPanel, CardInspectModal
      tabs/                 — one component per tab (migrate from v1)
    utils/                  — cards.js, storage.js, sound.js
    firebase/               — config.js (modular SDK)
  data/                     — database.js (card data, copy from v1)
```

## Gamemodes
The main menu (`stores/menu.js` → `menuScreen`) picks between two independent shells:
- **Ultimate Roster** (`menuScreen === 'game'`) — the original card-collection game. Header + TabContent.
- **Ultimate Career** (`menuScreen === 'career'`) — a single-player pro career. `CareerShell` replaces the whole shell.

### Ultimate Career
Create one pro and live their career: pick region, role, playstyle and signature champion, then
either start **Pre-Competitive at 13** (unsigned, weak, highest ceiling, unlimited training) or
**Academy Debut at 16** (signed, strong, lower ceiling, club-gated training). 40 weeks a year,
two splits, playoffs, MSI and Worlds, until retirement and a legacy score.

```
src/lib/career/
  constants.js    — 8 attributes, 5 roles + OVR weights, 5 regions, 20 playstyles, 62 champions,
                    both start paths, 40-week calendar, activities, rank ladder, 90 clubs
  ratings.js      — OVR maths, potential ceilings, gain curve, age curve, wages, market value
  teams.js        — rosters pulled from the card DB, team strength, schedules, standings
  training.js     — 24 drills; converts a minigame score into permanent attribute growth
  matchEvents.js  — 75 in-game decision events (15 per role), data only
  match.js        — match engine: decisions resolve against attributes; ~1/3 of the result
  economy.js      — gear, consumables, lifestyle, legacy perks, sponsors, the shop
  contracts.js    — scouting, offers, negotiation, transfers, role changes, promotion
  awards.js       — awards, milestones, legacy score, retirement
  events.js       — random weekly events and press interviews
  engine.js       — the week/season orchestrator (advanceWeek, doActivity, playoffs, rollover)
src/lib/stores/career.js          — the whole career state; saves to `lurc_career` (LOCAL ONLY,
                                    deliberately outside the Firebase cloud save)
src/lib/components/career/        — CareerShell + 9 screens + CareerOverlay
src/lib/components/career/minigames/ — 8 training minigames + MinigameHost
```

**Attributes are stored fractionally on purpose.** Training moves them by tenths and `gainCurve()`
throttles hard near the ceiling, so rounding on write or on save-load stalls a career several
points short of its potential. Round at display time only.

**Verifying career changes** — `npm run build` passing proves very little here:
- `node tools/careerSmoke.mjs --seed 42` — plays full 12-24 year careers headlessly with ~30
  invariants asserted every week. Seeded, so failures reproduce.
- `node tools/careerRender.mjs` — Vite SSR-renders all 20 career components against 31 game
  states (unsigned rookie, null bracket, retired, damaged save). The only check that exercises
  the Svelte templates.

## Migration Plan
1. Copy database.js from v1 into src/data/
2. Migrate one tab at a time: Welcome → Store → Club → Squad → Tournament → Season → etc.
3. Each tab becomes a Svelte component in src/lib/components/tabs/
4. Game logic (pack opening, combat, draft) lives in src/lib/utils/ as pure functions
5. Firebase modular SDK replaces compat CDN once npm package resolves

## Key Differences from v1
- State: Svelte stores (reactive) instead of global `let` variables
- Cards: `<Card>` component with props instead of `createCardElement()` function
- Tiers: CSS custom properties via `[data-quality]` selectors
- DB: Cached Map with O(1) lookups via `getCardById()`
- Saves: Debounced localStorage with structured keys (`lur_*` prefix)
