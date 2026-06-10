import messageSoundUrl from '@/assets/sounds/message.wav';
import ringtoneUrl from '@/assets/sounds/ringtone.wav';

let ringtone: HTMLAudioElement | null = null;

/** Short ding on incoming messages */
export function playMessageSound() {
  try {
    const audio = new Audio(messageSoundUrl);
    audio.volume = 0.6;
    void audio.play().catch(() => {});
  } catch {
    // audio unavailable — stay silent
  }
}

/** Looping ring for an incoming call; idempotent */
export function startRinging() {
  if (ringtone) return;
  try {
    ringtone = new Audio(ringtoneUrl);
    ringtone.loop = true;
    void ringtone.play().catch(() => {});
  } catch {
    ringtone = null;
  }
}

export function stopRinging() {
  ringtone?.pause();
  ringtone = null;
}
