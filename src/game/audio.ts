/* Tiny WebAudio synth for game SFX — no assets, all procedural. */

type OscType = OscillatorType;

interface ToneOpts {
  type?: OscType;
  f0: number;
  f1?: number;
  dur: number;
  vol?: number;
  delay?: number;
  curve?: number; // exponential ramp sharpness
}

class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  ensure() {
    try {
      if (!this.ac) {
        const AC: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ac.destination);
        const len = Math.floor(this.ac.sampleRate * 0.6);
        this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ac.state === "suspended") this.ac.resume();
    } catch {
      /* audio unavailable — game plays silent */
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private tone(o: ToneOpts) {
    if (!this.ac || !this.master || this.muted) return;
    const t0 = this.ac.currentTime + (o.delay ?? 0);
    const osc = this.ac.createOscillator();
    const g = this.ac.createGain();
    osc.type = o.type ?? "square";
    osc.frequency.setValueAtTime(Math.max(20, o.f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 ?? o.f0), t0 + o.dur);
    const v = o.vol ?? 0.08;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0, sweepTo?: number) {
    if (!this.ac || !this.master || !this.noiseBuf || this.muted) return;
    const t0 = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  shoot() { this.tone({ type: "square", f0: 690, f1: 480, dur: 0.055, vol: 0.035 }); }
  spear() { this.tone({ type: "square", f0: 330, f1: 170, dur: 0.09, vol: 0.045 }); this.noise(0.06, 0.03, 1600, 1.2); }
  slash() { this.noise(0.11, 0.08, 500, 1.4, 0, 2600); this.tone({ type: "triangle", f0: 820, f1: 240, dur: 0.07, vol: 0.03 }); }
  hit() { this.tone({ type: "triangle", f0: 340, f1: 200, dur: 0.05, vol: 0.05 }); this.noise(0.04, 0.04, 2400, 0.8); }
  crit() { this.tone({ type: "square", f0: 920, f1: 300, dur: 0.09, vol: 0.06 }); }
  die() { this.tone({ type: "sawtooth", f0: 220, f1: 52, dur: 0.17, vol: 0.06 }); this.noise(0.12, 0.07, 900, 0.7, 0, 220); }
  genDie() { this.tone({ type: "sawtooth", f0: 140, f1: 34, dur: 0.42, vol: 0.1 }); this.noise(0.4, 0.14, 500, 0.6, 0, 120); }
  hurt() { this.tone({ type: "square", f0: 150, f1: 62, dur: 0.2, vol: 0.1 }); this.noise(0.12, 0.08, 300, 0.8); }
  dash() { this.noise(0.17, 0.09, 380, 1.1, 0, 1600); this.tone({ type: "sine", f0: 300, f1: 900, dur: 0.14, vol: 0.04 }); }
  gold() { this.tone({ type: "triangle", f0: 920, f1: 1380, dur: 0.08, vol: 0.05 }); }
  food() { this.tone({ type: "sine", f0: 500, f1: 760, dur: 0.1, vol: 0.06 }); }
  heart() { this.tone({ type: "sine", f0: 620, f1: 990, dur: 0.16, vol: 0.07 }); this.tone({ type: "sine", f0: 930, f1: 1240, dur: 0.14, vol: 0.05, delay: 0.08 }); }
  key() { this.tone({ type: "square", f0: 1180, f1: 1560, dur: 0.09, vol: 0.05 }); this.tone({ type: "square", f0: 1560, f1: 1180, dur: 0.08, vol: 0.04, delay: 0.09 }); }
  potion() { this.tone({ type: "sawtooth", f0: 90, f1: 36, dur: 0.5, vol: 0.14 }); this.noise(0.5, 0.16, 2000, 0.5, 0, 90); this.tone({ type: "square", f0: 60, f1: 900, dur: 0.3, vol: 0.05, delay: 0.05 }); }
  boon() { [392, 494, 587, 784].forEach((f, i) => this.tone({ type: "triangle", f0: f, dur: 0.22, vol: 0.06, delay: i * 0.07 })); }
  chest() { this.tone({ type: "triangle", f0: 520, f1: 700, dur: 0.1, vol: 0.06 }); this.tone({ type: "triangle", f0: 780, f1: 1040, dur: 0.14, vol: 0.06, delay: 0.1 }); }
  locked() { this.tone({ type: "square", f0: 180, f1: 120, dur: 0.09, vol: 0.06 }); }
  clear() { [330, 415, 494, 660].forEach((f, i) => this.tone({ type: "triangle", f0: f, dur: 0.18, vol: 0.06, delay: i * 0.08 })); }
  bossRoar() { this.tone({ type: "sawtooth", f0: 70, f1: 38, dur: 0.7, vol: 0.13 }); this.noise(0.6, 0.1, 240, 0.7, 0.05, 90); }
  death() { [220, 174, 130, 87].forEach((f, i) => this.tone({ type: "sawtooth", f0: f, f1: f * 0.8, dur: 0.34, vol: 0.09, delay: i * 0.16 })); }
  victory() { [392, 494, 587, 784, 988].forEach((f, i) => this.tone({ type: "triangle", f0: f, dur: 0.3, vol: 0.07, delay: i * 0.11 })); }
  uiMove() { this.tone({ type: "square", f0: 500, f1: 620, dur: 0.045, vol: 0.03 }); }
  uiSelect() { this.tone({ type: "square", f0: 660, f1: 990, dur: 0.08, vol: 0.05 }); }
}

export const sfx = new Sfx();
