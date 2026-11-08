// ═══════════════════════════════════════════════════════════════════════════
//  SAVE COMPRESSION
// ═══════════════════════════════════════════════════════════════════════════
//  An Ultimate Manager save is megabytes of JSON and localStorage holds about five
//  million characters for the whole site, shared by every slot of every gamemode.
//  This is LZW over the UTF-8 bytes, packed 15 bits to a character, which takes a
//  save to about a sixth of the characters.
//
//  Characters are 32..32799, so never a control character and never a surrogate
//  (a lone surrogate does not survive every browser's storage). A packed value
//  starts with \u0001, which no JSON text can, so an old plain save is told apart
//  by its first character and loads exactly as it always did.
const MARK = '\u0001Z1';
const CLEAR = 256;
const FIRST = 257;
const MAX_BITS = 16;
const MAX_CODE = 1 << MAX_BITS;
const HASH_BITS = 18;
const HASH_SIZE = 1 << HASH_BITS;
const HASH_MASK = HASH_SIZE - 1;
const OFFSET = 32;

export const isPacked = (s) => typeof s === 'string' && s.charCodeAt(0) === 1;

export function pack(text) {
    const bytes = new TextEncoder().encode(text);
    const keys = new Int32Array(HASH_SIZE).fill(-1);
    const vals = new Int32Array(HASH_SIZE);
    const out = [];
    let acc = 0, accBits = 0;
    const put = (code, bits) => {
        acc = acc * (1 << bits) + code;
        accBits += bits;
        while (accBits >= 15) {
            accBits -= 15;
            const div = 2 ** accBits;
            const v = Math.floor(acc / div);
            out.push(v + OFFSET);
            acc -= v * div;
        }
    };
    let next = FIRST, bits = 9;
    let prefix = bytes.length ? bytes[0] : -1;
    for (let i = 1; i < bytes.length; i++) {
        const b = bytes[i];
        const key = (prefix << 8) | b;
        let h = Math.imul(key, 0x9E3779B1) >>> (32 - HASH_BITS);
        let found = -1;
        for (;;) {
            const k = keys[h];
            if (k === -1) break;
            if (k === key) { found = vals[h]; break; }
            h = (h + 1) & HASH_MASK;
        }
        if (found >= 0) { prefix = found; continue; }
        put(prefix, bits);
        if (next < MAX_CODE) {
            keys[h] = key; vals[h] = next++;
            if (next > (1 << bits) && bits < MAX_BITS) bits++;
        } else {
            put(CLEAR, bits);
            keys.fill(-1);
            next = FIRST; bits = 9;
        }
        prefix = b;
    }
    if (prefix >= 0) put(prefix, bits);
    if (accBits) out.push(acc * 2 ** (15 - accBits) + OFFSET);
    let body = '';
    for (let i = 0; i < out.length; i += 8192) body += String.fromCharCode.apply(null, out.slice(i, i + 8192));
    return `${MARK}${bytes.length.toString(36)}|${body}`;
}

export function unpack(s) {
    const bar = s.indexOf('|');
    const size = parseInt(s.slice(MARK.length, bar), 36);
    const bytes = new Uint8Array(size);
    const parent = new Int32Array(MAX_CODE + 1);
    const tail = new Uint8Array(MAX_CODE + 1);
    const lens = new Int32Array(MAX_CODE + 1);
    for (let i = 0; i < 256; i++) { tail[i] = i; lens[i] = 1; parent[i] = -1; }
    let pos = bar + 1, acc = 0, accBits = 0;
    const take = (bits) => {
        while (accBits < bits) {
            if (pos >= s.length) return -1;
            acc = acc * 32768 + (s.charCodeAt(pos++) - OFFSET);
            accBits += 15;
        }
        accBits -= bits;
        const div = 2 ** accBits;
        const v = Math.floor(acc / div);
        acc -= v * div;
        return v;
    };
    /** Write a code's bytes at `at`, returning its first byte. */
    const emit = (code, at) => {
        let c = code, i = at + lens[code] - 1;
        while (c >= 0 && i >= at) { bytes[i--] = tail[c]; c = parent[c]; }
        return bytes[at];
    };
    let next = FIRST, bits = 9, prev = -1, n = 0;
    while (n < size) {
        const code = take(bits);
        if (code < 0) break;
        if (code === CLEAR) { next = FIRST; bits = 9; prev = -1; continue; }
        if (prev < 0) {
            n += lens[code]; emit(code, n - lens[code]);
            prev = code;
            continue;
        }
        const at = n;
        if (code < next) {
            n += lens[code];
            const first = emit(code, at);
            if (next < MAX_CODE) { parent[next] = prev; tail[next] = first; lens[next] = lens[prev] + 1; next++; }
        } else {
            // The one code the decoder has not built yet: the previous string plus its own first byte.
            const first = emit(prev, at);
            parent[next] = prev; tail[next] = first; lens[next] = lens[prev] + 1;
            n += lens[next];
            bytes[n - 1] = first;
            next++;
        }
        prev = code;
        if (next + 1 > (1 << bits) && bits < MAX_BITS) bits++;
    }
    return new TextDecoder().decode(bytes);
}
