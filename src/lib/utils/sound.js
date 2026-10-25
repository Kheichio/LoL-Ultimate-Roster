let _ctx = null;
let _bus = null;
// Module scope, so this runs on IMPORT. Unguarded it makes every module that
// transitively reaches sound.js unloadable outside a browser — which is most of
// the career mode, and every headless tool that touches it.
let _muted = typeof localStorage !== 'undefined' && localStorage.getItem('lur_sound_muted') === '1';
// Volume 0-100, a device preference set from the Settings panel. It scales the master gain,
// so the mix and the limiter below behave exactly as before at 100.
const MASTER_GAIN = 0.55;
function readVolume() {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('lur_sound_volume') : null;
        if (raw === null) return 100;
        const v = Math.round(Number(raw));
        return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 100;
    } catch (e) { return 100; }
}
let _volume = readVolume();

function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
}

export function isMuted() { return _muted; }
export function toggleMute() {
    _muted = !_muted;
    localStorage.setItem('lur_sound_muted', _muted ? '1' : '0');
    return _muted;
}

export function getVolume() { return _volume; }
export function setVolume(v) {
    const n = Math.round(Number(v));
    _volume = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
    try { localStorage.setItem('lur_sound_volume', String(_volume)); } catch (e) { /* private mode */ }
    if (_bus) _bus.master.gain.value = MASTER_GAIN * _volume / 100;
    return _volume;
}

// ─────────────────────────────────────────────────────────────────────────
//  THE MIX BUS
//  Every voice goes through one chain, built once:
//    voices → dry ─────────────┐
//           → echo (delay+fb) ─┴→ low-pass → limiter → master → speakers
//  The old engine wired raw square and sawtooth oscillators straight to the
//  speakers with a 0.1+ gain and no attack, which is what made it harsh: a
//  square wave is all odd harmonics up to Nyquist, and starting a note at full
//  volume clicks. Here every note is a sine or a soft triangle, every note fades
//  in over a few milliseconds, the low-pass shaves anything above ~5kHz, and the
//  compressor stops two sounds landing together from clipping.
// ─────────────────────────────────────────────────────────────────────────
function bus() {
    if (_bus) return _bus;
    const c = ctx();
    const master = c.createGain();
    master.gain.value = MASTER_GAIN * _volume / 100;

    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    tone.Q.value = 0.5;

    // A short, quiet slap-back. Enough to make a pluck bloom instead of stopping dead,
    // nowhere near enough to smear a click.
    const echo = c.createDelay(1);
    echo.delayTime.value = 0.11;
    const feedback = c.createGain();
    feedback.gain.value = 0.24;
    const echoWet = c.createGain();
    echoWet.gain.value = 0.16;
    const echoDamp = c.createBiquadFilter();
    echoDamp.type = 'lowpass';
    echoDamp.frequency.value = 2600;

    const input = c.createGain();
    input.connect(tone);
    input.connect(echo);
    echo.connect(echoDamp);
    echoDamp.connect(feedback);
    feedback.connect(echo);
    echoDamp.connect(echoWet);
    echoWet.connect(tone);
    tone.connect(limiter);
    limiter.connect(master);
    master.connect(c.destination);

    _bus = { input, master };
    return _bus;
}

// Equal-tempered note frequencies used below, so the sounds read as music rather
// than as arbitrary numbers. A4 = 440.
const N = {
    C4: 261.63, E4: 329.63, G4: 392.0,
    C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77,
    C6: 1046.5, E6: 1318.51, G6: 1567.98,
};

/**
 * One enveloped voice. `attack` is linear from silence (no click), the tail is
 * exponential (sounds natural), and the oscillator is stopped just after the tail
 * so nothing is left running.
 */
function voice(at, freq, dur, { type = 'sine', gain = 0.08, attack = 0.006, glideTo = null, detune = 0 } = {}) {
    const c = ctx();
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur * 0.8);
    if (detune) osc.detune.setValueAtTime(detune, at);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(bus().input);
    osc.start(at);
    osc.stop(at + dur + 0.02);
}

// A soft bell: a sine fundamental plus a much quieter sine an octave up that dies
// first. That is the whole trick behind a "pleasant" UI chime.
function bell(at, freq, dur, gain = 0.07) {
    voice(at, freq, dur, { gain });
    voice(at, freq * 2, dur * 0.45, { gain: gain * 0.28 });
}

// Band-passed noise with a rising centre — the "air" of a pack being torn open.
let _noise = null;
function noiseBuffer() {
    if (_noise) return _noise;
    const c = ctx();
    const len = Math.floor(c.sampleRate * 0.6);
    _noise = c.createBuffer(1, len, c.sampleRate);
    const data = _noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return _noise;
}

function whoosh(at, dur, gain = 0.05) {
    const c = ctx();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer();
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(380, at);
    band.frequency.exponentialRampToValueAtTime(2400, at + dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(band);
    band.connect(env);
    env.connect(bus().input);
    src.start(at);
    src.stop(at + dur + 0.02);
}

const SOUNDS = {
    // A short, rounded "pop" rather than a beep. Clicks fire constantly in the career
    // screens, so this is deliberately the quietest thing in the file.
    click: (t) => { voice(t, 720, 0.07, { gain: 0.035, attack: 0.003, glideTo: 480 }); },

    // Two rising bell notes, a fifth apart — the "got it" chime.
    claim: (t) => {
        bell(t, N.E5, 0.32, 0.06);
        bell(t + 0.075, N.B5, 0.42, 0.055);
    },

    // Air, then a little major arpeggio as the cards land.
    pack: (t) => {
        whoosh(t, 0.34, 0.045);
        bell(t + 0.22, N.C5, 0.35, 0.05);
        bell(t + 0.29, N.E5, 0.35, 0.05);
        bell(t + 0.36, N.G5, 0.5, 0.05);
    },

    // A sparkling major arpeggio climbing into the next octave, with a soft pad
    // underneath so it lands as a moment rather than as a run of beeps.
    rare: (t) => {
        voice(t, N.C4, 0.9, { type: 'triangle', gain: 0.03, attack: 0.05 });
        [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => bell(t + i * 0.065, f, 0.55 + i * 0.05, 0.045));
        bell(t + 0.38, N.G6, 0.7, 0.025);
    },

    // A small warm fanfare: a rising pickup into a held major triad.
    win: (t) => {
        bell(t, N.G4, 0.25, 0.05);
        bell(t + 0.09, N.C5, 0.25, 0.05);
        const h = t + 0.19;
        voice(h, N.C5, 0.85, { type: 'triangle', gain: 0.045, attack: 0.02 });
        voice(h, N.E5, 0.85, { type: 'triangle', gain: 0.04, attack: 0.02, detune: 3 });
        voice(h, N.G5, 0.85, { type: 'triangle', gain: 0.035, attack: 0.02, detune: -3 });
        bell(h, N.C6, 0.6, 0.03);
    },

    // A gentle falling phrase in a low, round register. It should read as "not this
    // time", not as an error buzzer — the old one was a descending sawtooth.
    lose: (t) => {
        voice(t, N.G4, 0.3, { gain: 0.05, attack: 0.012 });
        voice(t + 0.16, N.E4, 0.3, { gain: 0.045, attack: 0.012 });
        voice(t + 0.32, N.C4, 0.6, { type: 'triangle', gain: 0.045, attack: 0.015, glideTo: N.C4 * 0.97 });
    },
};

// A burst of identical sounds in one frame (bulk claims, a key held down) used to
// stack into one loud, phasey blast. One per type per 40ms is plenty.
const _lastPlayed = {};

export function playSound(type) {
    if (_muted) return;
    const play = SOUNDS[type];
    if (!play) return;
    try {
        const c = ctx();
        if (c.state === 'suspended') c.resume();
        const now = c.currentTime;
        if (_lastPlayed[type] !== undefined && now - _lastPlayed[type] < 0.04) return;
        _lastPlayed[type] = now;
        // Schedule a hair ahead of "now" so the first attack ramp is never truncated.
        play(now + 0.01);
    } catch (e) {}
}
