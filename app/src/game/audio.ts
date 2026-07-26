import { SFXR_SAMPLE_RATE, SfxrParams, preset, renderSfxr } from "./sfxr";

/**
 * Game audio: an sfxr-preset palette rendered to buffers on demand, a small
 * additive synth for stingers, and a music manager for the generated beds.
 * Client-only and lazily created on the first user gesture; importing this
 * module is SSR-safe. Three buses hang off the master: ui (quiet chrome),
 * game (present), music (bed).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let uiBus: GainNode | null = null;
let gameBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
let musicOn = true;

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

/** Create/resume the context inside a user gesture (autoplay unlock). */
export function unlockAudio(): void {
  ensureCtx();
}

/** Diagnostic snapshot for the in-game audio check. */
export function audioDebug(): { state: string; rate: number; masterGain: number; muted: boolean } {
  return {
    state: ctx ? ctx.state : "not created",
    rate: ctx ? ctx.sampleRate : 0,
    masterGain: master ? master.gain.value : -1,
    muted,
  };
}

/**
 * Loud, unmissable two-tone beep wired straight to the destination,
 * bypassing every bus and mute flag. If this is silent, the problem is
 * outside the page (tab mute, per-site sound setting, output device).
 */
export function testBeep(): void {
  const c = ensureCtx();
  if (!c) return;
  const gain = c.createGain();
  gain.gain.value = 0.5;
  gain.connect(c.destination);
  for (const [freq, at] of [[660, 0], [880, 0.25]] as Array<[number, number]>) {
    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(c.currentTime + at);
    osc.stop(c.currentTime + at + 0.2);
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    uiBus = ctx.createGain();
    uiBus.gain.value = 0.7;
    uiBus.connect(master);
    gameBus = ctx.createGain();
    gameBus.gain.value = 1;
    gameBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.3 : 0;
    musicBus.connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/* ------------------------------------------------------------------ */
/* sfxr palette                                                        */
/* ------------------------------------------------------------------ */

const P: Record<string, SfxrParams> = {
  // UI chrome
  tick: preset({ wave: 2, baseFreq: 0.62, sustain: 0.01, decay: 0.045, volume: 0.3 }),
  press: preset({ wave: 0, baseFreq: 0.32, duty: 0.35, sustain: 0.02, decay: 0.1, freqSlide: -0.15, volume: 0.42 }),
  deny: preset({ wave: 1, baseFreq: 0.16, sustain: 0.06, decay: 0.14, freqSlide: -0.05, volume: 0.42 }),
  winOpen: preset({ wave: 0, baseFreq: 0.3, duty: 0.2, freqSlide: 0.24, sustain: 0.05, decay: 0.13, volume: 0.4 }),
  winClose: preset({ wave: 0, baseFreq: 0.42, duty: 0.2, freqSlide: -0.24, sustain: 0.05, decay: 0.13, volume: 0.4 }),
  icon: preset({ wave: 0, baseFreq: 0.5, duty: 0.2, arpMod: 0.45, arpSpeed: 0.6, sustain: 0.03, decay: 0.14, punch: 0.3, volume: 0.36 }),
  story: preset({ wave: 2, baseFreq: 0.5, sustain: 0.02, decay: 0.08, volume: 0.32 }),
  granted: preset({ wave: 0, duty: 0.15, baseFreq: 0.44, freqSlide: 0.18, arpMod: 0.35, arpSpeed: 0.55, sustain: 0.08, decay: 0.25, punch: 0.4, volume: 0.48 }),
  stamp: preset({ wave: 0, baseFreq: 0.14, punch: 0.6, sustain: 0.03, decay: 0.16, freqSlide: -0.08, lpfCutoff: 0.5, volume: 0.55 }),

  // Duel: movement and floods
  rotate: preset({ wave: 0, baseFreq: 0.26, duty: 0.42, sustain: 0.008, decay: 0.055, freqSlide: -0.1, hpfCutoff: 0.1, volume: 0.44 }),
  claimTick: preset({ wave: 0, baseFreq: 0.55, duty: 0.2, punch: 0.35, sustain: 0.02, decay: 0.13, volume: 0.42 }),
  cascadeEnd: preset({ wave: 0, baseFreq: 0.6, duty: 0.15, arpMod: 0.5, arpSpeed: 0.65, punch: 0.5, sustain: 0.06, decay: 0.3, volume: 0.5 }),
  endTurn: preset({ wave: 0, baseFreq: 0.22, duty: 0.3, freqSlide: 0.1, sustain: 0.03, decay: 0.12, volume: 0.4 }),
  aim: preset({ wave: 0, baseFreq: 0.4, duty: 0.45, sustain: 0.008, decay: 0.05, volume: 0.32 }),
  heartbeat: preset({ wave: 2, baseFreq: 0.12, punch: 0.5, sustain: 0.03, decay: 0.16, lpfCutoff: 0.35, volume: 0.6 }),
  strainCrack: preset({ wave: 3, baseFreq: 0.3, sustain: 0.02, decay: 0.14, hpfCutoff: 0.4, freqSlide: -0.1, volume: 0.55 }),
  unlock: preset({ wave: 0, duty: 0.1, baseFreq: 0.5, arpMod: 0.55, arpSpeed: 0.62, punch: 0.5, sustain: 0.1, decay: 0.4, volume: 0.5 }),

  // Duel: traps and abilities
  trapSet: preset({ wave: 0, baseFreq: 0.12, duty: 0.1, sustain: 0.02, decay: 0.12, freqSlide: 0.06, lpfCutoff: 0.4, volume: 0.46 }),
  trapFire: preset({ wave: 3, baseFreq: 0.13, punch: 0.7, sustain: 0.08, decay: 0.42, freqSlide: -0.28, phaserOffset: 0.25, phaserSweep: -0.25, volume: 0.85 }),
  turnLost: preset({ wave: 3, baseFreq: 0.09, punch: 0.6, sustain: 0.1, decay: 0.55, freqSlide: -0.2, lpfCutoff: 0.55, volume: 0.8 }),
  redirect: preset({ wave: 1, baseFreq: 0.62, freqSlide: -0.42, sustain: 0.04, decay: 0.16, phaserOffset: 0.15, phaserSweep: -0.15, volume: 0.5 }),
  shieldCast: preset({ wave: 0, baseFreq: 0.2, duty: 0.05, freqSlide: 0.07, sustain: 0.06, decay: 0.16, hpfCutoff: 0.2, punch: 0.3, volume: 0.5 }),
  scanCast: preset({ wave: 2, baseFreq: 0.68, freqSlide: -0.14, vibDepth: 0.18, vibSpeed: 0.55, sustain: 0.15, decay: 0.4, volume: 0.44 }),
  overloadCast: preset({ wave: 3, baseFreq: 0.5, freqSlide: -0.3, sustain: 0.08, decay: 0.25, hpfCutoff: 0.35, phaserOffset: 0.4, phaserSweep: -0.3, volume: 0.55 }),
  overclockCast: preset({ wave: 0, duty: 0.25, baseFreq: 0.3, freqSlide: 0.32, sustain: 0.15, decay: 0.25, vibDepth: 0.1, vibSpeed: 0.6, volume: 0.5 }),
  firewallCast: preset({ wave: 3, baseFreq: 0.1, punch: 0.8, sustain: 0.06, decay: 0.35, lpfCutoff: 0.35, freqSlide: -0.12, volume: 0.8 }),
  backdoorCast: preset({ wave: 0, baseFreq: 0.5, duty: 0.15, arpMod: -0.35, arpSpeed: 0.5, sustain: 0.05, decay: 0.22, volume: 0.46 }),
  virusSting: preset({ wave: 1, baseFreq: 0.3, freqSlide: -0.18, vibDepth: 0.4, vibSpeed: 0.75, sustain: 0.18, decay: 0.35, hpfCutoff: 0.1, volume: 0.55 }),

  // Par and patch cells
  patchPlace: preset({ wave: 0, baseFreq: 0.34, duty: 0.2, freqSlide: 0.22, arpMod: 0.4, arpSpeed: 0.5, sustain: 0.06, decay: 0.22, punch: 0.45, lpfCutoff: 0.6, volume: 0.5 }),
  overParTick: preset({ wave: 3, baseFreq: 0.55, sustain: 0.008, decay: 0.05, punch: 0.25, hpfCutoff: 0.3, volume: 0.34 }),
  dayCloseRegen: preset({ wave: 2, baseFreq: 0.3, freqSlide: 0.28, vibDepth: 0.12, vibSpeed: 0.4, sustain: 0.18, decay: 0.5, punch: 0.3, lpfCutoff: 0.55, volume: 0.5 }),
};

export type SfxName = keyof typeof P;

const bufferCache = new Map<string, AudioBuffer>();

function bufferFor(name: SfxName): AudioBuffer | null {
  const c = ensureCtx();
  if (!c) return null;
  let buf = bufferCache.get(name) ?? null;
  if (!buf) {
    const data = renderSfxr(P[name]);
    buf = c.createBuffer(1, data.length, SFXR_SAMPLE_RATE);
    buf.getChannelData(0).set(data);
    bufferCache.set(name, buf);
  }
  return buf;
}

export interface SfxOpts {
  /** Playback rate multiplier (pitch). */
  rate?: number;
  /** Random rate jitter, e.g. 0.04 = plus/minus 4%. */
  jitter?: number;
  vol?: number;
  bus?: "ui" | "game";
  /** Delay in seconds. */
  at?: number;
}

export function sfx(name: SfxName, opts: SfxOpts = {}): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const buf = bufferFor(name);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const jitter = opts.jitter ?? 0;
  src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);
  const gain = c.createGain();
  gain.gain.value = opts.vol ?? 1;
  src.connect(gain);
  gain.connect((opts.bus === "ui" ? uiBus : gameBus) as GainNode);
  src.start(c.currentTime + (opts.at ?? 0));
}

/* ------------------------------------------------------------------ */
/* Additive synth (stingers, drones)                                   */
/* ------------------------------------------------------------------ */

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; at?: number; vol?: number; slide?: number } = {},
): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !gameBus) return;
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
  gain.connect(gameBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** The machine's low presence while it takes its turn. */
let drone: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

export function startDrone(): void {
  if (muted || drone) return;
  const c = ensureCtx();
  if (!c || !gameBus) return;
  const osc = c.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 46;
  const lfo = c.createOscillator();
  lfo.frequency.value = 1.7;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 3.5;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.detune);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.16, c.currentTime, 0.25);
  osc.connect(gain);
  gain.connect(gameBus);
  osc.start();
  lfo.start();
  drone = { osc, lfo, gain };
}

export function stopDrone(): void {
  if (!drone || !ctx) return;
  const d = drone;
  drone = null;
  d.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  const stopAt = ctx.currentTime + 0.6;
  d.osc.stop(stopAt);
  d.lfo.stop(stopAt);
}

/* ------------------------------------------------------------------ */
/* Composite voices                                                    */
/* ------------------------------------------------------------------ */

/** Rising claim run: one tick per node, whole-tone steps, capped. */
export function playCascade(n: number): void {
  const steps = Math.min(n, 9);
  for (let i = 0; i < steps; i++) {
    sfx("claimTick", { rate: Math.pow(2, (i * 2) / 12), at: i * 0.048, vol: 0.9 });
  }
  if (n >= 4) sfx("cascadeEnd", { at: steps * 0.048 });
}

export function playBoom(): void {
  sfx("trapFire");
}

export function playStinger(won: boolean): void {
  if (won) {
    tone(392, 0.12, { vol: 0.5 });
    tone(523, 0.12, { at: 0.1, vol: 0.5 });
    tone(659, 0.14, { at: 0.2, vol: 0.55 });
    tone(784, 0.34, { at: 0.32, type: "triangle", vol: 0.6 });
    tone(1046, 0.4, { at: 0.42, type: "triangle", vol: 0.4 });
    sfx("unlock", { at: 0.45, vol: 0.7 });
  } else {
    tone(220, 0.18, { vol: 0.55 });
    tone(174, 0.2, { at: 0.16, vol: 0.55 });
    tone(116, 0.5, { at: 0.34, type: "sawtooth", vol: 0.6, slide: 60 });
    sfx("turnLost", { at: 0.3, vol: 0.8 });
  }
}

export function playUiTick(): void {
  sfx("tick", { bus: "ui", jitter: 0.03 });
}

export function playUiPress(): void {
  sfx("press", { bus: "ui", jitter: 0.02 });
}

/* ------------------------------------------------------------------ */
/* Legacy FxKind mapping (older call sites)                            */
/* ------------------------------------------------------------------ */

export type FxKind =
  | "rotate" | "deny" | "power" | "jam" | "unjam" | "loot" | "frag" | "corrupt"
  | "ping" | "patch" | "patchOrder" | "andOpen" | "adv" | "freeze" | "block"
  | "scramble" | "alarm" | "win" | "lose" | "start";

const FX_TO_SFX: Record<FxKind, SfxName | null> = {
  rotate: "rotate",
  deny: "deny",
  power: "claimTick",
  jam: "press",
  unjam: "shieldCast",
  loot: "backdoorCast",
  frag: "claimTick",
  corrupt: "trapFire",
  ping: "scanCast",
  patch: "claimTick",
  patchOrder: "cascadeEnd",
  andOpen: "firewallCast",
  adv: "aim",
  freeze: "overloadCast",
  block: "trapSet",
  scramble: "redirect",
  alarm: "virusSting",
  win: null,
  lose: null,
  start: "winOpen",
};

export function playFx(kind: FxKind): void {
  if (kind === "win") return playStinger(true);
  if (kind === "lose") return playStinger(false);
  const name = FX_TO_SFX[kind];
  if (name) sfx(name, { jitter: 0.03 });
}

/* ------------------------------------------------------------------ */
/* Music                                                               */
/* ------------------------------------------------------------------ */

export type MusicTrack = "desk" | "dive" | "finale";

const musicBuffers = new Map<MusicTrack, AudioBuffer>();
let currentMusic: { track: MusicTrack; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wantedTrack: MusicTrack | null = null;
let loadingTrack: MusicTrack | null = null;

export function setMusicOn(on: boolean): void {
  musicOn = on;
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, 0.3);
  if (on && wantedTrack) void playMusic(wantedTrack);
}

export function isMusicOn(): boolean {
  return musicOn;
}

async function loadMusic(track: MusicTrack): Promise<AudioBuffer | null> {
  const c = ensureCtx();
  if (!c) return null;
  const cached = musicBuffers.get(track);
  if (cached) return cached;
  try {
    const res = await fetch(`/assets/sfx/music/${track}.mp3`);
    if (!res.ok) return null;
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    musicBuffers.set(track, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Crossfade to a bed (or silence). Safe to call repeatedly. */
export async function playMusic(track: MusicTrack | null): Promise<void> {
  wantedTrack = track;
  const c = ensureCtx();
  if (!c || !musicBus) return;
  if (currentMusic && currentMusic.track === track) return;

  if (currentMusic) {
    const old = currentMusic;
    currentMusic = null;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.4);
    old.src.stop(c.currentTime + 1.6);
  }
  if (track === null || !musicOn) return;

  if (loadingTrack === track) return;
  loadingTrack = track;
  const buf = await loadMusic(track);
  loadingTrack = null;
  // The wanted track may have changed (or another call landed) while decoding.
  const cm = currentMusic as { track: MusicTrack } | null;
  if (!buf || wantedTrack !== track || (cm && cm.track === track)) return;

  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(1, c.currentTime, 0.5);
  src.connect(gain);
  gain.connect(musicBus);
  src.start();
  currentMusic = { track, src, gain };
}
