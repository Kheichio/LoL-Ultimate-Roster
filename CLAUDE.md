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
  constants.js    — 8 attributes, 5 roles + OVR weights, 6 regions, 20 playstyles, 173 champions,
                    10 genetic traits, ARCHETYPE_BIAS + the champion/playstyle fit rule,
                    both start paths, 40-week calendar, activities, rank ladder, 108 clubs
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

**A second signature needs a SCREEN, not just a slot.** `economy.signatureSlots()` derives capacity
from the Second Signature (310 LP) and Third Signature (430 LP) perks, `contracts.addSignature()` /
`dropSignature()` spend and release one, and `match.signatureIds()` has always read
`player.extraChampions` into the draft — and for a while **every one of those was correct and none
of them had a caller**. Nothing in `src/lib/components` imported the designate family, so
`extraChampions` could never leave `[]` and 740 legacy points bought a slot no player could fill.
The comment on `signatureState()` even said "Read by the Dossier so an unused slot is visible", and
that reader did not exist. It lives in `CareerDossier.svelte` now, inside the Signature Pick panel,
owner-only and hidden until a slot is actually owned. That last condition is why the render harness
could not have caught it either: no ordinary fixture owns the perks, so `careerRender` drives five
`cd-sig-*` shapes with `mine: true` and `inventory.perks` populated. **A perk whose only proof is
the model layer is a perk nobody can spend** — the same failure this perk's own rewrite was written
to fix, one layer further up.

### Languages and moving region
Six regions, four working languages, and **`REGION_LANGUAGE` maps LEC, LCS and LCP all to `en` on
purpose**. The asymmetry is the whole mechanic: a European takes an LCS or an LCP offer with nothing
to learn, a Korean has to study English to move west at all, and anybody who is not Korean has to
study Korean for the LCK. One language per region would have priced every move identically and made
the system a tax rather than a decision.

`player.languages` is `{ languageId: 0..100 }` and **fractional, for the same reason `player.attrs`
are**: immersion pays 1.1 a week and a lesson pays a decaying curve, so rounding on write or on
save-load parks a language short of the band it earned. **Nothing writes a rounded level.** The
Transfers panel, the week log line and `signingBlock`'s reason string all round at the point they
print. Language ids are persisted save data exactly like champion and trait ids: **never rename or
delete one.**

Two gates, deliberately different shapes:
- **HARD** - `contracts.signingBlock()` clause (b2). A club whose league works in a language you are
  under `LANGUAGE_SIGN_MIN` (40) in will not sign you at all. `'ALL'` is NEVER blocked:
  `languageForRegion()` returns null for it and for anything unknown, `normTeam()` defaults an
  unknown club's region to `'ALL'`, and the compulsory first-club ladder runs entirely through the
  amateur sides - careerSmoke hard-fails a run where a precomp career is never signed by anybody.
  The function also opens with `if (t.id === p.clubId) return { blocked: false }`, which is inert
  today and exists so the language rule can never evict a player from a room he is already sitting
  in. A signing gate is a rule about ARRIVING somewhere.
- **SOFT** - `contracts.scoutInterest()`. Fluency buys back `LANGUAGE_INTEREST_REFUND` (0.7) of
  `FOREIGN_REGION_PENALTY`, so a foreign club runs -14 at nothing and -4.2 at fluent. At zero
  fluency the arithmetic is EXACTLY what it always was, which is what keeps every save that predates
  languages priced where it was. Raising interest here also raises the wage, the years, the signing
  bonus and the release clause - `buildOffer()` derives all four from it - and that is intended in
  this one case: a club that can talk to you is buying a player, not a project. **Call FREQUENCY is
  a different thing and stays in `generateOffers()`** (`FLUENT_CALL_RATE_BONUS`, worth exactly 1x at
  zero fluency), because interest reprices the entire offer sheet and frequency does not.

Four things move a level, and only one of them is a button. `engine.doLanguage()` is the `'language'`
activity (`LANGUAGE_STUDY_BASE`, curved by the room left, by youth and by KNW; ~6 lessons to the
signing gate, 14 to fluent, 25 to 100). `startCareerWeek` adds
`LANGUAGE_IMMERSION_WEEKLY * (1 - level/LANGUAGE_MAX)` for the league you actually play in - living
somewhere teaches it to you whether you study or not, which is what makes an existing foreign
signing converge instead of sitting on whatever the arrival boost gave it. **That step sits BEFORE
the four condition steps, never inside them**: form drift, seat morale pull, purchased floors and
`tickBurnout` are one ordered block and a language is not a condition meter.
`contracts.acceptOffer()` adds `LANGUAGE_ARRIVAL_BOOST` in the SAME `career.update` that writes the
contract, and strictly after the hard gate ran when the offer was built, so the crash course can
never be what got anybody signed. And an event option may pay a `language` effect, capped at
`CAP.language` (8) in either direction - a shade under one tutored lesson at level 0, so an event can
nudge a language and can never substitute for the activity that teaches one.

**Grandfathering lives in `hydrate()` and is the part worth reading twice.** There is no version
gate and no `migrate()`, so a save written before this change carries no `player.languages` key at
all - and every one of those careers is already from somewhere and most are already under contract
somewhere. When the RAW save carried no map, hydrate seeds `languageForRegion(player.region)` and
`languageForRegion(player.contract.region)` to `LANGUAGE_MAX`. Loading them with an empty map would
have invented a problem they never had: unable to renew, and unable to justify the club they have
played three years for. It reads `player.contract.region` - a plain persisted string - rather than
resolving the club through teams.js, because `stores/career.js` imports nothing from there but
`teamsInRegion` / `clearTeamCaches` and this is not worth widening that for. One-way and one-shot:
every save written since carries the map, so it cannot fire twice.

**`player.region` is where you are FROM and is never rewritten by a transfer** - four modules read
it as nationality. `player.contract.region` is where you WORK, and every language gate reads the
second against the first. events.js keeps `abroad()` and `workLang()` for exactly that distinction,
because "you cannot follow the review" is a lie told to a player who grew up speaking it.

Measured on `--seed 42`: 26.4 lessons a career, a mean best non-home level of 91.8/100, and 8 of 8
careers signing outside their own region with 7 of those crossing a language boundary. careerSmoke
prints `languages` and `moving region`, and fails the run outright if no lesson ever completes or no
career ever raises a second language - a gate nobody can pass and a gate nobody ever needs to pass
look identical from the outside.

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

### The season is a real competition, not a backdrop
Four things used to make the league table fiction, and they are fixed together because
each one hides the others.

- **There is ONE fixture list per division per split.** `teams.divisionRounds(c)` is a circle-method
  double round robin seeded by `hash32('rr:'+region+':'+tier+':'+year+':'+split)`, so it is stable
  across page loads. `generateSchedule()` is a PROJECTION of it and `simulateAIWeek()` plays the
  pairs the player is not in. Before this, every other club's games were invented on the spot with
  fresh random pairings each week, one club sat out whenever the pool was odd, and the simulation
  ran in all 40 weeks while fixtures existed in 18.
- **The player's result is MIRRORED** onto the opponent in `completeMatch` — league rows only, never
  bracket ties. Without it every opponent silently lost the two games a season they played the
  player. The `rows[i].played` guard is the idempotency proof; do not add a second one.
- **The player's own table row is counted off the SCHEDULE**, excluding `kind === 'bracket'`.
  `season.wins` counts playoff, MSI and Worlds games too, and MSI is carried into summer, so
  reading it put the player several games ahead of a division that had played the same fixtures.
- Measured: a 70%-win-rate player used to seed 7th on 18 games against AI sides on 23-26 and miss
  the cut. `regional_champ` rose 63→76 and `split_mvp` **12→65** when this landed.

**Match format is per region.** `constants.regularBestOf(regionId, tier)` — LCK, LPL and LCP play a
Bo3 regular season, LEC, LCS and CBLOL a Bo1, and **tier 3 is always Bo1** because the amateur
circuit is scrims. A series is ONE row in the table however many games it took. When this was added,
`match.stakesBonus()` still fired its clutch-perk arm on `bestOf >= 3`, which would have paid every
owner of the clutch perks their full knockout premium in every ordinary league game across two
thirds of a career — it now reads `>= 5`, because a Bo5 is only ever a knockout and a Bo3 no longer
implies anything. Measured against an all-Bo1 control: Bo3 moves the mean match rating +0.04, from
the series-win bonus alone, against a 7.6 hard-fail line.

### A season belongs to the club that played it
`season.clubId` / `season.clubTier` are stamped by `ensureSeason()` when the fixture list is drawn,
and `closeSplit()` files the history row, the league placement and every award under **that**, never
under `player.clubId`.

The two are not the same thing, because a split is BANKED long after its last game: spring closes at
the MSI boundary (week 17) and summer inside `rolloverYear()` (week 40→1), while the transfer window
is weeks 36-40 and academies call an amateur-rostered player all year. Reading the live club credited
a whole season, its placement and its trophies to a club the player had never played a game for.

**`ensureSeason()` only redraws in `preseason`, `spring` and `summer`.** The stamp carries the club
id so a transfer redraws the fixture list, which is right while games remain and destructive once
they do not — a move in the playoffs or the window rebuilt the block and zeroed a finished season
*before* it was written down. Measured: a 13-8 summer filed as **"0-0, G2 Esports"** for a player who
never played for them, with `regional_champ` and `domestic_double` re-credited to the new club.

Consequences worth knowing:
- Between a move and the next drawing phase the block legitimately holds the **old** club's fixtures
  (or a free agent's — the stamp reads `year:split:free`). Those rows are not wrong, they are simply
  not the player's any more, so anything validating a schedule must first check
  `season.clubId === player.clubId` and skip when it does not.
- **Promotion runs inside `closeSplit()`**, so at weeks 17-19 the spring split is already closed,
  `season.split` still says `spring`, and `player.clubId` is the main team the academy player was
  just promoted to. Filing spring under the academy is correct.
- `careerSmoke` asserts both halves (`histclub`, `histempty`) by recording which club a split was
  played for during `spring`/`summer` weeks only, and comparing it to the history row at retirement.
  Both fired on the first run; `histclub` then caught a *second* case in spring that the first fix
  had missed.

### Tournaments last as long as their window
`openBracket()` used to run the entire tournament on the phase-change tick: a player who reached the
final played a quarter, a semi and a final — fifteen games of Bo5 — inside week 14, and weeks 15-16
were empty. Rounds are now pinned to weeks.

- `bracket.window` and `bracket.totalRounds` are written at open and persisted, so a save reloaded
  mid-tournament resumes on the right week. `roundWeekFor()` spreads rounds across the window with
  the FINAL always on its last week.
- `stepBracket(force)` refuses a round whose week has not arrived; `tickBracket()` in `advanceWeek`
  knocks on the door each week. **`force` is not optional garnish** — `handlePhaseChange` calls
  `forceFinishBracket()` when the calendar leaves a bracket phase, because an unfinished summer
  bracket never awards the championship points that decide who goes to Worlds.
- **The field must fit its window**: `openBracket` trims to `2^(window weeks)`, and a club that
  qualified takes the last slot rather than being cut after the news post said it was going. This
  trims nothing today — `runInternational` already caps Worlds at 16 and MSI at 8 — but those caps
  are hand-written numbers in a different function from the window they must agree with, and a field
  one team too big silently doubles up a round with no other symptom.

### First Stand
A sixth event, weeks **2-4**, taking the tail of preseason rather than a slot in mid-season. That is
both the safe choice and the accurate one: the real tournament runs in March, and carving it out of
preseason means **no phase after week 4 moves**, so no existing save wakes up inside a different
phase than it went to sleep in.

- The field is **one club per region** — the champions and nobody else — which is what keeps it from
  being MSI with the same names three weeks early.
- **The berth is won in a different year from the one it is played in.** You qualify by winning the
  summer, and play it the following February. `season.qualified` cannot carry that (`rolloverYear`
  empties the whole season block), so it lives on `flags.firstStandBerth` and names the YEAR it is
  good for rather than being a boolean that would qualify a club forever.
- `first_stand_champ` is deliberately **major, not legendary**, and priced under MSI at 95 LP / 200
  legacy weight. Six champions in February is not the whole world in October.
- Adding an event means adding its id to EVERY phase list: `KNOCKOUT_PHASES`, `INTL_PHASES` and
  `PHASE_PAY`/`CP_TABLE` in match.js, `BIG_STAGE` and `INTL_PHASES` in events.js, `SERIES_PHASES` in
  Hub.svelte, and the `leftBracketPhase` set in engine.js.

### Event qualification is a model, not two chips
`teams.eventQualification(c)` returns every event with a status (`won`, `out`, `live`, `in`, `chase`,
`missed`, `locked`) and a detail line that says what is actually required and how close you are —
"5th of 10 - inside the cut", "Berth banked for 2029", "Club qualified - you are 16, minimum 17".
It replaced two hardcoded chips, one of which read "Championship points" for Worlds, **which has
never been the rule** (Worlds is top two of the summer bracket). `teams.tournamentNow(c)` drives the
banner and reads the LIVE BRACKET rather than the calendar, so a player whose club did not qualify
is never told they are at Worlds. Both are pure reads and both are wrapped at the call site.

### The training drills
Eight minigames, one per attribute, wired by `ATTRS[].game` → `MinigameHost`. Each returns a
`score01` that `training.scoreFactor()` turns into a gain multiplier, and **0.50 is the contract**:
it is exactly 1.0x, so every drill must be tuned so a competent session lands there. A drill that
scores generously trains its attribute faster than the rest for reasons the player can never see,
which is why the three tuned ones each have a simulator (`comboSim`, `clutchSim`, `waveSim`).

**MEC is `ComboGame`** — targets appear around a field inside an approach ring that shrinks onto
them, and you hit each one as the ring lands. It replaced a last-hit timing bar that trained a
single axis and could be played by watching one pixel; MEC is *"raw hands — combo execution,
dodging skillshots"*, so the drill is aim and rhythm together. Input is the target itself or
Space/Z/X for the nearest, which is also the accessible path.

Readability is not difficulty — the same lesson ClutchGame was rebuilt around. The ring lands
*exactly* on the circle edge, targets fade in rather than appearing under the cursor, and the number
shows the order. **The way to make this drill harder is `wPerfect`, never hiding anything.**

### The question bank rots
`KnowledgeGame`'s bank is the only content in the mode that can become **wrong** rather than merely
stale: League's objectives, timers and season systems get rebuilt most years. It was last checked
against **patch V26.17 (26 August 2026)**, and three shipped questions were wrong by then — the
first minion wave spawns at **0:30**, not 1:05; buff camps at **0:55**, not 1:30; and "a wave every
30 seconds" now needs scoping to laning, since waves accelerate to 25s at 14:00 and 20s at 30:00.

Verify against the League wiki, never from memory — the 2026 season removed **Feats of Strength**
entirely (V26.01) and added **Role Quests** and **Faelights**, and Atakhan's Voracious/Ruinous forms
were removed in V25.09. Anything written from recall about those would have been confidently wrong.

### Age-gated events
An event's `when` gate is the ONLY filter between the pool and the popup. Copy that references a
past age, a life stage, a club, or a stage appearance must gate on `player.age` / `isSigned` / real
participation **directly**, never on a proxy like games played — that is how a thirteen-year-old was
told about the friend they climbed with at fourteen. Helpers in `events.js`: `agedAtLeast`,
`agedBetween`, and `onBigStage`, which confirms a real bracket or fixture rather than just a
playoff-shaped calendar week.

### Pre-game and first-time events
There are three EVENT pools in events.js now (`INTERVIEW_POOL` is a separate shape and unaffected),
and they are three because they are rolled three different ways. `EVENT_POOL` (72 entries, weighted,
20-week id cooldown) is the weekly one, and it gained a `LANGUAGE, MOVING AND HOMESICKNESS` section
worth about 14% of its weight. `PREGAME_POOL` (14) is the hours before a big game. `FIRST_TIME_EVENTS`
(5 keys) is guaranteed, once per career per tournament, and is not rolled at all.

- **A week can be two things.** `rollWeeklyEvents()` is the first roll plus a
  `WEEKLY_SECOND_EVENT_CHANCE` (0.10) draw off the same eligible pool with the id already drawn
  removed. `rollWeeklyEvent()` keeps its exact old signature and behaviour on purpose - careerSmoke
  and careerRender both call it directly, and the forced-event path still goes through it.
- **The pre-game roll fires at WEEK START, not in `startFixture()`.** `startFixture` is bypassed by
  all three sim paths (the Hub's Sim button, the Calendar's Sim button and `simSkippedFixtures()`
  inside `advanceWeek`), so an event rolled there would not exist for a player who sims - which
  across twelve years is most of them. And its last statement is `matchState.set(m)`: past that line
  `CareerShell` has already swapped to MatchDay and `buildMatch` has ALREADY BUILT the match object,
  so an effect applied there could not touch the game it was announcing. At week start the form and
  morale land before the player presses Play, on every path, with nothing layered over MatchDay.
  `engine.majorFixtureFor()` picks the game - the first UNPLAYED fixture this week that is a bracket
  tie or sits in a `MAJOR_PHASES` window - and defaults every `ctx` field to a real string or number,
  because the gates and the text functions read them directly.
- **`rollPreGameEvent` and `firstTimeEvent` return a SHALLOW COPY**, with `text` resolved to a string
  and a `pregame` / `firstTime` marker. `rollWeeklyEvent` hands back the live pool object and that is
  documented in the file as a hazard; writing a resolved `text` onto it would mutate the pool for the
  rest of the session and pin one opponent's name into every future firing of the entry.
- **The first-time flag is `flags.firstSeen[kind]`, year-stamped, NOT `flags.eventLog`.** That
  cooldown ledger is truncated to its last 60 entries, so a first Worlds would fall off it inside two
  seasons and fire again. Same idiom as `flags.firstStandBerth`: a year reads as truthy identically
  and is strictly more informative than a `true` nobody can date. It is written in
  `addBracketFixture()`, the only place in the mode where "the player is actually in this tournament"
  becomes a fact - `openBracket()` only knows the CLUB qualified, and both internationals are
  separately age-gated. Adding a tournament to the calendar means adding its key here too, or the
  whole event arrives silently the first time somebody reaches it.
- **Both reuse `kind: 'event'`.** No new overlay kind was added anywhere, so there are zero new
  `valid` / `accent` / `dismissible` / markup branches and the existing "undismissable until
  answered" rule applies to them for free. They are queued with `pushOverlay`, never
  `careerOverlay.set` - a set would clobber whatever the bracket draw or a split-awards panel has
  already put in the queue. Note that `tickBurnout`'s forced `quit_thought` roll DISCARDS its return
  value, so that crisis event is currently never shown to anybody: it is not a template.
- **The last mile is the two Sim buttons.** `startCareerWeek` returns `{ event, events, income,
  notes }` and `advanceWeek` returns `events`; `Hub.svelte` and `Calendar.svelte` push EVERY entry in
  order. Both used to read `events[0]`, which is what made the second weekly roll and the entire
  pre-game pool invisible - created, then dropped on the floor with nothing on screen to say so.

Measured on `--seed 42`: 244 pre-game events and 38 first-time events applied across 8 careers
(`spring_po` x8, `summer_po` x8, `worlds` x8, `msi` x7, `first_stand` x7). careerSmoke's
`drainOverlay()` now APPLIES `kind === 'event'` overlays with a seeded option instead of throwing
them away, which is the only reason any of those numbers exist; it fails the run when no pre-game
event ever fires, when no first-time event ever fires, and when a tournament the run actually
reached never fired its own.

### Morale has a downside now
These are the **first systematic morale SINKS in the mode**, and morale is not an isolated meter: it
feeds `training.moraleFactor()` (0.85x at rock bottom, 1.12x at loving it), the `MORALE_FLOOR_AT`
floor in `match.successChance()`, and the burnout ladder - under `BURNOUT_MORALE` (40) for six weeks
benches the player, and a second strike TERMINATES THE CONTRACT. A morale drain is therefore also a
training nerf and a rating nerf. **Re-measure with careerSmoke, never tune by intuition.**

Everything is sized against `SQUAD_STATUS.moralePull`, which caps the weekly seat move at 3, and not
against the 0-100 range. A sink sized against the range walks every career into the burnout ladder.

- **Solo queue** (`engine.doSoloQueue`). `net = wins - losses`; `base` is `net * SOLOQ_MORALE_PER_NET`
  clamped to `[-6, +2]` - asymmetric on purpose, because a morale farm at the cheapest activity in
  the mode would out-earn the psychologist at a third of the price. `tilt` fires on a LOSING session
  only, `-min(4, prior * 1.2)`: queueing again after a bad one is the thing being priced, not
  queueing at all. Health is `min(7, prior * 2)` and is charged **always, bench or no bench** - the
  body does not care whose decision it was - while the morale half is skipped entirely while
  `burnoutBenched(c)`. **Every new morale penalty must be suppressed there**: the three-week bench is
  a recovery and a sink running through it turns it into a trap.
- **`prior` is `weekly.counts.soloq`, and `doActivity` increments the counter AFTER the handler
  returns.** That order is the mechanic, not an implementation detail: the handler sees the sessions
  that came BEFORE it, so the first session of a week is free and the second costs 2 health. Counting
  first would charge the first session for itself. `weekly.counts` is REBUILT FROM A LITERAL in
  `startCareerWeek`, so a new `weekly` key that is not named in that literal is deleted every week
  and fails careerSmoke's shape check.
- `soloq` is deliberately absent from `NO_INJURY_ACTIVITIES`, so every session ALSO takes the
  ordinary injury roll on top. That is the risk half of the cost and there is no second roll for it.
- **`match.finishMatch` charges a bad line and a bad run** - `KDA_SOUR_AT` (1.6) with
  `KDA_MORALE_STEP`, and `LOSS_STREAK_STEP` per consecutive prior loss, each capped at 3 and folded
  into the existing `+/-12` clamp on `moraleDelta`. **PENALTY-ONLY, and that is not stylistic.** The
  rating already embeds the series KDA, `moraleDelta` already reads that rating back, and a lost
  series is already a flat -5, so a term written as if nothing else existed would be paid three
  times; and a KDA BONUS would raise morale, raise the `successChance` floor and lift every rating in
  the mode against careerSmoke's 7.6 hard-fail line. Same shape as the morale and health terms in
  `successChance`: a penalty that fades can only bite when the thing it measures has gone wrong.
- `priorLossStreak()` reads `season.schedule`, **sorted by week before tailing** - the schedule is
  not in week order (`ensureSeason` rebuilds it as `[...freshSplitRows, ...carriedBracketRows]` and
  MSI is carried into summer), scans at most the last 12 played rows, and is wrapped in a try/catch
  that yields 0. A rotten schedule must cost the player nothing rather than break a match. The
  current fixture is not marked played at `finishMatch` time, so the tail is genuinely "before this
  one".

Measured on `--seed 42` with all of it live: morale mean **91.6** (min 29, one player-week under 30),
match ratings **7.36** mean / 1.11 sd against the 7.6 hard fail, and **0 terminations**. Across 1071
solo queue sessions, 263 of them a repeat inside one week, 662 health went to the grind cost and 126
morale to tilt. Read `condition`, `solo queue grind` and the `MATCH RATINGS` block; careerSmoke fails
the run if the grind cost or the tilt penalty never fires once, because a sink that never bites is
indistinguishable from one that was never wired.

### The career leaderboard
A global board of other people's careers: browse, then open a full dossier — their player card,
their club roster cards, their season-by-season team history and their performance stats.

- **Two public collections**, `careerBoard/{uid}` (a 25-field ranking row, ~440 B) and
  `careerBoardProfiles/{uid}` (`{ v, careerId, blob, updatedAt }`). ONE DOC PER UID, never per
  uid+slot: the path IS the ownership proof, so no rule ever parses a doc id, and one row per
  account bounds the collection at the number of registered users. **The published slot is a
  FIELD.** Two TOP-LEVEL collections rather than a parent + subcollection, because deleting a
  parent document does NOT delete its subcollection and Unpublish would orphan the dossier.
- **Rank on `earnedLegacyScore`, never `legacyScore`.** The monument ladder is 4,350 renewable
  legacy points for +2,600 score, and careers retire holding 618-6,531 LP unspent — ranking on the
  total would put the top of the board up for sale. The field is NAMED `earnedScore` so no future
  reader can wire the purchasable number into the rank by accident; `boughtScore` rides along and
  is displayed, never summed. Same reason `hallOfLegendsEligible()` runs on the earned figure.
- **IDs travel, names do not.** Team, award, perk, monument, champion and trait names are all
  re-resolved locally from ids (the `anticheat.validateCard()` idiom), and no colour is ever
  published — so a fabricated org renders as "Unknown Org" and no remote string can reach a
  `style=` attribute. The corollary: those ids being permanent is now load-bearing for OTHER
  PEOPLE'S documents, which no code here can migrate.
- **The dossier is a JSON STRING** because rules cannot ITERATE a variable-length list — a list
  bound caps the row COUNT while letting each row carry a 100kb string. A string's `size()` is the
  only hard BYTE bound the language has. Same trick as `careers` in `saves/{uid}`.
- **Board code performs ZERO storage writes.** Opt-in is DERIVED by comparing the published row's
  `careerId` to `careerFingerprint(save)` — hashed over `handle|startAge|path|region` ONLY, because
  `changeRole()` and `switchChampion()` rewrite role/champion/playstyle mid-career and a
  fingerprint that flipped would tell a published player they were unpublished. The publisher reads
  through `careerSlotRaw()`, a fresh `JSON.parse`, so it *physically cannot* reach the live store.
  `boardCheck` lints for every write identifier by call site.
- **`boardOVR()` for publishing, `calcOVR()` for display.** `calcOVR` returns 0 on an unresolvable
  role, which the `ovr >= 1` rule would deny with the failure swallowed — so the row uses
  `boardOVR`, which floors at 1 and falls back to MID. The DOSSIER must not: on a role-rotted save
  that turns an honest "Unknown / 0" into a confident "Academy Prospect" with an invented rating.
- **`Profile.svelte` is a two-line wrapper over `CareerDossier.svelte`** (`c`, `mine`, `remote`),
  which is what gives a stranger's profile the same 50-state `careerRender` coverage the owner's
  has. Every awards.js reader is `c || snapshot()`, so calling one with a bare `c` renders the
  VIEWER'S own numbers under a stranger's handle — they all take the guarded `c0`, and
  `boardCheck` section 7 lints for it.
- `careerBoard.js` may import `auth.js` and `career.js`; **`career.js` must NEVER import
  `board.js` or `careerBoard.js`** or careerRender's Vite SSR module graph breaks.
- Every sort is a single-field `orderBy`, so **no composite index is ever needed**. Adding a
  `.where()` beside an `.orderBy()` on a different field would change that.

**Publishing firestore.rules** — there is no CLI and no firebase.json, so the rules are pasted into
the Firebase console by hand. **Copy them from the file, not from a terminal.** Pasting through a
terminal mangles the text and produces a cascade of `Unexpected '&&'` and `Missing a closing '`
errors on lines that are pure comment — and the reported line numbers land on code that is known
good, which sends you hunting in the wrong place. `firestore.rules.minimal` is the comment-free form
that is actually pasted, and `boardCheck` now asserts the two files are identical once comments and
blank lines are stripped — a check that did not exist while this file claimed it did.

**Firestore denies any collection it has no rule for.** That is the first thing to suspect when a
publish is refused: the career board writes two collections of its own (`careerBoard`,
`careerBoardProfiles`), and until the rules naming them are live in the console, every publish is a
`permission-denied` no amount of client work can fix.

**The career rules are deliberately thin.** They bound what a document COSTS a reader — `keys().size()`,
a type check on every field, a length cap on every string — plus one absolute ceiling on `earnedScore`
because that is what the board ranks on. They used to carry twenty-five numeric ranges, six
cross-field rails, two enums and a ten-minute clock window, each mirrored by hand into `anticheat.js`;
every one was a way for an honest career to be denied silently and permanently the moment the two
drifted a single literal, which for a hand-pasted file is the default state. Values are re-clamped by
`sanitizeRow()` on READ, which is where they have to be clamped anyway. `boardCheck` section 1 now
asserts those rails and enums stay GONE, so the complexity cannot creep back in.

Consequences worth knowing: **adding a role or a region is now a client-only change** (no enum to
mirror), but **adding a row FIELD is still a TWO-STAGE deploy** — `keys().size() <= 25` and the
per-field type checks mean a new field is denied until the rules are re-published by hand first.

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
  wired-and-dead, which is the failure this file exists to catch. It also prints **`tournament
  calendar`** (which weeks each bracket occupied) and **`regular season format`** (Bo1 vs Bo3
  club-weeks, and the mean games per series), both with their own inertness assertions: a bracket
  that only ever occupies one week is a spread that never fires, a run with no Bo3 at all means the
  region table has gone flat, and an event missing from the calendar line entirely — First Stand
  especially, whose berth survives a year rollover on a flag — is an event nobody can play.
  It asserts the league table can never drift more than one week's games out of step, which is the
  check whose absence let a 45-vs-18 table ship.
- `node tools/eventCheck.mjs` — the in-match decision pools (`matchEvents.js`). That file opens
  with a page of authoring discipline that was, until this existed, enforced entirely by a comment:
  3-or-4 options, a safest and a greedy play at least 0.12 of difficulty apart, safest averaging
  0.29 early / 0.36 mid / 0.44 late and never above 0.58. It also pins two things that drift
  silently — the **option bias distribution** (those triples ARE the comfort-pick bonus; see
  `championCheck`) and the **decision economy** (mean difficulty and net reward-minus-risk). Softer
  options raise every match rating, and `careerSmoke` fails outright above a 7.6 mean. `--list`
  prints every event id by role and phase. It also reports **pool depth against a Bo5**: one game
  draws `[early, early, mid, mid, late]`, so a series consumes 10/10/5 per role without repeats.
- `node tools/lifeCheck.mjs` - the LIFE event pools in `events.js` (weekly, pre-game, first-time),
  which nothing covered: `eventCheck.mjs` is `matchEvents.js` and has never so much as imported this
  file. 91 authored entries across three pools where every failure mode is SILENT - a duplicated id
  overwrites the other one's row in `flags.eventLog` so the 20-week cooldown leaks, a two-option
  event just renders two buttons and is still undismissable until answered, an unsatisfiable `when`
  is dead content nobody ever sees, an unknown `type` falls through to 'system' and a grey badge, and
  **an effect key outside the CAP table is DROPPED by `capEffects()` with no warning**, which is
  exactly how five legacy perk keys shipped doing nothing. It runs every `apply()` against ten
  synthetic careers (unsigned 13yo through retired, plus a deliberately rotten one) and deep-compares
  the career before and after, because the pool header promises `apply()` is pure and nothing had
  ever checked. It also owns the LANGUAGE table: a region missing from `REGION_LANGUAGE` makes
  `languageForRegion()` return null, null reads everywhere as "no language required", and that region
  silently becomes free to sign for from anywhere on the circuit. `--list` prints the pools, and the
  id-uniqueness and purity rules carry their own positive/negative controls. It passes clean, with
  seven standing warnings. **Two of its rules were WRONG on the first cut and were relaxed rather
  than obeyed**, which is the more useful half of the story: a six-character floor on option labels
  failed `charity_stream.pass` and `bootcamp_offer.go`, which are the correct words for those
  buttons — the rule now catches an empty or placeholder label (2 chars) and nothing else, because a
  lint that tells you to pad good copy to hit a character count gets disabled. And the ASCII rule is
  a hard error on **`events.js` only**, where new copy actually lands and which is clean; on
  `constants.js` it prints the count (77 lines: 3,037 box-drawing characters in the section banners,
  plus `Leviatan`'s acute and six curly apostrophes in real club names and blurbs) as a **baseline a
  new violation is visible against**. Failing it would have meant misspelling an org's name or
  shipping a harness that is red on day one.
- `node tools/slotCheck.mjs` — the save-slot system, which nothing else touches. Asserts the thing
  that would be catastrophic and silent: **slot 1 resolves to the bare key**, so every save that
  predates slots is still there. Also isolation both ways, device prefs staying global, scoped
  delete and wipe, both stores round-tripping across a switch (which is what proves
  `resetGameStores()` actually resets), and that the picker's summary readers never switch slot.
- `node tools/boardCheck.mjs` — the global career leaderboard (`career/board.js`,
  `stores/careerBoard.js`, `CareerBoard.svelte`, `CareerDossier.svelte`), which nothing else covers.
  Seeded; `--seed` reproduces. Seven sections, and the first is the one that matters most:
  **firestore.rules is published BY HAND in the console, so drift is the default state.** It asserts
  the two rules files match each other, that every string cap in the rules is **at or above** the
  client clamp in `CAREER_STR_MAX` (only that direction — a rules cap *below* the client's denies a
  legal value for ever, silently, while one above is simply never reached), that the `earnedScore`
  ceiling is not below the client clamp, and that the removed rails, enums and clock window have not
  crept back. It pins the field set from the TYPE CHECKS rather than a `hasAll` — the rules deny on
  dereferencing a key a document lacks, so `d.handle is string` *is* the requirement — and both
  directions are checked: every published field must be typed, and no rule may read a field the
  client never sends. It drives three
  real careers and **prints the tightest margin per bound**, pushes ~40 rot shapes through
  `sanitizeRow`/`sanitizeDossier`/`safeSeatCard`, proves the blob trim loop fires while `at2`/`tp`
  keep the uncapped counts, and asserts that publishing leaves localStorage and the career store
  **byte-identical** with exactly two writes in the order profile-then-row. Section 7 lints board
  code for save-writing call sites and lints `CareerDossier` for any awards.js reader called with a
  bare `c` — every one of those falls through to `c || snapshot()` and would print the VIEWER'S own
  numbers under a stranger's handle. The lint patterns carry their own positive/negative controls,
  because a lint that matches nothing looks exactly like a clean codebase.
- `node tools/careerRender.mjs` — Vite SSR-renders all 23 career components against 50 game
  states (unsigned rookie, null bracket, retired, damaged save, and one rot per field). The only
  check that exercises the Svelte templates. Note two extra loops beyond the screens matrix: the
  **Shop is rendered once per tab** (`initialTab`, a prop only this harness passes — `tab` is
  component-local, so every section but `gear` used to ship untested), and **BracketView is driven
  directly** against a dozen hand-built bracket shapes because it is a child of Calendar and gets no
  coverage from the screens loop. Only crashes fail the build; `wrong`/`warning` print and exit 0.
  States `4c-at-a-tournament` / `4d-tournament-won` are hand-built rather than driven, because the
  driven playoff state only reaches a live bracket if the club made the cut that run — so the
  tournament banner and the `live`/`won` qualification chips could go permanently unrendered with
  nothing saying so. `--dump` writes every render to `tools/.render-dump/` and is how to confirm
  markup actually appears rather than trusting that a state exists.
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
- `node tools/comboSim.mjs` — calibration gate for the MEC drill (**ComboGame**, the osu-style
  target/approach-ring drill that replaced the last-hit timing bar). Parses `CFG`/`VALUE`/`SCORE_W`
  straight out of the component and simulates the real scoring against six press-error profiles.
  **The timing windows are identical at all three tiers on purpose**: every drill in the mode is
  normalised so a competent session scores ~0.50, and the tier's reward is `baseGain`, not a fatter
  score — tightening windows on top of more targets, a faster ring and a shorter gap would make
  Elite pay *less* than Basic for the same hands. The first cut shipped 55/105/170ms windows at
  Basic, which put a competent session at **0.76 — a 1.63x multiplier for turning up**, and would
  have made MEC by far the cheapest attribute in the mode to max. Nothing but this file would have
  caught it. Note it deliberately does NOT copy clutchSim's "near-perfect lands in 0.70-0.90" rule:
  ClutchGame has irreducible interference and a pure timing drill has none, so headroom is asserted
  where real players actually sit (`strong` must land 0.60-0.82) rather than by capping a flawless
  session below what it earned.
- `node tools/quizCheck.mjs` — validates the KNW question bank (`KnowledgeGame`), whose every
  failure mode is silent: a duplicated question just appears twice, a repeated option renders two
  identical buttons one of which scores wrong, a three-option question simply offers three. Also
  enforces the distribution, because `buildRound()` draws EVENLY across the five categories — a thin
  category repeats every session while a fat one is barely seen. `--list` prints the bank by
  category.
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
