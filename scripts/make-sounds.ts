/**
 * Synthesises the four game sounds into public/sounds/ as 16-bit mono WAV.
 *
 *   npx tsx scripts/make-sounds.ts
 *
 * jsfxr-style: oscillator + envelope + a little noise, written by hand so the
 * project has zero binary assets in source control and zero audio dependencies.
 * All four together weigh well under 100 KB.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../public/sounds');
const RATE = 22050;

/** Deterministic noise so re-running the script produces identical files. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function writeWav(name: string, samples: Float32Array): void {
  const bytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + bytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format = PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(bytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  writeFileSync(resolve(OUT_DIR, name), buffer);
  console.log(`  ${name.padEnd(10)} ${(buffer.length / 1024).toFixed(1)} KB`);
}

const sineWave = (phase: number): number => Math.sin(phase * Math.PI * 2);
const squareWave = (phase: number): number => (phase % 1 < 0.5 ? 1 : -1);
const sawWave = (phase: number): number => 2 * (phase % 1) - 1;
const triangleWave = (phase: number): number => 1 - 4 * Math.abs(Math.round(phase % 1) - (phase % 1));

interface ToneOptions {
  duration: number;
  from: number;
  to?: number;
  wave?: (phase: number) => number;
  volume?: number;
  attack?: number;
  decay?: number;
  /** 0..1 blend of white noise mixed on top of the oscillator. */
  noise?: number;
  vibrato?: { rate: number; depth: number };
  seed?: number;
}

function tone(opts: ToneOptions): Float32Array {
  const {
    duration,
    from,
    to = from,
    wave = sineWave,
    volume = 0.6,
    attack = 0.005,
    decay = 0.9,
    noise = 0,
    vibrato,
    seed = 1,
  } = opts;

  const length = Math.floor(duration * RATE);
  const out = new Float32Array(length);
  const rnd = makeRandom(seed);
  let phase = 0;

  for (let i = 0; i < length; i++) {
    const t = i / length;
    let freq = from + (to - from) * t;
    if (vibrato) freq += Math.sin((i / RATE) * vibrato.rate * Math.PI * 2) * vibrato.depth;
    phase += freq / RATE;

    const attackEnv = attack > 0 ? Math.min(1, i / RATE / attack) : 1;
    const decayEnv = Math.pow(1 - t, decay * 4 + 0.2);
    const env = attackEnv * decayEnv;

    const osc = wave(phase);
    const n = noise > 0 ? rnd() * 2 - 1 : 0;
    out[i] = (osc * (1 - noise) + n * noise) * env * volume;
  }
  return out;
}

function mix(...parts: Array<{ at: number; data: Float32Array }>): Float32Array {
  let length = 0;
  for (const p of parts) length = Math.max(length, Math.floor(p.at * RATE) + p.data.length);
  const out = new Float32Array(length);
  for (const p of parts) {
    const offset = Math.floor(p.at * RATE);
    for (let i = 0; i < p.data.length; i++) out[offset + i] = (out[offset + i] ?? 0) + p.data[i]!;
  }
  // Soft clip so stacked partials never crackle.
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]! * 1.2);
  return out;
}

/** One-pole low pass - turns raw white noise into an actual whoosh. */
function lowPass(input: Float32Array, cutoffStart: number, cutoffEnd: number): Float32Array {
  const out = new Float32Array(input.length);
  let previous = 0;
  for (let i = 0; i < input.length; i++) {
    const t = i / input.length;
    const cutoff = cutoffStart + (cutoffEnd - cutoffStart) * t;
    const alpha = Math.min(1, (2 * Math.PI * cutoff) / RATE);
    previous += alpha * (input[i]! - previous);
    out[i] = previous;
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
console.log('Writing sounds to public/sounds/');

// tap - tight upward blip, the "I registered your finger" click.
writeWav(
  'tap.wav',
  mix(
    { at: 0, data: tone({ duration: 0.06, from: 620, to: 900, wave: squareWave, volume: 0.28, decay: 1.6 }) },
    { at: 0, data: tone({ duration: 0.05, from: 1240, to: 1800, wave: sineWave, volume: 0.14, decay: 2.2 }) },
  ),
);

// slide - filtered noise sweep with a falling body: the arrow leaving the board.
writeWav(
  'slide.wav',
  mix(
    {
      at: 0,
      data: lowPass(
        tone({ duration: 0.26, from: 200, to: 200, noise: 1, volume: 0.5, decay: 1.1, seed: 7 }),
        1600,
        5200,
      ),
    },
    { at: 0, data: tone({ duration: 0.22, from: 700, to: 240, wave: triangleWave, volume: 0.2, decay: 1.4 }) },
  ),
);

// win - major arpeggio C5 E5 G5 C6 with a soft shimmer on top.
writeWav(
  'win.wav',
  mix(
    { at: 0.0, data: tone({ duration: 0.5, from: 523.25, wave: triangleWave, volume: 0.34, decay: 0.9 }) },
    { at: 0.09, data: tone({ duration: 0.5, from: 659.25, wave: triangleWave, volume: 0.32, decay: 0.9 }) },
    { at: 0.18, data: tone({ duration: 0.5, from: 783.99, wave: triangleWave, volume: 0.3, decay: 0.9 }) },
    { at: 0.27, data: tone({ duration: 0.62, from: 1046.5, wave: sineWave, volume: 0.36, decay: 0.7 }) },
    {
      at: 0.27,
      data: tone({ duration: 0.62, from: 1568, wave: sineWave, volume: 0.12, decay: 0.9, vibrato: { rate: 6, depth: 8 } }),
    },
  ),
);

// error - short detuned buzz, low enough to read as "no" without being harsh.
writeWav(
  'error.wav',
  mix(
    { at: 0, data: tone({ duration: 0.16, from: 165, to: 120, wave: sawWave, volume: 0.3, decay: 1.1 }) },
    { at: 0, data: tone({ duration: 0.16, from: 168, to: 122, wave: squareWave, volume: 0.16, decay: 1.1 }) },
  ),
);

console.log('Done.');
