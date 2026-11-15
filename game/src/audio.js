// Synthesised WebAudio sound effects and a quiet bass-pulse music loop.
// No audio files, no network: every sound is an oscillator or filtered noise built
// here. The context is created lazily on the first user gesture (browsers block
// audio before one), and every call is guarded so a headless run never throws.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let musicTimer = 0;
  let musicStep = 0;
  let musicOn = false;

  /** Bass line the loop walks, in Hz (A minor, low and quiet). */
  const BASS_NOTES = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Resume the context after a gesture; safe to call any time. */
  function unlock() {
    if (ensure() && context.state === 'suspended') {
      context.resume().catch(() => {});
    }
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    try {
      const now = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function noise(duration, volume, filterFreq) {
    if (!ensure() || muted) return;
    try {
      const now = context.currentTime;
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(now);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  /** One short laser blip for the player's gun. */
  function shoot() {
    tone(880 + Math.random() * 120, 0.07, 'square', 0.05, 320);
  }

  /** A dull thud when a bullet or the player is hit. */
  function hit() {
    tone(160, 0.09, 'sawtooth', 0.12, 70);
  }

  /** Filtered-noise burst for an enemy exploding. */
  function explosion(big) {
    noise(big ? 0.5 : 0.28, big ? 0.35 : 0.2, big ? 900 : 1400);
    tone(big ? 90 : 140, big ? 0.4 : 0.2, 'sine', 0.25, 40);
  }

  /** Rising ping when an XP shard is collected. */
  function pickup(combo) {
    const step = Math.min(combo || 0, 12);
    tone(660 * Math.pow(1.059, step), 0.09, 'sine', 0.08, 990 * Math.pow(1.059, step));
  }

  /** Little arpeggio when the player levels up. */
  function levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.16, 'triangle', 0.14), i * 70);
    });
  }

  /** Low horn when a wave (or the boss) arrives. */
  function waveHorn() {
    tone(110, 0.5, 'sawtooth', 0.12, 220);
    tone(165, 0.5, 'sawtooth', 0.07, 330);
  }

  /** Descending notes for game over. */
  function gameOver() {
    [392, 311, 233, 175].forEach((freq, i) => {
      setTimeout(() => tone(freq, 0.3, 'triangle', 0.14), i * 160);
    });
  }

  /** Whoosh for a dash. */
  function dash() {
    noise(0.16, 0.12, 2400);
  }

  /** Advance the bass-pulse loop; call once a frame while playing. */
  function updateMusic(dt, playing) {
    if (!playing || muted) {
      musicOn = false;
      return;
    }
    if (!musicOn) {
      musicOn = true;
      musicTimer = 0;
      musicStep = 0;
      unlock();
    }
    musicTimer -= dt;
    if (musicTimer <= 0) {
      musicTimer = 0.31;
      const freq = BASS_NOTES[musicStep % BASS_NOTES.length];
      musicStep += 1;
      tone(freq, 0.28, 'sine', 0.1);
      if (musicStep % 4 === 1) tone(freq * 4, 0.05, 'square', 0.015);
    }
  }

  return { unlock, setMuted, isMuted, shoot, hit, explosion, pickup, levelUp, waveHorn, gameOver, dash, updateMusic };
}
