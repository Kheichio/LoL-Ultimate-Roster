// ═══════════════════════════════════════════════════════════════════════════
//  CAREER LEADERBOARD — the network half
// ═══════════════════════════════════════════════════════════════════════════
//  The ONLY module in the app that touches careerBoard/{uid} or
//  careerBoardProfiles/{uid}. One writer, deliberately: the roster board
//  already has two (App.svelte and Leaderboard.svelte) and they disagree about
//  what a published entry contains, so which one ran last decides what the
//  world sees. Every board screen calls in here; nothing else opens a
//  collection.
//
//  THIS FILE NEVER WRITES THE CAREER SAVE. Not saveCareer, not flushCareer, not
//  initCareer, not importCareerSlots, not setActiveSlot, not career.set, not
//  localStorage — nothing. The save-slot picker once called flushCareer() from
//  a screen that had never loaded a career and destroyed real player saves
//  (CLAUDE.md, "Never persist a store that has not been loaded"); a board is
//  read-side machinery and has even less business writing than that did.
//
//  "Am I published?" is therefore DERIVED — careerFingerprint(save) compared to
//  the careerId on the row Firestore hands back — and never a stored flag.
//  There is nothing to write, and nothing to leave stale when a player deletes
//  a slot, restores a cloud backup or signs in on a second device.
//
//  Encoding, decoding and clamping all live in career/board.js, which is pure.
//  Everything network-shaped, timed or stateful lives here.
//
//  ── EVERY SLOT, AUTOMATICALLY ────────────────────────────────────────────
//  There is no Publish button any more. A signed-in player's careers go on the
//  board on their own and stay current on their own, one entry per save slot,
//  and the only decision left to the player is the opposite one: HIDE.
//
//  Three consequences worth holding on to:
//
//  1. `hidden` is the ONLY durable board state, and it lives in the dossier
//     document (career/board.js hiddenProfileFor). It cannot live in the save —
//     see above — and it cannot live in the ranking row, because hiding DELETES
//     that row. A device-local flag would be worse than nothing: the second
//     browser this account signs into would put the career straight back up.
//
//  2. Auto-publish must therefore CHECK the flag before it writes, and the
//     check has to survive a cold start. loadMyEntries() reads the dossier of
//     any slot that holds a local career but has no row on the board — the
//     exact set where "was this hidden, or has it simply never gone up?" is a
//     real question — and nothing is written until that answer is in hand.
//
//  3. Writes are gated on a CONTENT SIGNATURE, not on a timer alone. A minute's
//     floor stops a busy week hammering the collection; the signature stops a
//     quiet one writing at all. Both are needed: the timer alone would upload
//     three unchanged documents a minute for ever.

import { writable, get } from 'svelte/store';
import {
    BOARD_LIMIT, BOARD_SORTS, BOARD_ROW_BYTES_MAX, BOARD_BLOB_BYTES_MAX,
    BOARD_ROW_FIELDS, buildBoardDocs, sanitizeRow, sanitizeDossier,
    careerFingerprint, entryIdFor, dossierHidden, hiddenProfileFor,
} from '../career/board.js';
import { currentUser } from './auth.js';
import { careerSlotRaw } from './career.js';
import { activeSlot, SLOT_IDS } from '../utils/storage.js';
import { showToast } from './toasts.js';

// ─────────────────────────────────────────────────────────────────────────
//  COLLECTIONS
//  Two TOP-LEVEL collections, never a parent + subcollection: deleting a
//  document does not delete its subcollection in Firestore, so "Remove from
//  board" would orphan the dossier where its owner can no longer reach it.
// ─────────────────────────────────────────────────────────────────────────
//
//  The document id is `uid + '__' + slot` (career/board.js entryIdFor), so a
//  three-slot player holds three independent entries and none of them can
//  displace another. firestore.rules proves ownership by rebuilding those same
//  three strings from request.auth.uid and comparing, which keeps the PATH the
//  ownership proof — no rule parses anything.
const ROW_COLLECTION = 'careerBoard';
const PROFILE_COLLECTION = 'careerBoardProfiles';

const DEFAULT_SORT = BOARD_SORTS[0].key;   // 'earnedScore'

/** Page cache lifetime. CareerShell wraps the screen in {#key $careerScreen},
 *  so the entire subtree is destroyed and rebuilt on every tab switch — with no
 *  cache, walking Board -> Club -> Board is two full 50-document reads. */
const PAGE_TTL_MS = 2 * 60 * 1000;

/** Dossiers are ~9kb of JSON each; 30 of them is a rounding error in memory and
 *  covers the "open five careers, go back, open them again" browsing loop. */
const DOSSIER_MAX = 30;

/**
 * Per-slot write floor. One minute, matching CareerShell's autosave interval,
 * so the board tracks the save rather than the frame rate.
 *
 * It is a floor and NOT the gate: nothing is written unless the content
 * signature actually moved (syncSlot). A career sitting on the transfers screen
 * for an hour costs zero writes; a career playing a split costs about one a
 * minute, which is the honest price of "kept up to date automatically".
 */
const AUTO_PUBLISH_MS = 60 * 1000;

/** Floor on a WHOLE-ACCOUNT sweep. Every screen that can plausibly want the
 *  board fresh calls autoSyncBoard(); this is what stops three of them in the
 *  same second costing three sweeps. */
const AUTO_SYNC_MS = 20 * 1000;

// ─────────────────────────────────────────────────────────────────────────
//  THE SSR / OFFLINE GUARD
// ─────────────────────────────────────────────────────────────────────────
/**
 * Firebase is the compat SDK hung off globals by index.html. It is absent in
 * three real situations: server-side rendering, a page loaded before the CDN
 * script resolved, and a build with Firebase stripped out.
 *
 * `typeof window !== 'undefined'` is NOT the guard. tools/careerRender.mjs sets
 * globalThis.window to drive the Svelte templates under SSR and never defines
 * fbDb, so a window check passes there and `window.fbDb.collection(...)` throws
 * inside a render. Gate on fbDb itself, at every call site, with no exceptions.
 */
function db() {
    return (typeof window !== 'undefined' && window.fbDb) ? window.fbDb : null;
}

function uidOf() {
    const u = get(currentUser);
    return (u && typeof u.uid === 'string' && u.uid) ? u.uid : '';
}

function nameOf() {
    const u = get(currentUser);
    return (u && u.displayName) ? String(u.displayName) : 'Anonymous';
}

// ─────────────────────────────────────────────────────────────────────────
//  STORES
// ─────────────────────────────────────────────────────────────────────────
/** The current page of the board — always an array, never null. */
export const boardRows = writable([]);

/**
 * `fetchedAt` is ONLY ever assigned inside a successful read. That is the whole
 * point of it: Leaderboard.svelte stamps `lastSync = new Date()` after a catch
 * that swallows the error, so "you are offline" and "the board synced and is
 * genuinely empty" render identically, and the roster board has looked healthy
 * while failing for as long as it has existed.
 */
export const boardState = writable({
    status: 'idle',        // idle | loading | ready | error | offline
    error: '',
    fetchedAt: 0,
    sort: DEFAULT_SORT,
});

/**
 * The viewer's own entries, BY SLOT: { 1: row|null, 2: row|null, 3: row|null }.
 *
 * THE authority for "which of my careers are on the board" — every row in it
 * came back from the server, so it is right on a fresh device, after a cloud
 * restore and after signing in somewhere else. Always an object with all three
 * keys present; a slot that is not on the board is an explicit null rather than
 * a missing key, so no reader has to tell "absent" from "unknown".
 */
export const myBoardEntries = writable(blankEntries());

/** Which slots the player has HIDDEN: { 1: bool, 2: bool, 3: bool }. Read off
 *  the dossier documents, never off the save. A slot is only known to be hidden
 *  once its dossier has actually been read — see `_hiddenKnown`. */
export const myBoardHidden = writable(blankHidden());

/**
 * What the automatic uploader is doing, for a UI that no longer has a button to
 * press. `status` is idle | syncing | ok | error; `error` is the verbatim
 * failure and is the ONLY place a denied auto-publish becomes visible, because
 * a background write has no press behind it to toast at.
 */
export const boardSync = writable({ status: 'idle', error: '', at: 0, slot: 0 });

// There is deliberately NO `myBoardRow` store any more. It used to be the
// authority for "am I on the board", and with one entry per account that was a
// well-posed question. With one entry per SAVE SLOT it is not: a player can
// hold three, and any single "primary" row this module picked would be a
// judgement nothing downstream asked for -- and a store that nothing reads is
// the wired-and-dead shape this codebase keeps having to dig back out. Ask
// myBoardEntries by slot.

function blankEntries() { return { 1: null, 2: null, 3: null }; }
function blankHidden() { return { 1: false, 2: false, 3: false }; }

// ─────────────────────────────────────────────────────────────────────────
//  CACHES  (module-level, deliberately outliving the component tree)
// ─────────────────────────────────────────────────────────────────────────
const _pages = new Map();      // sortKey -> { rows, fetchedAt }
const _dossiers = new Map();   // uid     -> career object (FIFO)

/** Monotonic request id. A player who taps three sort buttons in a second gets
 *  three in-flight reads; without this the slowest one wins the screen. */
let _pageSeq = 0;

/**
 * Auto-publish bookkeeping. All session state, never persisted — every one of
 * these is an optimisation whose worst failure is one redundant write.
 *
 * `_hiddenKnown` is the exception and is a CORRECTNESS flag, not a cache: until
 * a slot's dossier has been read, "not hidden" is an assumption rather than a
 * fact, and syncSlot() refuses to publish on an assumption. That is what stops
 * a cold start from re-publishing a career the player hid on another device.
 */
let _lastSweep = 0;
const _lastWrite = {};        // slot -> ms of the last write attempt
const _sigs = {};             // slot -> content signature last seen on the server
const _hiddenKnown = {};      // slot -> has the hidden flag been established?
let _entriesUid = '';         // which account the loaded entries belong to
let _legacyChecked = false;   // the pre-slot path has been looked at, once
let _legacyFound = false;     // ...and there really is a document sitting there
let _legacyPurged = false;    // the pre-slot document has been cleaned up

export function clearBoardCaches() {
    _pages.clear();
    _dossiers.clear();
}

/** Everything session-scoped about ONE account. Called when the signed-in uid
 *  changes: keeping another account's signatures would suppress the first write
 *  of every slot for the new one. */
function resetAccountState() {
    for (const n of SLOT_IDS) {
        delete _lastWrite[n];
        delete _sigs[n];
        delete _hiddenKnown[n];
    }
    _lastSweep = 0;
    _legacyChecked = false;
    _legacyFound = false;
    _legacyPurged = false;
    myBoardEntries.set(blankEntries());
    myBoardHidden.set(blankHidden());
}

function setEntry(slot, row) {
    myBoardEntries.update(m => ({ ...m, [slot]: row }));
}

function setHidden(slot, value) {
    _hiddenKnown[slot] = true;
    myBoardHidden.update(m => ({ ...m, [slot]: !!value }));
}

function cacheDossier(uid, career) {
    // Map.set on an existing key keeps its insertion position, so this stays
    // strictly FIFO — a re-read does not extend anything's lifetime.
    _dossiers.set(uid, career);
    while (_dossiers.size > DOSSIER_MAX) {
        const oldest = _dossiers.keys().next().value;
        _dossiers.delete(oldest);
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────
/** Every sort is a single-field orderBy on a real row field, which Firestore
 *  auto-indexes. An unknown key would 400 the query, so it is coerced here. */
function sortKey(sort) {
    return BOARD_SORTS.some(s => s.key === sort) ? sort : DEFAULT_SORT;
}

function clampSlot(slot) {
    const n = Math.round(Number(slot));
    return (n === 1 || n === 2 || n === 3) ? n : activeSlot('career');
}

/** Mark the viewer's own row rather than dropping it: a player wants to see
 *  where they place, and hiding the row makes the ranks below it wrong. */
function markMine(rows) {
    const me = uidOf();
    return rows.map(r => ({ ...r, isMe: !!me && r.uid === me }));
}

function errText(e) {
    const m = (e && e.message) ? String(e.message) : '';
    return m.replace('Firebase: ', '').trim() || 'Unknown error.';
}

function isDenied(e) {
    return !!e && (e.code === 'permission-denied' || /permission[- ]denied|insufficient permissions/i.test(errText(e)));
}

function isOffline(e) {
    return !!e && (e.code === 'unavailable' || e.code === 'deadline-exceeded'
        || /offline|unavailable|network error|failed to get document|blocked/i.test(errText(e)));
}

/**
 * The two real causes, named. A denied write here is almost never a hostile
 * client — it is one of these, and both are invisible without being said out
 * loud, which is precisely how the roster board's blanket catch hides them.
 */
const DENIED_MESSAGE =
    'The server refused the publish, which almost always means the career board rules have not '
    + 'been published in the Firebase console yet. Firestore denies every collection it has no rule '
    + 'for, and this board writes two of its own — careerBoard and careerBoardProfiles. Open the '
    + 'Firebase console, go to Firestore Database → Rules, paste in firestore.rules.minimal from '
    + 'the project, publish, and try again. The browser console has the exact error and the refused '
    + 'document; if you see ERR_BLOCKED_BY_CLIENT there instead, it is an ad blocker, not the rules.';

/**
 * AD BLOCKERS ARE NAMED FIRST, ON PURPOSE.
 *
 * uBlock Origin, AdBlock, Ghostery, Privacy Badger and Brave Shields all block
 * firestore.googleapis.com by default because it is a Google domain. The request
 * never leaves the browser -- it fails as net::ERR_BLOCKED_BY_CLIENT, visible
 * only in the console -- so the server never sees it and the rules are never
 * evaluated. Everything above this line is therefore working perfectly while
 * nothing reaches the board.
 *
 * This is by far the most common cause of "the board will not take my career",
 * and it is completely invisible unless it is said out loud. An earlier version
 * of this message blamed the rules and the device clock, which sent a real
 * debugging session chasing both for several rounds while the actual cause sat
 * in the console. Blame the blocker first; it is right most of the time.
 *
 * It applies to cloud saves and the roster leaderboard too -- both use the same
 * Firestore connection, and both swallow the failure entirely.
 */
const OFFLINE_MESSAGE =
    'Could not reach the board. The usual cause is an ad blocker or privacy extension blocking '
    + 'firestore.googleapis.com — try disabling it for this site. Otherwise you are offline. '
    + 'Nothing was changed locally, and your career is untouched.';

/** FNV-1a base-36, the same loop board.js and anticheat.js use. */
function fnv(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

/**
 * A content signature for one board entry: the published row fields, in
 * BOARD_ROW_FIELDS order, plus a hash of the dossier blob.
 *
 * TWO PROPERTIES, and losing either one breaks something:
 *
 *   It reads the SAME for a row built by buildBoardDocs and for the same row
 *   read back through sanitizeRow. That is why it enumerates a fixed field list
 *   rather than JSON.stringify-ing the object — sanitizeRow adds entryId, uid,
 *   isMe, team and teamName, so a wholesale hash would differ every time and
 *   the uploader would rewrite three documents a minute for ever.
 *
 *   It EXCLUDES `updatedAt`, which is Date.now() on every build and would make
 *   every rebuild look like a change. That is the same bug from the other side.
 *
 * The blob is included because the dossier moves far more often than the row
 * does — week, gold, form and the club roster all live in it and none of them
 * is a ranked field — and a board that says "updated a minute ago" over a
 * dossier three months stale is worse than one that admits it is old.
 */
function rowSignature(row, blob) {
    let out = '';
    for (const k of BOARD_ROW_FIELDS) out += String(row ? row[k] : '') + '';
    // A row read back off the server arrives WITHOUT its dossier — the blob is
    // up to 24kb and downloading three of them on every mount just to decide
    // whether to skip a write costs more than the write itself. `*` means
    // "unknown", and sigEqual treats it as agreement on the row half alone: a
    // session that only ever reads stays silent, and one that moves a ranked
    // field still writes.
    return fnv(out) + '.' + (blob == null ? '*' : fnv(blob));
}

/** Signature comparison, with `*` as the "blob unknown" wildcard. */
function sigEqual(a, b) {
    if (!a || !b) return false;
    const x = String(a).split('.');
    const y = String(b).split('.');
    if (x[0] !== y[0]) return false;
    return x[1] === '*' || y[1] === '*' || x[1] === y[1];
}

// ─────────────────────────────────────────────────────────────────────────
//  READ — the board page
// ─────────────────────────────────────────────────────────────────────────
/**
 * Load one page of the board. Public read: signed-out visitors get the same
 * data, which is why nothing in here gates on a uid.
 *
 * `force` skips the TTL for an explicit Refresh press.
 */
export async function loadBoardPage(sort, { force = false } = {}) {
    const key = sortKey(sort);
    const seq = ++_pageSeq;

    const cached = _pages.get(key);
    if (!force && cached && (Date.now() - cached.fetchedAt) < PAGE_TTL_MS) {
        const rows = markMine(cached.rows);
        boardRows.set(rows);
        boardState.update(s => ({ ...s, status: 'ready', error: '', fetchedAt: cached.fetchedAt, sort: key }));
        return rows;
    }

    const d = db();
    if (!d) {
        // NO fetchedAt. Being offline must never look like a successful sync.
        boardRows.set(cached ? markMine(cached.rows) : []);
        boardState.update(s => ({ ...s, status: 'offline', error: OFFLINE_MESSAGE, sort: key }));
        return [];
    }

    boardState.update(s => ({ ...s, status: 'loading', error: '', sort: key }));

    try {
        const snap = await d.collection(ROW_COLLECTION)
            .orderBy(key, 'desc')
            .limit(BOARD_LIMIT)
            .get();

        // A stale response never touches the stores. It is still cached — the
        // data is good, it is just not what is on screen any more.
        const clean = [];
        snap.forEach(doc => clean.push(sanitizeRow(doc.id, doc.data())));

        const fetchedAt = Date.now();
        _pages.set(key, { rows: clean, fetchedAt });
        if (seq !== _pageSeq) return markMine(clean);

        const rows = markMine(clean);
        boardRows.set(rows);
        boardState.update(s => ({ ...s, status: 'ready', error: '', fetchedAt, sort: key }));
        return rows;
    } catch (e) {
        if (seq !== _pageSeq) return [];
        const message = isOffline(e) ? OFFLINE_MESSAGE : ('Could not load the board: ' + errText(e));
        // fetchedAt is left exactly as it was. If it is 0 the screen has never
        // successfully synced and must say so.
        boardState.update(s => ({
            ...s,
            status: isOffline(e) ? 'offline' : 'error',
            error: message,
            sort: key,
        }));
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  READ — the viewer's own entries
// ─────────────────────────────────────────────────────────────────────────
/**
 * Which of this account's save slots are on the board, and which are hidden.
 *
 * Three point reads for the rows, plus one dossier read for each slot that
 * holds a local career and has NO row on the board. That second set is exactly
 * the set where the question "was this hidden, or has it simply never gone up?"
 * has two possible answers and the difference matters — a slot with a row is
 * visibly not hidden, and a slot with no local career has nothing to publish
 * either way. Reading all six unconditionally would cost double for no answer.
 *
 * Silent on failure, and a failed read NEVER clears an entry: "the read failed"
 * is not "you are not on the board", and confusing the two would make the
 * uploader re-publish a hidden career the moment the network hiccupped.
 */
export async function loadMyEntries() {
    const d = db();
    const uid = uidOf();

    // ONLY ON A REAL ACCOUNT CHANGE. `_entriesUid` starts empty, and resetting
    // on that first load would throw away signatures and hidden flags that a
    // publish earlier in the same session already established for THIS account
    // — costing a redundant write at best, and a re-listed hidden career at
    // worst. A sign-out (uid '') is a change and does reset.
    if (_entriesUid && _entriesUid !== uid) resetAccountState();
    _entriesUid = uid;
    if (!uid) return get(myBoardEntries);
    if (!d) return get(myBoardEntries);

    const found = {};
    await Promise.all(SLOT_IDS.map(async (n) => {
        try {
            const doc = await d.collection(ROW_COLLECTION).doc(entryIdFor(uid, n)).get();
            if (!doc.exists) { found[n] = null; return; }
            found[n] = { ...sanitizeRow(doc.id, doc.data()), isMe: true };
        } catch (e) {
            found[n] = undefined;   // unknown, and deliberately not null
        }
    }));

    const before = get(myBoardEntries);
    const next = { ...before };
    for (const n of SLOT_IDS) {
        if (found[n] === undefined) continue;   // read failed: keep what we had
        next[n] = found[n];
        if (found[n]) {
            // A row that exists is a slot that is not hidden, established
            // without spending a read on its dossier.
            setHidden(n, false);
            // SEED THE ROW HALF, AND KEEP THE BLOB HALF WE ALREADY KNEW.
            //
            // rowSignature(row, null) is the "blob unknown" wildcard, and
            // sigEqual treats a wildcard as agreement on the row half alone.
            // Writing it flat over an EXACT signature this session recorded
            // when it last published would throw the blob half away — and
            // because this function runs at the top of EVERY sweep, it would
            // throw it away every minute, permanently. The blob is the half
            // that actually moves: week, gold, form, attributes, the club
            // roster and proficiency are all dossier-only and none of them is
            // a BOARD_ROW_FIELD, so the dossier would freeze at whatever it
            // held on the first write of the session while the row went on
            // updating. The mechanism the wildcard exists for would be intact
            // and the mechanism the blob hash exists for would be dead.
            //
            // The kept half is only trustworthy while the ROW halves agree: a
            // row that changed under us came from somewhere else, and what we
            // believe about its dossier came from a write that is no longer
            // the latest one.
            const serverRow = rowSignature(found[n], null).split('.')[0];
            const prev = _sigs[n] ? String(_sigs[n]).split('.') : null;
            _sigs[n] = serverRow + '.' + ((prev && prev[0] === serverRow) ? prev[1] : '*');
        } else if (before[n]) {
            // A ROW WE HAD IS NOW GONE. Somebody deleted it, and this session is
            // not the somebody — a hide on THIS device sets hidden and clears
            // the entry in the same breath. The overwhelmingly likely cause is
            // the player hiding this career on another device, so what we
            // believe about `hidden` is now stale and must be re-established
            // from the dossier rather than assumed. Without this, two devices
            // signed in at once means the second one re-lists, within the
            // minute, every career the first one takes down.
            delete _hiddenKnown[n];
            delete _sigs[n];
        }
    }
    myBoardEntries.set(next);

    // ONE look, once per account per session, at the path this board used to
    // write before it had slots. An account that has one holds a duplicate
    // ranked row it has no way to remove; an account that does not — which is
    // every account created since — pays a single point read and never a write.
    if (!_legacyChecked) {
        _legacyChecked = true;
        try {
            const legacy = await d.collection(ROW_COLLECTION).doc(uid).get();
            _legacyFound = !!(legacy && legacy.exists);
        } catch (e) { _legacyChecked = false; }
    }

    // Only the ambiguous slots cost a second read.
    await Promise.all(SLOT_IDS.map(async (n) => {
        if (found[n] || _hiddenKnown[n]) return;
        let raw = null;
        try { raw = careerSlotRaw(n); } catch (e) { raw = null; }
        if (!raw) return;
        try {
            const doc = await d.collection(PROFILE_COLLECTION).doc(entryIdFor(uid, n)).get();
            // A slot with no dossier at all has never been published, which is
            // not the same as having been hidden — and is the state every save
            // that predates this change is in.
            setHidden(n, doc.exists ? dossierHidden(doc.data()) : false);
        } catch (e) {
            // THIS IS THE ONLY PLACE THIS FAILURE CAN BE REPORTED.
            //
            // The flag stays unknown, and syncSlot() then refuses this slot
            // BEFORE it touches the network — which is the right call, since
            // unknown is not permission — but it means no write is ever
            // attempted, so the write catch that owns DENIED_MESSAGE and
            // OFFLINE_MESSAGE never runs, and the sweep goes on to stamp
            // status 'ok' because nothing failed inside it. Silence here is a
            // career whose card reads "Uploading..." for ever with nothing
            // anywhere saying why. It is scoped to slots that hold a real save
            // (the `!raw` return above), so it cannot fire noise for an empty
            // one.
            boardSync.set({
                status: 'error',
                error: isDenied(e) ? DENIED_MESSAGE : (isOffline(e) ? OFFLINE_MESSAGE : errText(e)),
                at: Date.now(),
                slot: n,
            });
            try {
                console.warn('[LUR] career board could not read the dossier for slot ' + n
                    + '; that slot cannot be published until it can', { code: e && e.code, message: e && e.message });
            } catch (_) { /* console is not load-bearing */ }
        }
    }));

    return get(myBoardEntries);
}


// ─────────────────────────────────────────────────────────────────────────
//  READ — a stranger's dossier
// ─────────────────────────────────────────────────────────────────────────
/**
 * Fetch and decode one full career. Returns a career-shaped object or null;
 * sanitizeDossier never throws, so a corrupt or hostile document is simply a
 * null the caller renders as "could not be read".
 */
export async function openDossier(entryId) {
    // The ENTRY id (`uid__slot`), which is what a board row carries in `.entryId`
    // and what the dossier is stored under. A bare uid still resolves, because
    // that is how every document written before per-slot entries is keyed.
    const id = (typeof entryId === 'string' && entryId) ? entryId : '';
    if (!id) return null;

    if (_dossiers.has(id)) return _dossiers.get(id);

    const d = db();
    if (!d) { showToast(OFFLINE_MESSAGE, 'error'); return null; }

    try {
        const doc = await d.collection(PROFILE_COLLECTION).doc(id).get();
        if (!doc.exists) {
            showToast('That career is on the board but its full record is missing.', 'info');
            return null;
        }
        const career = sanitizeDossier(id, doc.data());
        if (!career) {
            showToast('That career record could not be read.', 'error');
            return null;
        }
        cacheDossier(id, career);
        return career;
    } catch (e) {
        showToast(isOffline(e) ? OFFLINE_MESSAGE : ('Could not open that career: ' + errText(e)), 'error');
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  WRITE — publish
// ─────────────────────────────────────────────────────────────────────────
/**
 * Publish one save slot to the board.
 *
 * Reads the slot through careerSlotRaw(), which is a fresh JSON.parse of
 * localStorage with no store write and no slot switch — so publishing slot 3
 * while playing slot 1 cannot disturb either one, and buildBoardDocs()
 * physically cannot reach the live career object.
 *
 * Returns { ok, code, message }. `code` is one of:
 *   ok | signed-out | offline | no-save | too-big | denied | error
 */
export async function publishCareerSlot(slot, { silent } = {}) {
    const done = (ok, code, message) => {
        if (!silent && message) showToast(message, ok ? 'success' : 'error');
        return { ok, code, message };
    };

    const uid = uidOf();
    if (!uid) return done(false, 'signed-out', 'Sign in to publish your career to the global board.');

    const d = db();
    if (!d) return done(false, 'offline', OFFLINE_MESSAGE);

    const s = clampSlot(slot);
    const raw = careerSlotRaw(s);
    if (!raw) return done(false, 'no-save', `Slot ${s} has no career to publish.`);

    const docs = buildBoardDocs(raw, { uid, displayName: nameOf(), slot: s });
    // buildBoardDocs returns null for anything that is not a created career. A
    // blank store means "nothing is loaded", never "no save exists".
    if (!docs) return done(false, 'no-save', `Slot ${s} has no created career to publish.`);

    // ── SIZE PREFLIGHT ───────────────────────────────────────────────
    // Same reason cloudSave() preflights the 1 MiB document limit: Firestore
    // simply refuses an oversize write, the catch swallows it, and the career
    // never appears with no error anywhere. Say something true instead.
    const rowBytes = JSON.stringify(docs.row).length;
    if (rowBytes > BOARD_ROW_BYTES_MAX) {
        return done(false, 'too-big',
            `That career's ranking row came out at ${rowBytes} bytes, over the ${BOARD_ROW_BYTES_MAX} limit. `
            + 'Try a shorter account display name.');
    }
    const blobBytes = docs.blob.length;
    if (blobBytes > BOARD_BLOB_BYTES_MAX) {
        return done(false, 'too-big',
            `That career could not be compacted small enough to publish (${Math.round(blobBytes / 1024)}kb `
            + `of a ${Math.round(BOARD_BLOB_BYTES_MAX / 1024)}kb limit).`);
    }

    // ── WRITE ORDER IS THE ANTI-DESYNC MECHANISM ─────────────────────
    // PROFILE FIRST, ROW SECOND. There are no batches or transactions anywhere
    // in this codebase, so ordering is all there is. A failed row write leaves
    // a fresh dossier nobody can rank — harmless. The reverse leaves a ranked
    // row pointing at a stale dossier, i.e. a board entry whose numbers
    // disagree with the career it opens.
    const entryId = entryIdFor(uid, s);
    let stage = 'dossier';
    try {
        await d.collection(PROFILE_COLLECTION).doc(entryId).set(docs.profile);
        stage = 'row';
        await d.collection(ROW_COLLECTION).doc(entryId).set(docs.row);
    } catch (e) {
        // SAY THE REAL ERROR OUT LOUD.
        //
        // A toast can only name the likely causes; it cannot say WHICH field a
        // rules predicate rejected, and rules never report that over the wire.
        // Without this, a denied publish is indistinguishable from a bug in the
        // board -- which is exactly how the roster leaderboard's blanket
        // `catch(e){}` hides its own failures. The payload logged here is the
        // literal document that was refused, so it can be checked field by field
        // against validCareerRow()/validCareerDossier() in the console's Rules
        // Playground.
        try {
            console.warn(
                `[LUR] career board publish REFUSED at the ${stage} write `
                + `(collection "${stage === 'row' ? ROW_COLLECTION : PROFILE_COLLECTION}")`,
                {
                    code: e && e.code,
                    message: e && e.message,
                    uid,
                    slot: s,
                    payload: stage === 'row' ? docs.row : { ...docs.profile, blob: `<${blobBytes} chars>` },
                    rowKeyCount: Object.keys(docs.row).length,
                    profileKeyCount: Object.keys(docs.profile).length,
                    rowBytes,
                    blobBytes,
                    deviceNow: Date.now(),
                    deviceTime: new Date().toISOString(),
                },
            );
        } catch (_) { /* console is not load-bearing */ }

        if (isDenied(e)) return done(false, 'denied', DENIED_MESSAGE);
        if (isOffline(e)) return done(false, 'offline', OFFLINE_MESSAGE);
        return done(false, 'error', 'Publish failed: ' + errText(e));
    }

    // Refresh from what was actually written. sanitizeRow is the identical
    // transform every reader applies to this document, so this is exact — a
    // re-read would cost a round trip to learn what we just sent.
    setEntry(s, { ...sanitizeRow(entryId, docs.row), isMe: true });
    setHidden(s, false);
    _sigs[s] = rowSignature(docs.row, docs.blob);
    _lastWrite[s] = Date.now();

    // The board and this entry's dossier are both stale now.
    _pages.clear();
    _dossiers.delete(entryId);

    // The pre-slot document, if this account still has one, is now a duplicate
    // of a career that also lives at a per-slot path. Cleaning it up is a
    // best-effort courtesy and never a reason to report failure.
    purgeLegacyEntry(d, uid);

    return done(true, 'ok', 'Career published to the global board.');
}

/**
 * Delete the ONE-PER-ACCOUNT document this board used to write.
 *
 * Every account published before per-slot entries existed holds a row at the
 * bare `careerBoard/{uid}` path. Once the same career has gone up at
 * `{uid}__{slot}`, that older document is a second ranked row for a career the
 * player only has one of — a duplicate on the public board that they can see
 * and cannot remove, because nothing in the new UI addresses it.
 *
 * ONLY FIRES WHEN THE DOCUMENT WAS ACTUALLY SEEN. loadMyEntries() looks for it
 * once per account per session and sets `_legacyFound`; a blind delete-just-in-
 * case would spend two writes per session on every account that has never
 * published, and would make "nothing was deleted" untestable — a delete a
 * harness cannot predict is a delete nobody is checking.
 *
 * Fire-and-forget and never awaited: a failure leaves exactly the state that
 * existed before, and the next publish tries again.
 */
function purgeLegacyEntry(d, uid) {
    if (_legacyPurged || !_legacyFound || !d || !uid) return;
    _legacyPurged = true;
    Promise.resolve()
        .then(() => d.collection(ROW_COLLECTION).doc(uid).delete())
        .then(() => d.collection(PROFILE_COLLECTION).doc(uid).delete())
        .then(() => { _legacyFound = false; _pages.clear(); })
        .catch(() => { _legacyPurged = false; /* the old row stays; retried next publish */ });
}

// ─────────────────────────────────────────────────────────────────────────
//  WRITE — hide and show
// ─────────────────────────────────────────────────────────────────────────
/**
 * Take ONE slot off the board and keep it off.
 *
 * ROW FIRST, then the dossier — the exact inverse of publish, and for the same
 * reason. The row is what makes a career visible and rankable, so it goes even
 * if the second write never lands.
 *
 * The second write is a REWRITE and not a delete, and that is the whole
 * mechanism. Deleting both documents would take the career off the board for
 * about a minute, until the automatic uploader on this device — or on any other
 * device this account is signed into — noticed a slot with a career and no
 * entry and put it straight back. The dossier is rewritten to the hidden marker
 * (career/board.js hiddenProfileFor) so the decision survives a reload, a second
 * browser and a fresh install, without a byte being written to the save.
 *
 * The blob goes to empty in the same write: a hidden career should not leave a
 * readable copy of itself at a public path.
 */
export async function hideCareerSlot(slot, { silent } = {}) {
    const done = (ok, code, message) => {
        if (!silent && message) showToast(message, ok ? 'info' : 'error');
        return { ok, code, message };
    };

    const uid = uidOf();
    if (!uid) return done(false, 'signed-out', 'Sign in first.');

    const d = db();
    if (!d) return done(false, 'offline', OFFLINE_MESSAGE);

    const s = clampSlot(slot);
    const entryId = entryIdFor(uid, s);
    const known = get(myBoardEntries)[s];
    const careerId = known && known.careerId ? known.careerId : fingerprintOfSlot(s);

    try {
        await d.collection(ROW_COLLECTION).doc(entryId).delete();
    } catch (e) {
        const message = isDenied(e)
            ? 'The server refused the removal. The career board rules may not be published yet.'
            : ('Could not hide that career: ' + errText(e));
        return done(false, isDenied(e) ? 'denied' : 'error', message);
    }

    // MARK BEFORE REPORTING. If this second write fails the career is already
    // off the board, and the local flag is what stops this session's uploader
    // undoing that inside the minute. The cross-device half is lost until the
    // next successful hide, which is strictly better than re-listing a career
    // the player just removed.
    setHidden(s, true);
    setEntry(s, null);
    delete _sigs[s];

    let durable = true;
    try {
        await d.collection(PROFILE_COLLECTION).doc(entryId).set(hiddenProfileFor(careerId));
    } catch (e) {
        durable = false;
    }

    _pages.clear();
    _dossiers.delete(entryId);

    if (!durable) {
        // NOT A SUCCESS, even though the career really is off the board.
        //
        // The dossier is what makes a hide stick. Without it the OLD one is
        // still sitting at the public path with hidden:false and a full,
        // readable blob — so the career's whole record is still downloadable by
        // anyone with the address, and THIS device puts the row back on its
        // next cold start, because loadMyEntries will read that dossier and
        // conclude the slot was never hidden. Reporting ok:true here would put
        // an amber "Hidden" chip over a state that is neither hidden nor
        // durable, and the player would find the career back on the board with
        // no idea why. ok:false is what makes CareerBoard render the notice
        // panel, whose retry button is the actual fix.
        return done(false, 'partial',
            'That career is off the board, but the hide could not be saved to your account. Its full '
            + 'record is still readable at its public address, and this device will put the career back '
            + 'the next time the page loads. Try again to make it stick.');
    }

    return done(true, 'ok', 'That career is hidden from the global board.');
}

/**
 * Put a hidden slot back, immediately.
 *
 * Clearing the flag alone would work — the uploader would pick the slot up
 * within a minute — but a button that appears to do nothing for a minute reads
 * as broken, so this publishes on the spot.
 */
export async function showCareerSlot(slot, { silent } = {}) {
    const s = clampSlot(slot);
    setHidden(s, false);
    delete _sigs[s];
    delete _lastWrite[s];
    return publishCareerSlot(s, { silent });
}

/** The fingerprint of whatever is in a slot right now, or ''. Wrapped because
 *  careerSlotRaw reads and re-parses localStorage and a corrupt slot must cost
 *  a hide nothing. */
function fingerprintOfSlot(slot) {
    try {
        const raw = careerSlotRaw(clampSlot(slot));
        return raw ? careerFingerprint(raw) : '';
    } catch (e) { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────
//  WRITE — the automatic uploader
// ─────────────────────────────────────────────────────────────────────────
/**
 * Put ONE slot on the board, or refresh what is already there.
 *
 * Silent throughout, because nothing here has a press behind it. Returns true
 * only when a write actually landed.
 *
 * Every one of these must hold, and the order matters — the cheap local
 * refusals come first so a hidden or unchanged slot never touches the network:
 *
 *   1. Firestore is reachable and somebody is signed in.
 *   2. The slot holds a created career ON DISK. The store handed to
 *      maybeAutoPublish is a courtesy; the document must describe what is
 *      actually saved, and a debounced save may not have flushed yet.
 *   3. The slot is not HIDDEN — and "hidden" has to be KNOWN, not assumed. A
 *      cold start that has not read the dossier yet declines rather than
 *      guessing, which is what stops a second device re-listing a career the
 *      player hid on the first.
 *   4. The content signature moved. This is the real gate; the timer below only
 *      bounds how often the question is asked.
 *   5. The documents fit their size limits.
 *
 * NOTE what is deliberately NOT checked any more: whether a row already exists.
 * Publication is no longer an opt-in, so "there is nothing up there yet" is a
 * reason to write, not a reason to stop.
 */
async function syncSlot(slot, { ignoreFloor = false } = {}) {
    const d = db();
    if (!d) return false;

    const uid = uidOf();
    if (!uid) return false;

    const s = clampSlot(slot);

    // THE HIDDEN CHECK HAS NO OVERRIDE. Nothing in this module re-lists a
    // hidden career, not even the manual "Sync now" — only showCareerSlot()
    // does that, and only on a press. `ignoreFloor` skips the RATE LIMIT and
    // nothing else, which is what makes a repair button safe to hand to a
    // player who has deliberately taken a career down.
    if (get(myBoardHidden)[s]) return false;
    // Never publish on an assumption either. An unread dossier means the hidden
    // flag is unknown for this slot, and unknown is not permission.
    if (!_hiddenKnown[s]) return false;

    if (!ignoreFloor && (Date.now() - (_lastWrite[s] || 0)) < AUTO_PUBLISH_MS) return false;

    let raw = null;
    try { raw = careerSlotRaw(s); } catch (e) { raw = null; }
    if (!raw) return false;

    const docs = buildBoardDocs(raw, { uid, displayName: nameOf(), slot: s });
    if (!docs) return false;

    // AND THE SIGNATURE HAS NO OVERRIDE EITHER. Two identical documents are two
    // identical documents however the sweep was triggered; a "Sync now" that
    // rewrote them would turn an impatient player into a write amplifier.
    // publishCareerSlot() is the unconditional writer, for the two places that
    // genuinely need one — an explicit publish and un-hiding.
    const sig = rowSignature(docs.row, docs.blob);
    if (sigEqual(sig, _sigs[s])) return false;

    if (JSON.stringify(docs.row).length > BOARD_ROW_BYTES_MAX) return false;
    if (docs.blob.length > BOARD_BLOB_BYTES_MAX) return false;

    // Stamped BEFORE the write, so a failing write backs off for a minute
    // instead of retrying on every tick.
    _lastWrite[s] = Date.now();

    const entryId = entryIdFor(uid, s);
    try {
        await d.collection(PROFILE_COLLECTION).doc(entryId).set(docs.profile);
        await d.collection(ROW_COLLECTION).doc(entryId).set(docs.row);
    } catch (e) {
        // A BACKGROUND WRITE HAS NO PRESS BEHIND IT, so a toast would be an
        // interruption the player cannot act on and did not ask for. It goes to
        // boardSync instead, which the board screen renders in place — and to
        // the console with the refused payload, which is the only thing that
        // can name WHICH rules predicate said no.
        boardSync.set({
            status: 'error',
            error: isDenied(e) ? DENIED_MESSAGE : (isOffline(e) ? OFFLINE_MESSAGE : errText(e)),
            at: Date.now(),
            slot: s,
        });
        try {
            console.warn('[LUR] career board auto-upload REFUSED', {
                code: e && e.code, message: e && e.message, uid, slot: s, entryId,
            });
        } catch (_) { /* console is not load-bearing */ }
        return false;
    }

    setEntry(s, { ...sanitizeRow(entryId, docs.row), isMe: true });
    _sigs[s] = sig;
    _pages.clear();
    _dossiers.delete(entryId);
    purgeLegacyEntry(d, uid);
    return true;
}

/**
 * Put EVERY save slot on the board and keep it there.
 *
 * The one entry point the rest of the app calls. Idempotent, cheap when there
 * is nothing to do, and safe to call from several screens at once — the sweep
 * floor and the in-flight guard collapse a burst into one pass.
 *
 * `force` is the manual "Sync now" button and the sign-in sweep. It skips the
 * two RATE LIMITS — this sweep's floor and each slot's — and nothing else. The
 * hidden check and the content signature both still apply, so the worst a
 * player can do by holding the button down is spend reads.
 */
let _sweeping = null;
export async function autoSyncBoard({ force = false } = {}) {
    if (_sweeping) return _sweeping;

    const d = db();
    if (!d) return false;
    if (!uidOf()) return false;
    if (!force && (Date.now() - _lastSweep) < AUTO_SYNC_MS) return false;

    _lastSweep = Date.now();
    boardSync.update(v => ({ ...v, status: 'syncing' }));

    _sweeping = (async () => {
        let wrote = false;
        try {
            await loadMyEntries();
            for (const n of SLOT_IDS) {
                // Sequential on purpose. Three concurrent publishes is six
                // writes in flight for a board nobody is watching in real time,
                // and the failure modes interleave into one unreadable console.
                const did = await syncSlot(n, { ignoreFloor: force });
                wrote = wrote || did;
            }
        } catch (e) {
            boardSync.set({ status: 'error', error: errText(e), at: Date.now(), slot: 0 });
            return false;
        } finally {
            _sweeping = null;
        }
        boardSync.update(v => (v.status === 'error'
            ? v
            : { status: 'ok', error: '', at: Date.now(), slot: 0 }));
        return wrote;
    })();

    return _sweeping;
}

/**
 * The career-event hook, called from CareerShell.
 *
 * Kept under its old name and signature because that is what the shell, the
 * render harness and boardCheck all address it by — but the contract has
 * changed with the mode: it no longer requires an existing row, because there
 * is no longer an opt-in for it to respect. It is now "this slot moved, look at
 * it now" rather than "refresh the one thing the player published".
 *
 * The career object is used ONLY as a cheap early exit. Everything published
 * comes from the slot on disk, which is why a rotten store is simply declined.
 */
export async function maybeAutoPublish(c, slot) {
    if (!c || typeof c !== 'object' || !c.created) return false;
    const s = clampSlot(slot);
    // The entries have to be loaded before anything can be published, or the
    // hidden flag is unknown and syncSlot correctly refuses. On the first call
    // of a session that read IS the work.
    if (!_hiddenKnown[s]) {
        await loadMyEntries();
        // A slot with a career, no row and no dossier is one nobody has ever
        // published; loadMyEntries settles that, but only for slots it found a
        // local save in. Anything still unknown here has no save to publish.
        if (!_hiddenKnown[s]) return false;
    }
    return syncSlot(s);
}

// ─────────────────────────────────────────────────────────────────────────
//  DERIVED STATE — "is this the published one?"
// ─────────────────────────────────────────────────────────────────────────
/**
 * Whether the career object in hand is the one on the board.
 *
 * PURE and DERIVED. There is no published flag anywhere in the save, on
 * purpose: a flag would survive a slot delete, a cloud restore and a sign-out,
 * and every one of those makes it a lie.
 *
 * Prefer this over isSlotPublished() in reactive markup — it reads the store
 * that is already in scope instead of re-parsing a save out of localStorage.
 */
export function isCareerPublished(c) {
    if (!c || !c.created) return false;
    const id = careerFingerprint(c);
    const entries = get(myBoardEntries);
    // ANY slot, not the primary one. A player with three careers up has three
    // matching entries and the one in front of them is rarely the highest
    // ranked of the three.
    for (const n of SLOT_IDS) {
        const row = entries[n];
        if (row && row.careerId && row.careerId === id) return true;
    }
    return false;
}

/**
 * The same question for a slot the player is not currently in — the slot
 * picker and the board screen. Reads the slot, never switches to it.
 *
 * BOTH HALVES ARE CHECKED: there is an entry at that slot, AND its careerId is
 * the fingerprint of the career sitting in that slot on this device. The second
 * half is what catches a slot the player has since deleted and started over in,
 * whose old career is still on the board under the same slot number.
 */
export function isSlotPublished(slot) {
    const s = clampSlot(slot);
    const row = get(myBoardEntries)[s];
    if (!row || !row.careerId) return false;
    let raw = null;
    try { raw = careerSlotRaw(s); } catch (e) { raw = null; }
    if (!raw) return false;
    return careerFingerprint(raw) === row.careerId;
}

/** Whether the player has taken this slot off the board on purpose. */
export function isSlotHidden(slot) {
    return get(myBoardHidden)[clampSlot(slot)] === true;
}
