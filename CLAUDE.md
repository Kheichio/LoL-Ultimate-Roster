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

## Save slots
Three slots per gamemode, entirely independent, chosen from the main menu
(`menuScreen === 'slots'`). All of it lives in **`src/lib/utils/storage.js`**, which namespaces
every key by family — `lur_` → roster slot, `lurc_` → career slot — so no caller has to know
slots exist.

- **Slot 1 is the bare key.** Every save that predates slots is already slot 1; nothing was
  migrated and nothing can be lost migrating it. Slots 2 and 3 append `@2` / `@3`.
- `lur_sound_muted`, `lur_light_mode`, `lur_display_scale` are DEVICE preferences and are never
  namespaced. Namespacing them would reset the player's theme on every switch.
- `clearStorage()` is prefix-scoped, not `localStorage.clear()`: it erases every slot in both
  gamemodes and keeps device preferences.
- **Career** switches slot in place — `CareerShell` remounts and re-hydrates. **Roster does not**:
  `initGame()` runs once at boot and MERGES rather than resets, and the roster shell is deliberately
  never torn down, so a roster slot change calls `flushGame()`, sets a `sessionStorage` boot intent
  and reloads. `resetGameStores()` exists for the same reason and must be called before any
  `initGame()` that changes save.
- Always flush before switching: both savers are debounced, and a write in flight lands in whichever
  slot is active when the timer fires.
- Cloud sync (`stores/auth.js`) is one Firestore doc per user. The roster half tracks the **active
  slot only**; the career half (`v: 3`, `careers` field) backs up **every career slot that holds a
  save**, so careers transfer between devices. It lives in the same document deliberately — a
  separate collection would need a Firestore rules change and the rules here are published by hand.
- `exportCareerSlots()` / `importCareerSlots()` read and write **storage, never the store**. The
  career store is `blankCareer()` until `CareerShell` mounts, so uploading it from the menu would
  push an empty career over a real backup. Import refuses anything that is not a created career.
- Sizes are measured, not assumed: a finished 12-year career is ~64kb and three slots ~162kb of a
  1024kb document. `careerSmoke` reports this and fails if three slots would crowd out the roster
  save.

### Never persist a store that has not been loaded
`saveCareer`/`flushCareer` refuse to write an uncreated career over a saved one, and `writeSave` in
`game.js` refuses to write before `initGame()` has run. This is not defensive padding — the
save-slot picker called `flushCareer()` from the main menu, before `initCareer()` had ever run, so
opening the slot list and choosing your own career wrote a blank save over it and loaded the blank
back. **It destroyed real player saves.** A blank store means "nothing is loaded", never "no save
exists". Deliberate destruction still works: `resetCareer()` writes through `saveToStorage` directly.
The regression lives in `slotCheck` and was verified to fail without the guard.

### Ultimate Career
Create one pro and live their career: pick region, role, playstyle and signature champion, then
either start **Pre-Competitive at 13** (unsigned, weak, highest ceiling, unlimited training) or
**Academy Debut at 16** (signed, strong, lower ceiling, club-gated training). 40 weeks a year,
two splits, playoffs, MSI and Worlds, until retirement and a legacy score.

```
src/lib/career/
  constants.js    — 8 attributes, 5 roles + OVR weights, 5 regions, 20 playstyles, 173 champions,
                    10 genetic traits, ARCHETYPE_BIAS + the champion/playstyle fit rule,
                    both start paths, 40-week calendar, activities, rank ladder, 90 clubs
  ratings.js      — OVR maths, potential ceilings, gain curve, age curve, wages, market value
  teams.js        — rosters pulled from the card DB, team strength, schedules, standings
  training.js     — 24 drills; converts a minigame score into permanent attribute growth
  matchEvents.js  — 75 in-game decision events (15 per role), data only
  match.js        — match engine: decisions resolve against attributes; ~1/3 of the result.
                    Champion select (`rollDraft`) is rolled once per GAME, not per series:
                    signature / pocket / off-script, weighted by CHP and by how strong the
                    opponent is. It is the only place CHP does anything mechanical.
  economy.js      — 9 gear categories, consumables, 20 lifestyle items, 24 legacy perks,
                    the legacy exchange (repeatable trades + the monument ladder), sponsors, shop
  contracts.js    — scouting, offers, negotiation, transfers, role changes, promotion
  awards.js       — awards, milestones, legacy score, retirement
  events.js       — random weekly events and press interviews
  engine.js       — the week/season orchestrator (advanceWeek, doActivity, playoffs, rollover,
                    club momentum and offseason roster churn)
src/lib/stores/career.js          — the whole career state; saves to `lurc_career` (LOCAL ONLY,
                                    deliberately outside the Firebase cloud save)
src/lib/components/career/        — CareerShell + 9 screens + BracketView + CareerOverlay
src/lib/components/career/minigames/ — 8 training minigames + MinigameHost
```

**Attributes are stored fractionally on purpose.** Training moves them by tenths and `gainCurve()`
throttles hard near the ceiling, so rounding on write or on save-load stalls a career several
points short of its potential. Round at display time only. `potential` is the opposite — integral,
written only through `raisePotential()`, which clamps via `clampAttr`.

### The ceiling
`player.potential` is the ONE number that means "ceiling". Everything that raises the roof writes
into it rather than sitting beside it as a derived bonus, so training, the UI, wages, market value
and scouting can never disagree — and so `careerSmoke`'s hard `attrs <= potential` invariant keeps
holding. Five things move it:

| lever | size | where |
|---|---|---|
| **Genetic trait** | +2 to +12, once | `engine.revealTrait()` at a birthday |
| **Breakthrough split** | up to +3 a split, **+4 OVR per career** | `engine.checkBreakthrough()` at split close |
| **Evergreen** legacy perk | +3 to every ceiling | `economy.applyPermanentPerk()` |
| **Ascendant** legacy perk | +2 to every ceiling, needs Evergreen | `economy.applyPermanentPerk()` |
| **Performance Camp** consumable | +1 to every ceiling, **+3 OVR per career** | `economy.useConsumable()` |
| **Role change** | re-centres, usually down | `contracts.changeRole()` |

The two perks are +5 between them and carry no budget flag, because they are one-time unlocks and
therefore bounded by construction — unlike the Performance Camp, which is renewable and is why
`flags.boughtCeilingOVR` exists. Any NEW repeatable ceiling source needs its own career budget.

Both repeatable levers are bounded FOR THE CAREER, not merely priced. Gold and splits are renewable
and a ceiling is not: the first cut of each had no budget and took every smoke career to 94-99 in
everything. The budgets live in `flags.breakthroughOVR` / `flags.boughtCeilingOVR` and are asserted
by `careerSmoke`.

`environmentCap()` (the unsigned soft cap, 72) is a **0.15x throttle, not a wall** — an unsigned
player can grow past it, just slowly. Three UI strings used to claim otherwise. The Self-Made perk
writes `player.softCap`; read it through `economy.unsignedCapFor()`, never the bare constant.

### Genetic traits
One per career, rolled and revealed on the birthday named by the path's `revealAge` — 16 pre-comp,
18 Academy Debut, and never the age the career started on (`ratings.revealAgeFor()`). The late
reveal is the whole design: a trait visible at creation is a trait players restart careers for.
Trait ids are persisted like `player.champion`, so **never rename or delete one**.

### Champion select
Every game opens on a real choice: **three champions**, one click, no confirm. It runs before the
first decision of every game and a Bo5 is five of them, so it can never become a screen you read
twice. `rollDraft()` still owns it and CHP still decides the *shape* — a surviving signature puts
your own pick among the three, being banned out fills them from outside your style pool — but the
pick itself is now the player's (`draftPending` / `draftOption` / `chooseDraft`).

**Counter or blind** is decided by opponent strength, off the same `targeting` term that decides
whether your signature survives the ban phase: a stronger org scouts you, picks last and counters
you more often. On a blind pick the matchup term is not scored at all — you cannot be graded against
a lane you could not see.

Two terms feed `successChance()`, and they are built to **cancel out across a career**:
- **Matchup** is symmetric (`MATCHUP_STEP`), so a good lane pays exactly what a bad one costs.
- **Proficiency** is a *penalty that fades*, measured against `PROFICIENCY_NEUTRAL` rather than from
  zero: cold costs ~9%, mastery removes it and pays a little over. Mastery also damps a **losing**
  matchup only (`PROFICIENCY_MATCHUP_DAMP`) — knowing a champion is what lets you survive a counter,
  not what makes a good lane better.

This is not decoration. A pure bonus on either would inflate every match rating, and `careerSmoke`
fails a run outright above a 7.6 mean.

`player.proficiency` is `{ championId: gamesPlayed }` — raw counts, so the curve in `constants.js`
can be retuned without invalidating a save. Banked by `finishGame()` on **what was locked in**, not
on `player.champion` (a preference, not a record). The signature pick starts with a head start.

### Matchups
`ARCHETYPE_COUNTERS` in `constants.js` is **designed rock-paper-scissors, not scraped win rates** —
there is no real matchup data in this project and a 173x173 champion table would be thirty thousand
invented numbers. It runs on the 17 archetypes the comfort bonus and the fit rule already use, with
a small clamped tie-breaker from each champion's own `mods` (`laneEdge`) so two champions of one
archetype are not identical into the same lane.

**Authored one direction only.** `beats` is the whole table and the losing side is generated from
it, so the matrix cannot contradict itself — a pair listed both ways is a hard error in
`championCheck`, which also asserts no archetype only-wins or only-loses, bounds the net spread, and
checks that **every role contains a real answer to every champion in it**. All four of those fired
on the first draft of the table. If a genuine data source ever appears, replace
`ARCHETYPE_COUNTERS` and nothing else changes.

### Signature champions are gated by playstyle
`constants.championsForStyle(role, playstyle)` decides which champions you may main, derived from
`biasDistance(playstyle.bias, ARCHETYPE_BIAS[archetype])` — the same comparison the match engine
uses to pay the comfort bonus, so "fits your playstyle" and "gets comfort on your decisions" are the
same statement. `FIT_MAX` is 0.24, with a `STYLE_POOL_MIN` top-up and a guarantee that every
champion stays legal for *some* style in each of its roles. Mid-career switching is
`contracts.switchChampion()`, priced in CHP and form rather than gold. **Existing saves are
grandfathered — never auto-reassign a saved champion.**

### The legacy economy is priced against measured income
Legacy points are **not scarce** and the old board was written as if they were. Eight simulated
twelve-year careers retire holding **618 to 6,531 LP**; the thirteen-perk board cost **107 LP in
total**, i.e. it was bought out inside three years by a career that never won a trophy. The board is
now **24 perks / 8,910 LP** (`economy.PERK_BOARD_COST`), plus a **Legacy Exchange**: repeatable
trades whose price climbs `step` every purchase, and a four-rung **monument ladder** (4,350 LP) that
buys nothing mechanical and only adds to the retirement legacy score.

- **If awards.js ever retunes its payouts, re-measure before repricing.** `careerSmoke` prints
  `legacy economy` (perks owned, LP unspent, board cost) and the per-career `legacy` column. Those
  are the only honest source for these numbers.
- Monuments feed `awards.legacyScore()` but **not** `awards.earnedLegacyScore()`, which is what
  `hallOfLegendsEligible()` runs on. The induction is not for sale — same reason `LEGACY_WEIGHTS`
  gives `hall_of_legends` a weight of 0.
- **Every perk effect key must have a reader.** Five of them did not: `clutchBonus`, `intlBonus`,
  `chemistryBonus`, `valueMult` and the perk half of `offerBonus` were aggregated by `perkEffects()`
  and read by nothing, exactly like `ceilingBonus`/`unsignedCapBonus` before them. They are wired now
  (`match.stakesBonus`, `contracts.offerMultiplier`/`startingChemistry`, `player.valueMult`), and the
  reader for each key is listed in the comment above `LEGACY_PERKS`. `clutchBonus` and `intlBonus`
  are capped **separately** — one shared cap left Big Game Player doing nothing at Worlds for anyone
  who already owned the clutch perks.
- `valueMult` is written onto `player.valueMult` by `applyPermanentPerk()` rather than derived,
  because its only live reader is the `marketValue` store in `stores/career.js` and importing
  economy.js from there would be a cycle. Same trick as `player.softCap`.

### The room: teammates change and scale
Every org in the mode is a pure deterministic derivation of `(teamId, year)` out of the card
database, memoised in `teams._rosterCache`. **`career.club` is the single exception**, and it covers
only the club the player actually plays for:

- **`club.momentum`** (-1..1) is written weekly by `engine.tickClubMomentum()` from the last six
  results. It shifts every teammate a few rating points (`teams.teammateFormDelta`, per-seat bias so
  they do not all move together) and club strength by up to ±4 (`teams.clubStrengthDelta`). The
  feedback loop is bounded because the TARGET is a win rate, which cannot exceed 1 however strong the
  club gets; `MOMENTUM_PULL` controls how fast, not how far.
- **`club.roster`** maps a seat to a replacement card, written by `engine.runRosterChurn()` at the
  week-35→36 offseason transition. A bad season gets people cut, a good one gets one poached, and a
  signing older than `SIGNING_TENURE_YEARS` hands the seat back to the derived roster.
- **`club.teamId` is what scopes the block.** A mismatch with `player.clubId` means "this is not our
  club" and the whole thing is ignored, so a transfer resets momentum and roster history with no
  hook of any kind.
- **Nothing mutates a cached card.** `getTeamRoster()` hands the same object instance to Club.svelte,
  awards.js, match.js and `teamStrength()`; scaling by writing `card.rating` in place would leak into
  all of them and compound. `clubRosterFor()` returns fresh shallow copies, and `quality` is
  deliberately not re-derived from the shifted rating.
- `teamStrength(team, year)` stays blind to all of it — that is what keeps the league table stable
  between page loads. `teamStrengthWithPlayer()` and `clubStrengthFor()` are the club-aware readers.
- A signing is excluded by **name as well as id**: the card DB holds several prints of the same
  professional, so filtering on id alone let a club "replace" a player with an older card of himself.
  `clubRosterFor()` also re-resolves names **at the merge**, because half the roster is persisted and
  half is re-derived every year — `getTeamRoster()` de-duplicates against the seats *it* generated and
  cannot see a signing sitting in the save.
- **`season.schedule` is not in week order.** `ensureSeason()` rebuilds it as
  `[...freshSplitRows, ...carriedBracketRows]`, and MSI is carried into summer from weeks 17-19, so
  the array *tail* holds the oldest games of the half-year. Anything taking `.slice(-n)` off it must
  `.sort()` by week first. `tickClubMomentum()` and `formBaseline()` both do; a raw tail pinned three
  MSI results into the six-game momentum window from week 20 to Worlds, so a club that then won every
  league game still read as 50%.
- **`syntheticPlayer()`'s `strength` argument is a ROSTER MEAN, not a seat rating** — it adds
  `SYN_ROLE_TILT[role]` on top, and the five tilts sum to zero so the *mean* lands on the argument.
  `signingFor()` backs the tilt out. Passing a seat target straight through made every club sign a
  support two points worse and a mid two points better than asked, forever, purely by role.
- `runRosterChurn()` reads the roster it is about to churn from the **post-expiry** copy, not from the
  snapshot it entered with — otherwise a signing whose tenure just ran out is announced as retired and
  then replaced again in the same week, and priced against the dead card.

### Age-gated events
An event's `when` gate is the ONLY filter between the pool and the popup. Copy that references a
past age, a life stage, a club, or a stage appearance must gate on `player.age` / `isSigned` / real
participation **directly**, never on a proxy like games played — that is how a thirteen-year-old was
told about the friend they climbed with at fourteen. Helpers in `events.js`: `agedAtLeast`,
`agedBetween`, and `onBigStage`, which confirms a real bracket or fixture rather than just a
playoff-shaped calendar week.

**Verifying career changes** — `npm run build` passing proves very little here:
- `node tools/careerSmoke.mjs --seed 42` — plays full 12-24 year careers headlessly with ~30
  invariants asserted every week. Seeded, so failures reproduce. Also asserts the trait system
  (exactly one, never before its reveal age, never a dead id), both ceiling budgets, and that
  `player.champion` stays legal for `player.playstyle`. Its coverage block prints the trait
  distribution and mean ceiling earned/bought — a run where every career is a Legend is a tuning
  problem no pass/fail line will catch. It also prints **`roster churn`** (teammates replaced per
  career, from `flags.rosterMoves` — `club.changes` is wiped by a transfer and cannot be the lifetime
  count) and **`legacy economy`** (perks owned, LP unspent, board cost). Both carry inertness
  assertions: a roster system that never moves a seat and a momentum that never leaves zero are
  wired-and-dead, which is the failure this file exists to catch.
- `node tools/eventCheck.mjs` — the in-match decision pools (`matchEvents.js`). That file opens
  with a page of authoring discipline that was, until this existed, enforced entirely by a comment:
  3-or-4 options, a safest and a greedy play at least 0.12 of difficulty apart, safest averaging
  0.29 early / 0.36 mid / 0.44 late and never above 0.58. It also pins two things that drift
  silently — the **option bias distribution** (those triples ARE the comfort-pick bonus; see
  `championCheck`) and the **decision economy** (mean difficulty and net reward-minus-risk). Softer
  options raise every match rating, and `careerSmoke` fails outright above a 7.6 mean. `--list`
  prints every event id by role and phase. It also reports **pool depth against a Bo5**: one game
  draws `[early, early, mid, mid, late]`, so a series consumes 10/10/5 per role without repeats.
- `node tools/slotCheck.mjs` — the save-slot system, which nothing else touches. Asserts the thing
  that would be catastrophic and silent: **slot 1 resolves to the bare key**, so every save that
  predates slots is still there. Also isolation both ways, device prefs staying global, scoped
  delete and wipe, both stores round-tripping across a switch (which is what proves
  `resetGameStores()` actually resets), and that the picker's summary readers never switch slot.
- `node tools/careerRender.mjs` — Vite SSR-renders all 21 career components against 42 game
  states (unsigned rookie, null bracket, retired, damaged save, and one rot per field). The only
  check that exercises the Svelte templates. Note two extra loops beyond the screens matrix: the
  **Shop is rendered once per tab** (`initialTab`, a prop only this harness passes — `tab` is
  component-local, so every section but `gear` used to ship untested), and **BracketView is driven
  directly** against a dozen hand-built bracket shapes because it is a child of Calendar and gets no
  coverage from the screens loop. Only crashes fail the build; `wrong`/`warning` print and exit 0.
- `node tools/championCheck.mjs` — validates the 173-champion signature list and the playstyle fit
  rule in `constants.js`
  (`--list` prints the pool per role). Catches the three ways that data fails *silently*: an
  archetype outside `ARCHETYPE_BIAS` (the comfort-pick bonus never fires), a
  `mods` key outside `ATTR_KEYS` (the shim does nothing), and a removed or renamed id (career
  saves store `player.champion` as a bare string, so every save that picked it is orphaned). Also
  enforces the mod balance envelope, reports the comfort-bonus spread across archetypes, and — since
  signature picks became playstyle-gated — asserts that no playstyle is starved, that no champion is
  unpickable, and that a playstyle's blurb never names a champion the fit rule rejects. That last
  check is what caught the Frontline Tank being unable to pick Ornn or Sion. It has one known
  standing warning: `sup_roam` names Pyke, whose archetype really is closer to a lane bully.
- `node tools/clutchSim.mjs` — calibration gate for the CMP composure drill (ClutchGame). Parses
  the tuning table straight out of the component (a calibration that quotes numbers the component
  no longer has is worse than none) and simulates the real scoring maths. Asserts that skill pays at
  every tier, that the three tiers stay ordered, that a competent session lands near **0.50** — the
  same 1.0x reference `waveSim` holds the laning drill to — and that a near-perfect one lands in
  0.70–0.90 so there is somewhere left to go. It also asserts the thing the drill was actually fixed
  for: **`speed` / `half0` / `halfMin` / `shrink` must stay at their original values.** The drill was
  never too hard, it was *unreadable* — a near-perfect player scored 0.47 on the old build because a
  third of reps were decided by a 2x speed jump or a teleporting zone no input could beat.
  Telegraphing that interference is worth +0.34 on its own; the first cut of the fix ALSO softened
  the sweep and the zone and took a competent session to 0.63, which would have made CMP the
  cheapest attribute in the mode to max. Run it after touching any constant in `cfg()`.
- `node tools/waveSim.mjs` — calibration gate for the LNE laning drill (WaveControlGame). Sweeps
  press-error profiles against the crash-value ladder and asserts that the optimal stack size still
  moves with skill (or the drill's only decision has a lookup answer), that a competent session
  still lands near 0.50 (`scoreFactor()`'s 1.0x reference) at every tier, that raw training gain
  rises with drill tier, and that the crash band never overlaps the tower kill zone. Run it after
  touching any constant in that component's CFG block. Two lessons are baked into it: the drill it
  replaced shipped on an asserted calibration that was wrong by 5x, and this one's own first cut
  ranked stack sizes by CS rather than by the score the player is paid, which hid a scoring term
  that made capping out correct at every skill level. **Rank by score01, not by CS.**

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
