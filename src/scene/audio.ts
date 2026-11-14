/**
 * Lab4All — Realistic Web Audio Sound Synthesizer for 3D Classroom Physics Lab
 *
 * Procedurally generates realistic mechanical spring launch clicks, barrel exit pops,
 * aerodynamic rush, and solid tabletop marble impact bounces using the native Web Audio API.
 * Requires zero external audio files and runs with zero network latency.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    // Check if user previously saved mute preference
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem('lab4all_sound_muted');
        if (saved !== null) {
          this.muted = saved === 'true';
        }
      } catch {
        // ignore localStorage access issues
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('lab4all_sound_muted', String(muted));
      } catch {}
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Realistic Spring Launcher Sound:
   * 1. Metallic release latch trigger click (high transient).
   * 2. Heavy spring decompression vibration (resonant body).
   * 3. Muzzle exit air pop & whoosh as projectile leaves the barrel.
   */
  public playLaunch(speed: number = 4.0): void {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const speedNorm = Math.max(0.4, Math.min(1.5, speed / 5.0));

    // 1. Mechanical Trigger Latch Release (Click)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(2800 * speedNorm, now);
    clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.02);

    clickGain.gain.setValueAtTime(0.4 * speedNorm, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);

    clickOsc.start(now);
    clickOsc.stop(now + 0.03);

    // 2. Coil Spring Acoustic Snap & Resonant Body
    const springOsc = ctx.createOscillator();
    const springGain = ctx.createGain();
    springOsc.type = 'sine';
    springOsc.frequency.setValueAtTime(460 * speedNorm, now);
    springOsc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

    springGain.gain.setValueAtTime(0.55 * speedNorm, now);
    springGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    springOsc.connect(springGain);
    springGain.connect(ctx.destination);

    springOsc.start(now);
    springOsc.stop(now + 0.1);

    // 3. Air Rush & Muzzle Exit Pop
    const bufferSize = ctx.sampleRate * 0.05; // 50ms noise
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400 * speedNorm, now);
    filter.Q.setValueAtTime(2.5, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3 * speedNorm, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.055);
  }

  /**
   * Realistic Tabletop Marble Landing Sound:
   * 1. Hard marble-on-table surface strike ("clack").
   * 2. Wooden lab bench resonance vibration ("thump").
   * 3. Micro secondary bounce tap (45ms later).
   */
  public playLanding(impactSpeed: number = 4.0): void {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const impactIntensity = Math.max(0.35, Math.min(1.2, impactSpeed / 5.5));

    // Primary Impact Click ("Clack")
    const clackOsc = ctx.createOscillator();
    const clackGain = ctx.createGain();
    clackOsc.type = 'triangle';
    clackOsc.frequency.setValueAtTime(2100, now);
    clackOsc.frequency.exponentialRampToValueAtTime(450, now + 0.035);

    clackGain.gain.setValueAtTime(0.6 * impactIntensity, now);
    clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    clackOsc.connect(clackGain);
    clackGain.connect(ctx.destination);

    clackOsc.start(now);
    clackOsc.stop(now + 0.045);

    // Bench Surface Low Resonance Body ("Tok")
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(220, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(80, now + 0.09);

    bodyGain.gain.setValueAtTime(0.5 * impactIntensity, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);

    bodyOsc.start(now);
    bodyOsc.stop(now + 0.11);

    // Subtle Micro Secondary Bounce Tap (45ms after main hit)
    const bounceTime = now + 0.045;
    const bounceOsc = ctx.createOscillator();
    const bounceGain = ctx.createGain();
    bounceOsc.type = 'sine';
    bounceOsc.frequency.setValueAtTime(1600, bounceTime);
    bounceOsc.frequency.exponentialRampToValueAtTime(600, bounceTime + 0.02);

    bounceGain.gain.setValueAtTime(0.18 * impactIntensity, bounceTime);
    bounceGain.gain.exponentialRampToValueAtTime(0.001, bounceTime + 0.025);

    bounceOsc.connect(bounceGain);
    bounceGain.connect(ctx.destination);

    bounceOsc.start(bounceTime);
    bounceOsc.stop(bounceTime + 0.03);
  }

  /**
   * Crisp UI Button / Switch Tactile Feedback Sound
   */
  public playClick(): void {
    if (this.muted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.015);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.02);
  }
}

export const soundManager = new SoundEngine();
