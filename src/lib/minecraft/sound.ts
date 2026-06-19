// Procedural sound effects using WebAudio - no external files needed
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  enabled: boolean = true;

  constructor() {}

  private ensureContext() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.ctx.destination);
      } catch (e) {
        this.enabled = false;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Call this from a user gesture (click) to unlock audio
  unlock() {
    this.ensureContext();
  }

  setVolume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  // Generic noise burst (used for footsteps, breaks)
  private noiseBurst(
    duration: number,
    filterFreq: number,
    filterQ: number,
    volume: number,
    type: BiquadFilterType = "bandpass"
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;

    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  // Generic tone (used for clicks, placing)
  private tone(
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = "square",
    freqEnd?: number
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, freqEnd),
        ctx.currentTime + duration
      );
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // === Block sounds ===

  // Different sound for each block type when breaking/placing
  blockSound(blockType: number, action: "break" | "place") {
    // Block type ids from blocks.ts:
    // 1=grass, 2=dirt, 3=stone, 4=cobble, 5=wood, 6=leaves, 7=sand,
    // 8=water, 9=bedrock, 10=planks, 11=glass, 12=brick, 17=snow, 19=gravel
    const volume = action === "break" ? 0.35 : 0.25;
    const dur = action === "break" ? 0.18 : 0.12;
    switch (blockType) {
      case 1: // grass
      case 2: // dirt
        this.noiseBurst(dur, 500, 1, volume, "lowpass");
        break;
      case 3: // stone
      case 4: // cobblestone
      case 9: // bedrock
      case 12: // brick
        this.noiseBurst(dur, 2000, 2, volume, "bandpass");
        this.tone(action === "break" ? 220 : 280, 0.08, volume * 0.5, "square");
        break;
      case 5: // wood log
      case 10: // planks
        this.noiseBurst(dur, 800, 2, volume, "bandpass");
        this.tone(action === "break" ? 300 : 380, 0.1, volume * 0.4, "triangle");
        break;
      case 6: // leaves
        this.noiseBurst(dur * 1.5, 3000, 1, volume * 0.7, "highpass");
        break;
      case 7: // sand
      case 19: // gravel
        this.noiseBurst(dur, 400, 1, volume, "lowpass");
        break;
      case 8: // water
        this.noiseBurst(dur * 2, 800, 0.5, volume * 0.5, "lowpass");
        break;
      case 11: // glass
        if (action === "break") {
          // Shatter sound: multiple high freq bursts
          for (let i = 0; i < 4; i++) {
            setTimeout(() => this.noiseBurst(0.08, 4000 + Math.random() * 2000, 4, 0.3, "highpass"), i * 30);
          }
        } else {
          this.tone(2000, 0.1, volume, "sine");
        }
        break;
      case 17: // snow
        this.noiseBurst(dur, 6000, 1, volume * 0.6, "highpass");
        break;
      default:
        this.noiseBurst(dur, 1000, 1, volume, "bandpass");
    }
  }

  // === Player sounds ===

  footstep() {
    // Soft thud
    this.noiseBurst(0.08, 200, 1, 0.12, "lowpass");
  }

  jump() {
    this.tone(440, 0.08, 0.15, "sine", 660);
  }

  land() {
    this.noiseBurst(0.12, 150, 1, 0.2, "lowpass");
  }

  hurt() {
    // Quick descending tone (like Minecraft "oof")
    this.tone(330, 0.2, 0.3, "square", 110);
    this.noiseBurst(0.15, 800, 1, 0.15, "lowpass");
  }

  drown() {
    // Gurgling sound
    this.noiseBurst(0.3, 300, 1, 0.2, "lowpass");
  }

  eat() {
    // Two quick bites
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        this.noiseBurst(0.06, 1500, 1, 0.25, "bandpass");
        this.tone(200, 0.05, 0.15, "sine");
      }, i * 150);
    }
  }

  // === UI sounds ===

  click() {
    this.tone(800, 0.04, 0.15, "square");
  }

  openInventory() {
    this.tone(440, 0.06, 0.2, "square");
    setTimeout(() => this.tone(660, 0.06, 0.2, "square"), 50);
  }

  closeInventory() {
    this.tone(660, 0.06, 0.2, "square");
    setTimeout(() => this.tone(440, 0.06, 0.2, "square"), 50);
  }

  craftSuccess() {
    this.tone(523, 0.08, 0.25, "triangle"); // C
    setTimeout(() => this.tone(659, 0.08, 0.25, "triangle"), 80); // E
    setTimeout(() => this.tone(784, 0.12, 0.25, "triangle"), 160); // G
  }

  pickup() {
    this.tone(880, 0.06, 0.2, "square");
    setTimeout(() => this.tone(1100, 0.08, 0.2, "square"), 50);
  }
}

// Singleton
let soundInstance: SoundManager | null = null;
export function getSound(): SoundManager {
  if (!soundInstance) soundInstance = new SoundManager();
  return soundInstance;
}
