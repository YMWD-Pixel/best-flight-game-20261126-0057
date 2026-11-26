// Synthesised sound: no audio files, everything is WebAudio oscillators and
// filtered noise, started on the first user gesture (browsers demand that).

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    started = true;
    // Engine: two detuned saws through a lowpass, pitch follows throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55.7;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    osc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    osc2.start();
    // Wind: looped noise through a bandpass, louder with speed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
    return true;
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
    },
    get muted() { return muted; },
    /** Call every frame while flying: engine hum and wind follow the plane. */
    update(throttle, speed, airborne) {
      if (!ctx || muted) return;
      if (ctx.state === 'suspended') void ctx.resume();
      const rpm = 50 + throttle * 75 + (airborne ? 8 : 0);
      engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + throttle * 700, ctx.currentTime, 0.1);
      engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.05 : 0.035, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.12, speed * 0.0016), ctx.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed * 9, ctx.currentTime, 0.15);
    },
    ring(perfect) {
      tone(880, 0.22, 'sine', 0.22);
      tone(1318, 0.3, 'sine', 0.2, 0.09);
      if (perfect) tone(1760, 0.4, 'sine', 0.18, 0.18);
    },
    crate() {
      tone(660, 0.15, 'triangle', 0.22);
      tone(990, 0.2, 'triangle', 0.2, 0.08);
    },
    land() {
      tone(523, 0.25, 'sine', 0.22);
      tone(659, 0.25, 'sine', 0.22, 0.12);
      tone(784, 0.45, 'sine', 0.22, 0.24);
    },
    crash() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const dur = 0.6;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g);
      g.connect(ctx.destination);
      src.start(t0);
      tone(90, 0.5, 'sine', 0.4);
    },
    alarm() {
      tone(440, 0.18, 'square', 0.08);
      tone(440, 0.18, 'square', 0.08, 0.25);
    },
  };
}
