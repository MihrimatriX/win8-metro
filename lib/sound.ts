/**
 * Every sound here is synthesized with Web Audio; the app ships no audio files.
 * The context is created lazily on the first user gesture (browsers block it before that).
 */
type Voice = { type: OscillatorType; freq: number; to?: number; at?: number; dur: number; gain: number; glide?: number };

export type Track = { id: string; title: string; artist: string; bpm: number; seconds: number; palette: [string, string, string] };

/** Music app tracks. Each one is a small generative piece, so they never repeat exactly. */
export const TRACKS: Track[] = [
  { id: "aurora", title: "Kuzey Işığı", artist: "AFU & Web Audio", bpm: 72, seconds: 214, palette: ["#05121f", "#0f5a7a", "#5eead4"] },
  { id: "harbor", title: "Liman", artist: "AFU & Web Audio", bpm: 96, seconds: 187, palette: ["#140a1f", "#6d28d9", "#f0abfc"] },
  { id: "night-train", title: "Gece Treni", artist: "AFU & Web Audio", bpm: 112, seconds: 241, palette: ["#1a0b05", "#b45309", "#fcd34d"] },
];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private music: { stop: () => void } | null = null;
  analyser: AnalyserNode | null = null;
  sfx = true;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.7;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      master.connect(analyser);
      analyser.connect(ctx.destination);
      // Small generated room: noise with an exponential tail.
      const verb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 2.2);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
      }
      verb.buffer = buf;
      const wet = ctx.createGain();
      wet.gain.value = 0.3;
      wet.connect(verb).connect(master);
      this.ctx = ctx;
      this.master = master;
      this.wet = wet;
      this.analyser = analyser;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a user gesture so later sounds are allowed. */
  unlock() {
    this.ensure();
  }

  private play(voices: Voice[], opts: { wet?: number; force?: boolean } = {}) {
    if (!this.sfx && !opts.force) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.wet) return;
    const now = ctx.currentTime + 0.005;
    for (const v of voices) {
      const start = now + (v.at ?? 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, start);
      if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, start + (v.glide ?? v.dur * 0.5));
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(v.gain, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + v.dur);
      osc.connect(g);
      g.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = opts.wet ?? 0.5;
      g.connect(send).connect(this.wet);
      osc.start(start);
      osc.stop(start + v.dur + 0.05);
    }
  }

  tap() {
    this.play([{ type: "sine", freq: 1900, to: 1400, dur: 0.045, gain: 0.03, glide: 0.03 }], { wet: 0.1 });
  }

  open() {
    this.play(
      [
        { type: "sine", freq: 523.25, to: 1046.5, dur: 0.32, gain: 0.04, glide: 0.2 },
        { type: "triangle", freq: 1568, at: 0.08, dur: 0.25, gain: 0.012 },
      ],
      { wet: 0.5 },
    );
  }

  back() {
    this.play([{ type: "sine", freq: 988, to: 587, dur: 0.14, gain: 0.04, glide: 0.09 }], { wet: 0.25 });
  }

  /** Short glassy chime for toast notifications. */
  notify() {
    this.play(
      [
        { type: "sine", freq: 1567.98, dur: 0.6, gain: 0.05 },
        { type: "sine", freq: 2093, at: 0.09, dur: 0.8, gain: 0.045 },
        { type: "triangle", freq: 3135.96, at: 0.09, dur: 0.3, gain: 0.008 },
      ],
      { wet: 0.7 },
    );
  }

  /** Sign-in: a slow rising major chord. */
  login() {
    this.play(
      [392, 493.88, 587.33, 783.99, 987.77].map((f, i) => ({ type: "sine" as const, freq: f, at: i * 0.09, dur: 1.6 - i * 0.1, gain: 0.04 })),
      { wet: 1 },
    );
  }

  shutdown() {
    this.play(
      [783.99, 587.33, 493.88, 392].map((f, i) => ({ type: "sine" as const, freq: f, at: i * 0.12, dur: 1.2, gain: 0.04 })),
      { wet: 1 },
    );
  }

  error() {
    this.play([{ type: "triangle", freq: 330, to: 262, dur: 0.2, gain: 0.05 }], { wet: 0.2 });
  }

  /** Start one of TRACKS (null stops). Returns the start time so the UI can show progress. */
  playTrack(id: string | null) {
    this.music?.stop();
    this.music = null;
    if (!id) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.wet) return;
    const track = TRACKS.find((t) => t.id === id);
    if (!track) return;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    out.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    out.connect(send).connect(this.wet);

    const note = (midi: number, at: number, dur: number, gain: number, type: OscillatorType = "triangle", cutoff = 2400) => {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = mtof(midi);
      f.type = "lowpass";
      f.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.03, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f).connect(g).connect(out);
      o.start(at);
      o.stop(at + dur + 0.05);
    };

    // Chord progressions (root MIDI note + intervals), one bar each.
    const songs: Record<string, { chords: number[][]; lead: number[]; style: "pad" | "arp" | "pulse" }> = {
      aurora: { chords: [[50, 57, 61, 64, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 64], [45, 52, 57, 61, 64]], lead: [76, 74, 73, 71, 69, 71, 73, 76], style: "pad" },
      harbor: { chords: [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]], lead: [72, 76, 79, 76, 74, 72, 71, 74], style: "arp" },
      "night-train": { chords: [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]], lead: [69, 72, 76, 74, 72, 69, 67, 69], style: "pulse" },
    };
    const song = songs[id];
    const beat = 60 / track.bpm;
    const bar = beat * 4;
    let barIndex = 0;
    let nextBar = ctx.currentTime + 0.1;

    const scheduleBar = (t: number, i: number) => {
      const chord = song.chords[i % song.chords.length];
      if (song.style === "pad") {
        chord.forEach((m, k) => note(m, t, bar * 1.05, 0.05 / (1 + k * 0.3), k ? "triangle" : "sine", 1200));
        if (i % 2 === 1) note(song.lead[(i * 2) % song.lead.length], t + beat * 2, beat * 2, 0.035, "sine", 3000);
      } else if (song.style === "arp") {
        note(chord[0] - 12, t, bar, 0.07, "sine", 600);
        for (let s = 0; s < 8; s++) {
          const m = chord[(s * 2 + (s > 3 ? 1 : 0)) % chord.length] + 12;
          note(m, t + s * (beat / 2), beat * 0.9, 0.035, "triangle", 2800);
        }
        if (Math.random() > 0.4) note(song.lead[i % song.lead.length], t + beat, beat * 2.5, 0.03, "sine", 4000);
      } else {
        for (let s = 0; s < 8; s++) note(chord[0] - 12, t + s * (beat / 2), beat * 0.4, 0.07, "sawtooth", 380);
        chord.slice(1).forEach((m, k) => note(m, t, beat * 1.5, 0.025 / (1 + k * 0.2), "triangle", 1800));
        chord.slice(1).forEach((m, k) => note(m, t + beat * 2.5, beat, 0.02 / (1 + k * 0.2), "triangle", 1800));
        for (let s = 0; s < 4; s++) note(song.lead[(i * 4 + s) % song.lead.length], t + s * beat + beat / 2, beat * 0.4, 0.025, "square", 2200);
      }
    };

    const timer = window.setInterval(() => {
      while (nextBar < ctx.currentTime + 0.6) {
        scheduleBar(nextBar, barIndex++);
        nextBar += bar;
      }
    }, 120);

    this.music = {
      stop: () => {
        window.clearInterval(timer);
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t);
        out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        window.setTimeout(() => out.disconnect(), 900);
      },
    };
  }
}

export const sound = new SoundEngine();
