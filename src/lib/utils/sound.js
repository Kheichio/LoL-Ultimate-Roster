let _ctx = null;
let _muted = localStorage.getItem('lur_sound_muted') === '1';

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

export function playSound(type) {
    if (_muted) return;
    try {
        const c = ctx();
        if (c.state === 'suspended') c.resume();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.connect(gain);
        gain.connect(c.destination);
        const t = c.currentTime;

        const sounds = {
            pack:  () => { osc.type='sine'; osc.frequency.setValueAtTime(440,t); osc.frequency.exponentialRampToValueAtTime(880,t+0.15); gain.gain.setValueAtTime(0.15,t); gain.gain.exponentialRampToValueAtTime(0.01,t+0.3); osc.start(t); osc.stop(t+0.3); },
            win:   () => { osc.type='square'; osc.frequency.setValueAtTime(523,t); osc.frequency.setValueAtTime(659,t+0.1); osc.frequency.setValueAtTime(784,t+0.2); gain.gain.setValueAtTime(0.1,t); gain.gain.exponentialRampToValueAtTime(0.01,t+0.4); osc.start(t); osc.stop(t+0.4); },
            lose:  () => { osc.type='sawtooth'; osc.frequency.setValueAtTime(300,t); osc.frequency.exponentialRampToValueAtTime(150,t+0.3); gain.gain.setValueAtTime(0.08,t); gain.gain.exponentialRampToValueAtTime(0.01,t+0.4); osc.start(t); osc.stop(t+0.4); },
            click: () => { osc.type='sine'; osc.frequency.setValueAtTime(600,t); gain.gain.setValueAtTime(0.06,t); gain.gain.exponentialRampToValueAtTime(0.01,t+0.08); osc.start(t); osc.stop(t+0.08); },
            rare:  () => { osc.type='sine'; osc.frequency.setValueAtTime(660,t); osc.frequency.setValueAtTime(880,t+0.1); osc.frequency.setValueAtTime(1100,t+0.2); gain.gain.setValueAtTime(0.12,t); gain.gain.exponentialRampToValueAtTime(0.01,t+0.5); osc.start(t); osc.stop(t+0.5); },
            claim: () => { osc.type='triangle'; osc.frequency.setValueAtTime(500,t); osc.frequency.setValueAtTime(700,t+0.08); gain.gain.setValueAtTime(0.1,t); gain.gain.exponentialRampToValueAtTime(0.01,t+0.15); osc.start(t); osc.stop(t+0.15); },
        };
        if (sounds[type]) sounds[type]();
    } catch(e) {}
}
