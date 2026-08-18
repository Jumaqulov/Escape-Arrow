/** Thin wrapper so scenes never worry about mute state or a missing sound. */
import Phaser from 'phaser';
import { progress } from './progress';

export const SOUND_KEYS = ['tap', 'slide', 'win', 'error'] as const;
export type SoundKey = (typeof SOUND_KEYS)[number];

const VOLUMES: Record<SoundKey, number> = { tap: 0.5, slide: 0.55, win: 0.7, error: 0.6 };

export function applyMuteFromSave(scene: Phaser.Scene): void {
  scene.sound.mute = !progress.data.sound;
}

export function setSoundEnabled(scene: Phaser.Scene, enabled: boolean): void {
  progress.setSound(enabled);
  scene.sound.mute = !enabled;
}

/** `rate` pitches the sample - the combo streak rides it upwards. */
export function playSound(scene: Phaser.Scene, key: SoundKey, rate = 1): void {
  if (!progress.data.sound) return;
  if (!scene.cache.audio.exists(key)) return;
  try {
    scene.sound.play(key, { volume: VOLUMES[key], rate });
  } catch {
    // Autoplay policy or a decode failure: never let audio break gameplay.
  }
}
