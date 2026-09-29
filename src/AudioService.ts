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
    const playTone = (freq: number, start: number, type: OscillatorType, vol: number, dur: number) => {
        const osc = this.audioCtx!.createOscillator();
        const gain = this.audioCtx!.createGain();
        osc.type = type;
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(this.audioCtx!.destination);

        osc.start(start);
        osc.stop(start + dur);
    };

    // 감지 격자의 계측진도(색) 계급에 따라 효과음 단계를 나눈다.
    // 5.0+(진도 5약 이상, 붉은 격자): 비상 사이렌 패턴
    if (intensity >= 5.0) {
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.5;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.linearRampToValueAtTime(880, t + 0.22);
        osc.frequency.linearRampToValueAtTime(660, t + 0.44);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.07, t + 0.02);
        gain.gain.setValueAtTime(0.07, t + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.48);
      }
    }
    // 4.5~4.9 (진도 4 경계, 주황): 4연타 강한 비프
    else if (intensity >= 4.5) {
      for (let i = 0; i < 4; i++) {
        playTone(988, now + i * 0.12, 'square', 0.06, 0.1);
      }
    }
    // 3.0~4.4 (진도 3~4, 주황): 세 번의 강한 비프
    else if (intensity >= 3.0) {
      playTone(880, now, 'square', 0.05, 0.4);
      playTone(1046, now + 0.15, 'square', 0.05, 0.4);
      playTone(1318, now + 0.3, 'square', 0.05, 0.4);
    }
    // 1.0~2.9 (진도 1~2, 노랑): 두 번의 부드러운 비프
    else if (intensity >= 1.0) {
      playTone(880, now, 'sine', 0.08, 0.2);
      playTone(1046, now + 0.15, 'sine', 0.08, 0.2);
    }
    // 1.0 미만 (연두/파랑 격자): 한 번의 낮은 비프
    else {
      playTone(660, now, 'sine', 0.06, 0.25);
    }
  }
}

export const audioService = new AudioService();
