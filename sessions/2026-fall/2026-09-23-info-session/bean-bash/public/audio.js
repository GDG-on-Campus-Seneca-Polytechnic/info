// Every sound is synthesised in the browser, so the game stays one folder with no
// audio files to load, no licences to worry about, and nothing to break offline.

let ctx = null;
let master = null;
let musicBus = null; // music sits on its own bus so it can duck under the effects
let meter = null; // lets a rehearsal check that sound is really coming out
let muted = false;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    meter = ctx.createAnalyser();
    meter.fftSize = 256;
    master.connect(meter);
    master.connect(ctx.destination);
  }
  // Browsers only allow audio after a click or key press, so every sound tries to resume.
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ freq, to = freq, dur = 0.2, type = "sine", gain = 0.2, delay = 0, curve = "exp" }) {
  if (muted) return;
  const audio = ensure();
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) {
    if (curve === "exp") osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    else osc.frequency.linearRampToValueAtTime(to, t + dur);
  }
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.4, gain = 0.25, delay = 0, from = 1200, to = 200, q = 1 }) {
  if (muted) return;
  const audio = ensure();
  const t = audio.currentTime + delay;
  const frames = Math.floor(audio.sampleRate * dur);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const amp = audio.createGain();
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(filter).connect(amp).connect(master);
  source.start(t);
}

const NOTE = { C: 261.63, D: 293.66, E: 329.63, G: 392.0, A: 440.0, C2: 523.25, E2: 659.25, G2: 783.99 };

// ---------------------------------------------------------------- music
// A four-bar loop built from oscillators: C - G - Am - F, the friendliest
// progression there is. Two moods: a calm one for the lobby, a busier one
// with drums while a question is running.

const CHORDS = [
  { root: 130.81, notes: [261.63, 329.63, 392.0] }, // C
  { root: 98.0, notes: [246.94, 293.66, 392.0] }, // G
  { root: 110.0, notes: [261.63, 329.63, 440.0] }, // Am
  { root: 87.31, notes: [261.63, 349.23, 440.0] }, // F
];

const music = {
  playing: false,
  mood: "lobby",
  step: 0,
  nextTime: 0,
  timer: null,
};

function stepSeconds() {
  const bpm = music.mood === "play" ? 124 : 96;
  return 60 / bpm / 4; // sixteenth notes
}

function pluck(freq, time, { dur = 0.2, gain = 0.08, type = "triangle" } = {}) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(gain, time + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(amp).connect(musicBus);
  osc.start(time);
  osc.stop(time + dur + 0.03);
}

function drum(time, kind) {
  const frames = Math.floor(ctx.sampleRate * (kind === "hat" ? 0.05 : 0.18));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = kind === "hat" ? "highpass" : "bandpass";
  filter.frequency.value = kind === "hat" ? 7000 : 1800;
  const amp = ctx.createGain();
  amp.gain.value = kind === "hat" ? 0.05 : 0.09;
  source.connect(filter).connect(amp).connect(musicBus);
  source.start(time);

  if (kind === "kick") {
    const osc = ctx.createOscillator();
    const amp2 = ctx.createGain();
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.14);
    amp2.gain.setValueAtTime(0.22, time);
    amp2.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(amp2).connect(musicBus);
    osc.start(time);
    osc.stop(time + 0.2);
  }
}

function scheduleStep(step, time) {
  const bar = Math.floor(step / 16) % 4;
  const beat = step % 16;
  const chord = CHORDS[bar];
  const busy = music.mood === "play";

  // Bass: root on the beat, an octave up on the off-beat when things are busy.
  if (beat % 4 === 0) pluck(chord.root, time, { dur: 0.3, gain: 0.12, type: "sawtooth" });
  else if (busy && beat % 4 === 2) pluck(chord.root * 2, time, { dur: 0.16, gain: 0.07, type: "sawtooth" });

  // Arpeggio over the chord.
  const every = busy ? 2 : 4;
  if (beat % every === 0) {
    const note = chord.notes[(step / every) % chord.notes.length | 0];
    pluck(note * (busy && beat % 8 === 4 ? 2 : 1), time, { dur: busy ? 0.16 : 0.34, gain: busy ? 0.07 : 0.05 });
  }

  if (busy) {
    if (beat === 0 || beat === 8) drum(time, "kick");
    if (beat === 4 || beat === 12) drum(time, "snare");
    if (beat % 2 === 0) drum(time, "hat");
  }
}

function pump() {
  if (!music.playing) return;
  // Schedule a little ahead of the clock so the loop never stutters.
  while (music.nextTime < ctx.currentTime + 0.25) {
    scheduleStep(music.step, music.nextTime);
    music.step = (music.step + 1) % 64;
    music.nextTime += stepSeconds();
  }
}

function fadeMusic(to, seconds = 0.6) {
  if (!musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), t);
  musicBus.gain.linearRampToValueAtTime(to, t + seconds);
}

export const sfx = {
  // Call once from a click or key press, so the browser lets us make noise later.
  unlock() {
    ensure();
  },

  get muted() {
    return muted;
  },

  // For rehearsal checks: is the browser actually letting us play sound?
  status() {
    let peak = 0;
    if (meter) {
      const data = new Uint8Array(meter.fftSize);
      meter.getByteTimeDomainData(data);
      for (const sample of data) peak = Math.max(peak, Math.abs(sample - 128) / 128);
    }
    return { state: ctx ? ctx.state : "none", muted, peak: Number(peak.toFixed(3)) };
  },

  setMuted(value) {
    muted = value;
    if (master) master.gain.value = value ? 0 : 0.9;
  },

  // ---- background music ----

  music(mood) {
    ensure();
    if (mood === "off") {
      fadeMusic(0, 0.8);
      music.playing = false;
      clearInterval(music.timer);
      music.timer = null;
      return;
    }
    music.mood = mood;
    if (!music.playing) {
      music.playing = true;
      music.step = 0;
      music.nextTime = ctx.currentTime + 0.1;
      music.timer = setInterval(pump, 25);
    }
    // Quieter while a question is on screen, so the countdown stays audible.
    fadeMusic(mood === "play" ? 0.5 : 0.85);
  },

  // Drop the music under a big moment, then bring it back.
  duckMusic(seconds = 2.2) {
    if (!music.playing) return;
    fadeMusic(0.12, 0.25);
    setTimeout(() => music.playing && fadeMusic(music.mood === "play" ? 0.5 : 0.85), seconds * 1000);
  },

  join() {
    tone({ freq: NOTE.E, to: NOTE.G2, dur: 0.16, type: "triangle", gain: 0.14 });
  },

  start() {
    noise({ dur: 0.5, gain: 0.18, from: 400, to: 3000 });
    [NOTE.C, NOTE.E, NOTE.G, NOTE.C2].forEach((freq, i) =>
      tone({ freq, dur: 0.22, type: "triangle", gain: 0.18, delay: i * 0.07 })
    );
  },

  // The last few seconds of a question: a click that climbs as time runs out.
  tick(urgent) {
    tone({
      freq: urgent ? 880 : 620,
      to: urgent ? 660 : 520,
      dur: 0.07,
      type: "square",
      gain: urgent ? 0.16 : 0.1,
    });
  },

  reveal() {
    noise({ dur: 0.25, gain: 0.2, from: 3000, to: 600 });
    [NOTE.C2, NOTE.E2, NOTE.G2].forEach((freq, i) =>
      tone({ freq, dur: 0.5, type: "triangle", gain: 0.16, delay: 0.12 + i * 0.06 })
    );
  },

  // A platform letting go: a rumble with a falling whistle for the beans riding it down.
  collapse(delay = 0) {
    noise({ dur: 0.7, gain: 0.3, from: 900, to: 60, delay });
    tone({ freq: 420, to: 60, dur: 0.75, type: "sawtooth", gain: 0.1, delay: delay + 0.05 });
  },

  win() {
    [NOTE.C, NOTE.E, NOTE.G, NOTE.C2, NOTE.E2, NOTE.G2].forEach((freq, i) =>
      tone({ freq, dur: 0.45, type: "triangle", gain: 0.2, delay: i * 0.09 })
    );
    noise({ dur: 1.1, gain: 0.12, from: 6000, to: 2000, delay: 0.2 });
  },

  // Everyone wiped out: the same fanfare, upside down.
  lose() {
    [NOTE.G, NOTE.E, NOTE.C, 196.0].forEach((freq, i) =>
      tone({ freq, dur: 0.4, type: "sawtooth", gain: 0.14, delay: i * 0.12 })
    );
  },
};
