// Synthesised sound: every effect is an oscillator or filtered noise built
// with the Web Audio API, so the game ships no audio files at all. The context
// starts on the first user gesture (browsers require one); until then every
// call is a silent no-op, and headless runs never hear a thing.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let padNodes = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone({ freq, to, seconds, type = 'sine', gain = 0.2, delay = 0 }) {
    if (muted || !ensure() || context.state === 'suspended') return;
    try {
      const start = context.currentTime + delay;
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      osc.connect(amp);
      amp.connect(master);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
    } catch {
      // Audio is decoration: a failure here never stops the game.
    }
  }

  function noise({ seconds, gain = 0.2, freq = 1200, delay = 0 }) {
    if (muted || !ensure() || context.state === 'suspended') return;
    try {
      const start = context.currentTime + delay;
      const length = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const amp = context.createGain();
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      source.connect(filter);
      filter.connect(amp);
      amp.connect(master);
      source.start(start);
    } catch {
      // Audio is decoration: a failure here never stops the game.
    }
  }

  function startPad() {
    if (muted || !ensure() || padNodes || context.state === 'suspended') return;
    try {
      const gain = context.createGain();
      gain.gain.value = 0.045;
      gain.connect(master);
      const oscillators = [55, 82.4, 110].map((freq) => {
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start();
        return osc;
      });
      padNodes = { gain, oscillators };
    } catch {
      padNodes = null;
    }
  }

  function stopPad() {
    if (!padNodes) return;
    try {
      for (const osc of padNodes.oscillators) osc.stop();
      padNodes.gain.disconnect();
    } catch {
      // Already stopped.
    }
    padNodes = null;
  }

  return {
    /** Call on any user gesture: unlocks the context and starts the pad. */
    resume() {
      if (!ensure()) return;
      if (context.state === 'suspended') context.resume().catch(() => {});
      startPad();
    },
    setMuted(value) {
      muted = value;
      if (muted) stopPad();
      else startPad();
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone({ freq: 880, to: 440, seconds: 0.07, type: 'square', gain: 0.05 });
    },
    hit() {
      noise({ seconds: 0.12, gain: 0.16, freq: 900 });
      tone({ freq: 160, to: 60, seconds: 0.16, type: 'sawtooth', gain: 0.12 });
    },
    explosion() {
      noise({ seconds: 0.3, gain: 0.22, freq: 700 });
      tone({ freq: 120, to: 40, seconds: 0.3, type: 'sine', gain: 0.2 });
    },
    pickup() {
      tone({ freq: 1180, to: 1560, seconds: 0.09, type: 'sine', gain: 0.08 });
    },
    levelup() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        tone({ freq, seconds: 0.16, type: 'triangle', gain: 0.14, delay: i * 0.08 });
      });
    },
    click() {
      tone({ freq: 660, seconds: 0.06, type: 'triangle', gain: 0.1 });
    },
    boss() {
      tone({ freq: 65, to: 40, seconds: 0.9, type: 'sawtooth', gain: 0.22 });
      tone({ freq: 98, to: 55, seconds: 0.9, type: 'square', gain: 0.1, delay: 0.1 });
    },
    gameover() {
      [392, 311, 233, 175].forEach((freq, i) => {
        tone({ freq, seconds: 0.3, type: 'triangle', gain: 0.14, delay: i * 0.22 });
      });
    },
    victory() {
      [523, 659, 784, 1047, 1319].forEach((freq, i) => {
        tone({ freq, seconds: 0.22, type: 'triangle', gain: 0.14, delay: i * 0.11 });
      });
    },
  };
}
