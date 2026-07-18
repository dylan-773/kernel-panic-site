/**
 * Tiny WebAudio synth for dive feedback. Client-only: everything is lazily
 * created on the first user gesture and guarded, so importing this module is
 * SSR-safe. Volume is deliberately low; the mix is chrome, not music.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  opts: {
    type?: OscillatorType;
    at?: number;
    vol?: number;
    slide?: number;
  } = {},
): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(opts.vol ?? 0.5, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, opts: { at?: number; vol?: number; cutoff?: number } = {}): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.cutoff ?? 900;
  const gain = c.createGain();
  gain.gain.setValueAtTime(opts.vol ?? 0.4, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
}

export type FxKind =
  | "rotate"
  | "deny"
  | "power"
  | "jam"
  | "unjam"
  | "loot"
  | "frag"
  | "corrupt"
  | "ping"
  | "patch"
  | "patchOrder"
  | "andOpen"
  | "adv"
  | "freeze"
  | "block"
  | "scramble"
  | "alarm"
  | "win"
  | "lose"
  | "start";

export function playFx(kind: FxKind): void {
  switch (kind) {
    case "rotate":
      tone(190, 0.05, { type: "square", vol: 0.25, slide: 150 });
      break;
    case "deny":
      tone(95, 0.12, { type: "sawtooth", vol: 0.3, slide: 70 });
      break;
    case "power":
      tone(330, 0.09, { type: "triangle", vol: 0.3, slide: 520 });
      break;
    case "jam":
      noise(0.08, { vol: 0.5, cutoff: 700 });
      tone(120, 0.06, { type: "square", vol: 0.2 });
      break;
    case "unjam":
      noise(0.05, { vol: 0.3, cutoff: 1400 });
      tone(240, 0.1, { type: "triangle", vol: 0.3, slide: 360 });
      break;
    case "loot":
      tone(660, 0.09, { type: "triangle", vol: 0.35 });
      tone(880, 0.14, { type: "triangle", vol: 0.3, at: 0.07 });
      break;
    case "frag":
      tone(540, 0.08, { type: "triangle", vol: 0.35 });
      tone(720, 0.12, { type: "triangle", vol: 0.3, at: 0.06 });
      break;
    case "corrupt":
      tone(220, 0.28, { type: "sawtooth", vol: 0.4, slide: 60 });
      noise(0.3, { vol: 0.45, cutoff: 500 });
      break;
    case "ping":
      tone(920, 0.5, { type: "sine", vol: 0.22, slide: 860 });
      break;
    case "patch":
      tone(440, 0.1, { type: "triangle", vol: 0.35, slide: 560 });
      break;
    case "patchOrder":
      tone(440, 0.09, { type: "triangle", vol: 0.35 });
      tone(560, 0.09, { type: "triangle", vol: 0.35, at: 0.07 });
      tone(700, 0.14, { type: "triangle", vol: 0.35, at: 0.14 });
      break;
    case "andOpen":
      tone(260, 0.1, { type: "triangle", vol: 0.35 });
      tone(390, 0.16, { type: "triangle", vol: 0.3, at: 0.08 });
      break;
    case "adv":
      tone(150, 0.06, { type: "square", vol: 0.16, slide: 130 });
      break;
    case "freeze":
      tone(700, 0.35, { type: "sine", vol: 0.3, slide: 180 });
      break;
    case "block":
      tone(180, 0.16, { type: "square", vol: 0.3, slide: 110 });
      break;
    case "scramble":
      tone(500, 0.07, { type: "sawtooth", vol: 0.25, slide: 260 });
      tone(500, 0.07, { type: "sawtooth", vol: 0.25, slide: 260, at: 0.09 });
      break;
    case "alarm":
      tone(600, 0.12, { type: "square", vol: 0.2, slide: 480 });
      break;
    case "start":
      tone(220, 0.1, { type: "triangle", vol: 0.3 });
      tone(330, 0.14, { type: "triangle", vol: 0.3, at: 0.09 });
      break;
    case "win":
      tone(392, 0.12, { type: "triangle", vol: 0.4 });
      tone(494, 0.12, { type: "triangle", vol: 0.4, at: 0.1 });
      tone(587, 0.12, { type: "triangle", vol: 0.4, at: 0.2 });
      tone(784, 0.3, { type: "triangle", vol: 0.4, at: 0.3 });
      break;
    case "lose":
      tone(311, 0.18, { type: "sawtooth", vol: 0.3 });
      tone(233, 0.2, { type: "sawtooth", vol: 0.3, at: 0.16 });
      tone(155, 0.4, { type: "sawtooth", vol: 0.3, at: 0.34 });
      break;
  }
}
