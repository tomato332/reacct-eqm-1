class AudioService {
  private audioCtx: AudioContext | null = null;
  public isMuted: boolean = true;
  private lastUpdateBeep = 0;
  private lastEEWChime = 0;

  public init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (!muted) {
      this.init();
    }
  }

  public playEEWChime() {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    // Throttle EEW chime to once every 10 seconds to avoid spam
    const nowMs = Date.now();
    if (nowMs - this.lastEEWChime < 10000) return;
    this.lastEEWChime = nowMs;

    const now = this.audioCtx.currentTime;
    
    const C6 = 1046.50;
    const E6 = 1318.51;
    const G6 = 1567.98;

    const Db6 = 1108.73;
    const F6 = 1396.91;
    const Ab6 = 1661.22;

    const play = (freqs: number[], start: number) => {
      freqs.forEach(f => {
        const osc = this.audioCtx!.createOscillator();
        const gain = this.audioCtx!.createGain();
        
        // Use a mix of square and triangle for a slightly harsher, electronic chime sound
        osc.type = 'triangle';
        osc.frequency.value = f;
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
        gain.gain.linearRampToValueAtTime(0.03, start + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
        
        osc.connect(gain);
        gain.connect(this.audioCtx!.destination);
        
        osc.start(start);
        osc.stop(start + 0.6);
      });
    };

    // NHK-style 5-chord alert
    play([C6, E6, G6], now);
    play([Db6, F6, Ab6], now + 0.35);
    play([C6, E6, G6], now + 0.7);
    play([Db6, F6, Ab6], now + 1.05);
    play([C6, E6, G6], now + 1.4);
  }

  public playUpdateBeep(intensity: number) {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    const nowMs = Date.now();
    if (nowMs - this.lastUpdateBeep < 3000) return;
    this.lastUpdateBeep = nowMs;

    const now = this.audioCtx.currentTime;
    const playTone = (freq: number, start: number, isStrong: boolean) => {
        const osc = this.audioCtx!.createOscillator();
        const gain = this.audioCtx!.createGain();
        osc.type = isStrong ? 'square' : 'sine';
        osc.frequency.value = freq;
        
        const vol = isStrong ? 0.05 : 0.08;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + (isStrong ? 0.4 : 0.2));
        
        osc.connect(gain);
        gain.connect(this.audioCtx!.destination);
        
        osc.start(start);
        osc.stop(start + (isStrong ? 0.4 : 0.2));
    };

    // If max intensity > 3.0 (approx 진도 3 이상), play a louder/harsher beep
    if (intensity >= 3.0) {
      playTone(880, now, true);
      playTone(1046, now + 0.15, true);
      playTone(1318, now + 0.3, true);
    } else {
      // Soft beep for small quakes or updates
      playTone(880, now, false);
      playTone(1046, now + 0.15, false);
    }
  }
}

export const audioService = new AudioService();
