// NOVA SWARM — every sound is synthesized with WebAudio: no audio files,
// no network, nothing to download. All of it is defensive: if the browser
// blocks audio (or the page never gets a gesture), the game stays silent
// and keeps playing. Sounds are queued as short blips and noise bursts.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  // The bass line: a slow, dark pulse that keeps the arena humming.
  const BASS_LINE = [55, 0, 55, 0, 65.41, 0, 49, 0];

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.45;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.25);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  // Call from the first user gesture (Enter / click) to unlock audio.
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    return c !== null;
  }

  function blip(freq, dur, type, vol, slideTo) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const t = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // A failed blip is never worth breaking the game over.
    }
  }

  function noise(dur, vol, cutoff) {
    const c = ensure();
    if (!c || muted || !noiseBuf) return;
    try {
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = c.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch {
      // See blip.
    }
  }

  function startMusic() {
    if (musicTimer !== null) return;
    ensure();
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const freq = BASS_LINE[musicStep % BASS_LINE.length];
      musicStep += 1;
      if (freq > 0) blip(freq, 0.34, 'triangle', 0.16, freq * 0.5);
    }, 250);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    unlock,
    startMusic,
    stopMusic,
    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.value = m ? 0 : 0.45;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      blip(920 + Math.random() * 120, 0.07, 'square', 0.05, 320);
    },
    hit() {
      blip(300, 0.05, 'square', 0.06, 140);
    },
    explode() {
      noise(0.28, 0.22, 900);
      blip(140, 0.22, 'sawtooth', 0.1, 40);
    },
    pickup() {
      blip(1180, 0.08, 'sine', 0.07, 1760);
    },
    levelup() {
      blip(523, 0.1, 'sine', 0.09);
      window.setTimeout(() => blip(659, 0.1, 'sine', 0.09), 90);
      window.setTimeout(() => blip(784, 0.16, 'sine', 0.1), 180);
    },
    hurt() {
      blip(180, 0.18, 'sawtooth', 0.14, 60);
      noise(0.12, 0.12, 500);
    },
    dash() {
      noise(0.14, 0.08, 2400);
    },
    boss() {
      blip(98, 0.5, 'sawtooth', 0.12, 49);
      noise(0.4, 0.1, 300);
    },
    nova() {
      blip(660, 0.3, 'sine', 0.1, 1320);
      noise(0.2, 0.06, 1800);
    },
  };
}
