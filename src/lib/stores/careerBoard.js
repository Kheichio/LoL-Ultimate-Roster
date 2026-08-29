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

import { writable, get } from 'svelte/store';
import {
    BOARD_LIMIT, BOARD_SORTS, BOARD_ROW_BYTES_MAX, BOARD_BLOB_BYTES_MAX,
    buildBoardDocs, sanitizeRow, sanitizeDossier, careerFingerprint,
} from '../career/board.js';
import { currentUser } from './auth.js';
import { careerSlotRaw } from './career.js';
import { activeSlot } from '../utils/storage.js';
import { showToast } from './toasts.js';

// ─────────────────────────────────────────────────────────────────────────
//  COLLECTIONS
//  Two TOP-LEVEL collections, never a parent + subcollection: deleting a
//  document does not delete its subcollection in Firestore, so "Remove from
//  board" would orphan the dossier where its owner can no longer reach it.
// ─────────────────────────────────────────────────────────────────────────
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

/** Auto-publish floor. Nothing here initiates a first publish, so this only
 *  rate-limits REFRESHES of a row the player already chose to put up. */
const AUTO_PUBLISH_MS = 60 * 1000;

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

/** The viewer's own published row, or null. THE authority for "am I on the
 *  board" — it comes from the server, so it is right even on a fresh device. */
export const myBoardRow = writable(null);

// ─────────────────────────────────────────────────────────────────────────
//  CACHES  (module-level, deliberately outliving the component tree)
// ─────────────────────────────────────────────────────────────────────────
const _pages = new Map();      // sortKey -> { rows, fetchedAt }
const _dossiers = new Map();   // uid     -> career object (FIFO)

/** Monotonic request id. A player who taps three sort buttons in a second gets
 *  three in-flight reads; without this the slowest one wins the screen. */
let _pageSeq = 0;

/** Auto-publish bookkeeping. Both are session state, never persisted. */
let _lastAutoPublish = 0;
let _myRowSignature = '';

export function clearBoardCaches() {
    _pages.clear();
    _dossiers.clear();
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
    'The server refused the publish. Either the career board rules have not been published '
    + 'in the Firebase console yet, or this device\'s clock is more than 10 minutes off — the '
    + 'board checks freshness against the SERVER clock but stamps the write with your device\'s time.'
    + ' Check the browser console for the exact error and the refused document — if you see '
    + 'ERR_BLOCKED_BY_CLIENT there, it is an ad blocker and not the rules at all.';

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

/** Everything about a row EXCEPT the timestamp. `updatedAt` is Date.now() on
 *  every build, so signing over the whole row would make every auto-publish
 *  look like a change and write a document a minute forever. */
function rowSignature(row) {
    const copy = { ...row };
    delete copy.updatedAt;
    return fnv(JSON.stringify(copy));
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
//  READ — the viewer's own row
// ─────────────────────────────────────────────────────────────────────────
/**
 * One document read: is this account on the board, and with which career?
 *
 * Silent on failure and it does NOT clear myBoardRow on an error — "the read
 * failed" is not "you are unpublished", and the difference decides whether the
 * UI offers Publish or Remove.
 */
export async function loadMyBoardRow() {
    const d = db();
    const uid = uidOf();
    if (!uid) { myBoardRow.set(null); _myRowSignature = ''; return null; }
    if (!d) return get(myBoardRow);

    try {
        const doc = await d.collection(ROW_COLLECTION).doc(uid).get();
        if (!doc.exists) {
            myBoardRow.set(null);
            _myRowSignature = '';
            return null;
        }
        const row = { ...sanitizeRow(doc.id, doc.data()), isMe: true };
        myBoardRow.set(row);
        return row;
    } catch (e) {
        return get(myBoardRow);
    }
}

// ─────────────────────────────────────────────────────────────────────────
//  READ — a stranger's dossier
// ─────────────────────────────────────────────────────────────────────────
/**
 * Fetch and decode one full career. Returns a career-shaped object or null;
 * sanitizeDossier never throws, so a corrupt or hostile document is simply a
 * null the caller renders as "could not be read".
 */
export async function openDossier(uid) {
    const id = (typeof uid === 'string' && uid) ? uid : '';
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
    let stage = 'dossier';
    try {
        await d.collection(PROFILE_COLLECTION).doc(uid).set(docs.profile);
        stage = 'row';
        await d.collection(ROW_COLLECTION).doc(uid).set(docs.row);
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
    myBoardRow.set({ ...sanitizeRow(uid, docs.row), isMe: true });
    _myRowSignature = rowSignature(docs.row);
    _lastAutoPublish = Date.now();

    // The board and this account's dossier are both stale now.
    _pages.clear();
    _dossiers.delete(uid);

    return done(true, 'ok', 'Career published to the global board.');
}

// ─────────────────────────────────────────────────────────────────────────
//  WRITE — unpublish
// ─────────────────────────────────────────────────────────────────────────
/**
 * Take this account off the board.
 *
 * ROW FIRST, then the profile — the exact inverse of publish, and for the same
 * reason. The row is what makes a career visible and rankable, so it goes even
 * if the second delete never lands; a dossier nothing links to is invisible,
 * and the next publish overwrites it.
 */
export async function unpublishCareer() {
    const uid = uidOf();
    if (!uid) { showToast('Sign in first.', 'error'); return { ok: false, code: 'signed-out', message: 'Sign in first.' }; }

    const d = db();
    if (!d) { showToast(OFFLINE_MESSAGE, 'error'); return { ok: false, code: 'offline', message: OFFLINE_MESSAGE }; }

    try {
        await d.collection(ROW_COLLECTION).doc(uid).delete();
    } catch (e) {
        const message = isDenied(e)
            ? 'The server refused the removal. The career board rules may not be published yet.'
            : ('Could not remove your career: ' + errText(e));
        showToast(message, 'error');
        return { ok: false, code: isDenied(e) ? 'denied' : 'error', message };
    }

    // Best effort. Already invisible at this point, so a failure here is not
    // worth an error toast the player can do nothing about.
    try { await d.collection(PROFILE_COLLECTION).doc(uid).delete(); } catch (e) { /* orphan, overwritten on next publish */ }

    myBoardRow.set(null);
    _myRowSignature = '';
    _pages.clear();
    _dossiers.delete(uid);

    showToast('Career removed from the global board.', 'info');
    return { ok: true, code: 'ok', message: 'Career removed from the global board.' };
}

// ─────────────────────────────────────────────────────────────────────────
//  WRITE — background refresh
// ─────────────────────────────────────────────────────────────────────────
/**
 * Keep an ALREADY PUBLISHED row current as the career advances.
 *
 * Nothing is ever published from here. Every one of these must hold:
 *   1. Firestore is reachable
 *   2. somebody is signed in
 *   3. the career passed in is a created one
 *   4. a row for this account already exists on the board — i.e. the player
 *      pressed Publish at some point, on purpose
 *   5. that row's careerId matches this career's fingerprint
 *   6. and the slot being written is the slot that row came from
 *
 * (5) is why the fingerprint is hashed over handle|startAge|path|region only:
 * contracts.changeRole() and switchChampion() rewrite role, champion and
 * playstyle mid-career by design, and a fingerprint that flipped on a role
 * change would silently stop refreshing a row the player never unpublished.
 *
 * (6) costs nothing and closes the one case a fingerprint cannot: two slots
 * holding careers created with the same handle, age, path and region. Failing
 * to refresh is always the safe direction; overwriting the wrong career is not.
 *
 * Silent throughout — this runs on a week tick and has no press behind it.
 * Returns true only when a write actually landed.
 */
export async function maybeAutoPublish(c, slot) {
    const d = db();
    if (!d) return false;

    const uid = uidOf();
    if (!uid) return false;

    if (!c || typeof c !== 'object' || !c.created) return false;

    const mine = get(myBoardRow);
    if (!mine || !mine.careerId) return false;
    if (mine.careerId !== careerFingerprint(c)) return false;

    const s = clampSlot(slot);
    if (mine.slot !== s) return false;

    const now = Date.now();
    if (now - _lastAutoPublish < AUTO_PUBLISH_MS) return false;

    const raw = careerSlotRaw(s);
    if (!raw) return false;
    // The slot on disk, not the store handed in — a debounced save may not have
    // flushed yet, and the document must describe what is actually saved.
    if (careerFingerprint(raw) !== mine.careerId) return false;

    const docs = buildBoardDocs(raw, { uid, displayName: nameOf(), slot: s });
    if (!docs) return false;

    const sig = rowSignature(docs.row);
    if (sig === _myRowSignature) return false;

    if (JSON.stringify(docs.row).length > BOARD_ROW_BYTES_MAX) return false;
    if (docs.blob.length > BOARD_BLOB_BYTES_MAX) return false;

    // Stamped BEFORE the write, so a failing write backs off for a minute
    // instead of retrying on every tick.
    _lastAutoPublish = now;

    try {
        await d.collection(PROFILE_COLLECTION).doc(uid).set(docs.profile);
        await d.collection(ROW_COLLECTION).doc(uid).set(docs.row);
    } catch (e) {
        return false;
    }

    myBoardRow.set({ ...sanitizeRow(uid, docs.row), isMe: true });
    _myRowSignature = sig;
    _pages.clear();
    _dossiers.delete(uid);
    return true;
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
    const mine = get(myBoardRow);
    if (!mine || !mine.careerId) return false;
    return careerFingerprint(c) === mine.careerId;
}

/**
 * The same question for a slot the player is not currently in — the slot
 * picker and the publish screen. Reads the slot, never switches to it.
 */
export function isSlotPublished(slot) {
    const mine = get(myBoardRow);
    if (!mine || !mine.careerId) return false;
    const raw = careerSlotRaw(clampSlot(slot));
    if (!raw) return false;
    return careerFingerprint(raw) === mine.careerId;
}
