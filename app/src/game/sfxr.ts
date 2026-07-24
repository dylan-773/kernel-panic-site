/**
 * Compact sfxr-style synthesizer, ported from DrPetter's classic algorithm.
 * Every game sound is a ~20-number preset rendered once into an AudioBuffer:
 * pixel-authentic by construction, zero assets, tunable in code.
 *
 * Parameter conventions follow sfxr: most values 0..1, slides/ramps -1..1.
 */

export interface SfxrParams {
  /** 0 square, 1 saw, 2 sine, 3 noise */
  wave: 0 | 1 | 2 | 3;
  baseFreq: number;
  freqLimit: number;
  freqSlide: number;
  freqDeltaSlide: number;
  duty: number;
  dutySweep: number;
  vibDepth: number;
  vibSpeed: number;
  attack: number;
  sustain: number;
  punch: number;
  decay: number;
  arpMod: number;
  arpSpeed: number;
  repeatSpeed: number;
  phaserOffset: number;
  phaserSweep: number;
  lpfCutoff: number;
  lpfSweep: number;
  lpfResonance: number;
  hpfCutoff: number;
  hpfSweep: number;
  volume: number;
}

export function preset(p: Partial<SfxrParams>): SfxrParams {
  return {
    wave: 0,
    baseFreq: 0.3,
    freqLimit: 0,
    freqSlide: 0,
    freqDeltaSlide: 0,
    duty: 0,
    dutySweep: 0,
    vibDepth: 0,
    vibSpeed: 0,
    attack: 0,
    sustain: 0.1,
    punch: 0,
    decay: 0.15,
    arpMod: 0,
    arpSpeed: 0,
    repeatSpeed: 0,
    phaserOffset: 0,
    phaserSweep: 0,
    lpfCutoff: 1,
    lpfSweep: 0,
    lpfResonance: 0,
    hpfCutoff: 0,
    hpfSweep: 0,
    volume: 0.5,
    ...p,
  };
}

const SAMPLE_RATE = 44100;

/** Render a preset to raw float samples. Deterministic apart from noise. */
export function renderSfxr(ps: SfxrParams): Float32Array {
  // Working state, reset on retrigger.
  let fperiod = 0;
  let fmaxperiod = 0;
  let fslide = 0;
  let fdslide = 0;
  let squareDuty = 0;
  let squareSlide = 0;
  let arpMod = 0;
  let arpTime = 0;
  let arpLimit = 0;

  const reset = () => {
    fperiod = 100 / (ps.baseFreq * ps.baseFreq + 0.001);
    fmaxperiod = 100 / (ps.freqLimit * ps.freqLimit + 0.001);
    fslide = 1 - Math.pow(ps.freqSlide, 3) * 0.01;
    fdslide = -Math.pow(ps.freqDeltaSlide, 3) * 0.000001;
    squareDuty = 0.5 - ps.duty * 0.5;
    squareSlide = -ps.dutySweep * 0.00005;
    arpMod = ps.arpMod >= 0 ? 1 - Math.pow(ps.arpMod, 2) * 0.9 : 1 + Math.pow(ps.arpMod, 2) * 10;
    arpTime = 0;
    arpLimit = Math.floor(Math.pow(1 - ps.arpSpeed, 2) * 20000 + 32);
    if (ps.arpSpeed === 1) arpLimit = 0;
  };
  reset();

  let period = Math.max(8, fperiod);
  let phase = 0;
  const noiseBuffer = new Float32Array(32);
  const reseedNoise = () => {
    for (let i = 0; i < 32; i++) noiseBuffer[i] = Math.random() * 2 - 1;
  };
  reseedNoise();

  // Envelope lengths in samples. Unlike original sfxr (which squares a
  // 0..1 knob), attack/sustain/decay here are plain SECONDS - the preset
  // palette is authored that way.
  const envLength = [
    Math.floor(ps.attack * SAMPLE_RATE),
    Math.floor(ps.sustain * SAMPLE_RATE),
    Math.floor(ps.decay * SAMPLE_RATE),
  ];
  const totalLength = Math.max(envLength[0] + envLength[1] + envLength[2], SAMPLE_RATE * 0.02);

  // Filters.
  let fltp = 0;
  let fltdp = 0;
  let fltw = Math.pow(ps.lpfCutoff, 3) * 0.1;
  const fltwD = 1 + ps.lpfSweep * 0.0001;
  let fltdmp = 5 / (1 + Math.pow(ps.lpfResonance, 2) * 20) * (0.01 + fltw);
  if (fltdmp > 0.8) fltdmp = 0.8;
  let fltphp = 0;
  let flthp = Math.pow(ps.hpfCutoff, 2) * 0.1;
  const flthpD = 1 + ps.hpfSweep * 0.0003;

  // Vibrato.
  let vibPhase = 0;
  const vibSpeed = Math.pow(ps.vibSpeed, 2) * 0.01;
  const vibAmp = ps.vibDepth * 0.5;

  // Phaser.
  let fphase = Math.pow(ps.phaserOffset, 2) * 1020;
  if (ps.phaserOffset < 0) fphase = -fphase;
  let fdphase = Math.pow(ps.phaserSweep, 2);
  if (ps.phaserSweep < 0) fdphase = -fdphase;
  let iphase = Math.abs(Math.floor(fphase));
  let ipp = 0;
  const phaserBuffer = new Float32Array(1024);

  // Retrigger.
  let repTime = 0;
  const repLimit = Math.floor(Math.pow(1 - ps.repeatSpeed, 2) * 20000 + 32);
  const useRep = ps.repeatSpeed > 0;

  let envStage = 0;
  let envTime = 0;
  let envVol = 0;

  const out = new Float32Array(totalLength);
  let written = 0;

  for (let t = 0; t < totalLength; t++) {
    // Retrigger.
    if (useRep && ++repTime >= repLimit) {
      repTime = 0;
      reset();
    }

    // Arpeggio.
    if (arpLimit !== 0 && ++arpTime >= arpLimit) {
      arpLimit = 0;
      fperiod *= arpMod;
    }

    // Frequency slide.
    fslide += fdslide;
    fperiod *= fslide;
    if (fperiod > fmaxperiod) {
      fperiod = fmaxperiod;
      if (ps.freqLimit > 0) break;
    }

    // Vibrato.
    let rfperiod = fperiod;
    if (vibAmp > 0) {
      vibPhase += vibSpeed;
      rfperiod = fperiod * (1 + Math.sin(vibPhase) * vibAmp);
    }
    period = Math.max(8, Math.floor(rfperiod));

    squareDuty = Math.min(0.5, Math.max(0, squareDuty + squareSlide));

    // Envelope.
    if (++envTime > envLength[envStage]) {
      envTime = 0;
      envStage++;
      if (envStage === 3) break;
    }
    if (envStage === 0) {
      envVol = envLength[0] === 0 ? 1 : envTime / envLength[0];
    } else if (envStage === 1) {
      envVol = 1 + Math.pow(1 - (envLength[1] === 0 ? 1 : envTime / envLength[1]), 1) * 2 * ps.punch;
    } else {
      envVol = 1 - (envLength[2] === 0 ? 1 : envTime / envLength[2]);
    }

    // Phaser sweep.
    fphase += fdphase;
    iphase = Math.min(1023, Math.abs(Math.floor(fphase)));

    // High-pass sweep.
    if (flthpD !== 1) {
      flthp = Math.min(0.1, Math.max(0.00001, flthp * flthpD));
    }

    // 8x supersample.
    let ssample = 0;
    for (let si = 0; si < 8; si++) {
      let sample = 0;
      phase++;
      if (phase >= period) {
        phase %= period;
        if (ps.wave === 3) reseedNoise();
      }
      const fp = phase / period;
      if (ps.wave === 0) {
        sample = fp < squareDuty ? 0.5 : -0.5;
      } else if (ps.wave === 1) {
        sample = 1 - fp * 2;
      } else if (ps.wave === 2) {
        sample = Math.sin(fp * 2 * Math.PI);
      } else {
        sample = noiseBuffer[Math.floor(fp * 32) & 31];
      }

      // Low-pass with resonance.
      const pp = fltp;
      fltw = Math.min(0.1, Math.max(0, fltw * fltwD));
      if (ps.lpfCutoff !== 1) {
        fltdp += (sample - fltp) * fltw;
        fltdp -= fltdp * fltdmp;
      } else {
        fltp = sample;
        fltdp = 0;
      }
      if (ps.lpfCutoff !== 1) fltp += fltdp;

      // High-pass.
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      sample = fltphp;

      // Phaser.
      phaserBuffer[ipp & 1023] = sample;
      sample += phaserBuffer[(ipp - iphase + 1024) & 1023];
      ipp = (ipp + 1) & 1023;

      ssample += sample * envVol;
    }
    ssample = (ssample / 8) * 0.5 * ps.volume * 2;
    out[t] = Math.max(-1, Math.min(1, ssample));
    written = t + 1;
  }

  return out.slice(0, written);
}

export const SFXR_SAMPLE_RATE = SAMPLE_RATE;
