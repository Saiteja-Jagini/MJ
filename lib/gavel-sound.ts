let context: AudioContext | null = null;

export function primeGavelSound() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
  } catch {
    // Sound is optional when the browser disallows audio.
  }
}

export function playGavelSound() {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(155, now);
  oscillator.frequency.exponentialRampToValueAtTime(65, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.23);
}
