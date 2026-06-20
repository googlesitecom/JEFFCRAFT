// Procedural sound effects using WebAudio - satisfying and high quality
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  enabled: boolean = true;

  constructor() {}

  private ensureContext() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
        // SFX bus
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.6;
        this.sfxGain.connect(this.masterGain);
        // Music bus
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.25;
        this.musicGain.connect(this.masterGain);
      } catch (e) {
        this.enabled = false;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  unlock() {
    this.ensureContext();
  }

  setVolume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  // === Core sound generators ===

  // Noise burst (for impacts, footsteps, breaks)
  private noiseBurst(duration: number, filterFreq: number, filterQ: number, volume: number, type: BiquadFilterType = "bandpass", pitch?: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // Fade out envelope
      const env = 1 - (i / bufferSize);
      data[i] = (Math.random() * 2 - 1) * env;
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
    gain.connect(this.sfxGain);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  // Tone with envelope
  private tone(freq: number, duration: number, volume: number, type: OscillatorType = "sine", freqEnd?: number, attack: number = 0.005) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), ctx.currentTime + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // === Block sounds (satisfying, varied per material) ===

  blockSound(blockType: number, action: "break" | "place") {
    const vol = action === "break" ? 0.4 : 0.3;
    const dur = action === "break" ? 0.2 : 0.15;

    switch (blockType) {
      case 1: case 2: // grass, dirt
        this.noiseBurst(dur, 400, 0.8, vol, "lowpass");
        this.tone(180 + Math.random() * 40, dur * 0.6, vol * 0.3, "triangle", 100);
        break;
      case 3: case 4: case 9: case 12: // stone, cobblestone, bedrock, brick
        // Sharp crack for break, thud for place
        if (action === "break") {
          this.noiseBurst(0.05, 3000, 3, vol * 0.8, "bandpass");
          this.noiseBurst(dur, 800, 1, vol * 0.6, "lowpass");
          this.tone(200, 0.08, vol * 0.4, "square", 120);
        } else {
          this.noiseBurst(dur, 600, 1, vol, "lowpass");
          this.tone(150, 0.1, vol * 0.5, "sine", 80);
        }
        break;
      case 5: case 10: // wood log, planks
        if (action === "break") {
          this.noiseBurst(dur, 1200, 1.5, vol, "bandpass");
          this.tone(300, 0.1, vol * 0.4, "triangle", 200);
        } else {
          this.noiseBurst(dur * 0.7, 1000, 1, vol * 0.8, "bandpass");
          this.tone(250, 0.08, vol * 0.5, "sine");
        }
        break;
      case 6: // leaves - rustling
        this.noiseBurst(dur * 1.5, 4000, 0.5, vol * 0.6, "highpass");
        this.noiseBurst(dur * 0.5, 2000, 0.3, vol * 0.4, "bandpass");
        break;
      case 7: case 19: // sand, gravel
        this.noiseBurst(dur, 350, 0.5, vol, "lowpass");
        for (let i = 0; i < 3; i++) {
          setTimeout(() => this.noiseBurst(0.04, 300 + Math.random() * 200, 0.5, vol * 0.3, "lowpass"), i * 30);
        }
        break;
      case 8: // water
        this.noiseBurst(dur * 2, 500, 0.3, vol * 0.5, "lowpass");
        this.tone(100, dur, vol * 0.2, "sine", 50);
        break;
      case 11: // glass
        if (action === "break") {
          // Shatter: multiple high-freq crystalline bursts
          for (let i = 0; i < 6; i++) {
            setTimeout(() => {
              this.noiseBurst(0.06, 3000 + Math.random() * 4000, 5, 0.25, "highpass");
              this.tone(2000 + Math.random() * 3000, 0.08, 0.15, "sine", 500);
            }, i * 25);
          }
        } else {
          this.tone(2500, 0.1, vol, "sine");
        }
        break;
      case 17: // snow
        this.noiseBurst(dur, 5000, 0.3, vol * 0.5, "highpass");
        break;
      case 13: case 14: case 15: case 16: // ores
        this.noiseBurst(0.05, 2500, 3, vol * 0.7, "bandpass");
        this.noiseBurst(dur, 800, 1, vol * 0.5, "lowpass");
        // Special sparkle for diamond
        if (blockType === 16) {
          this.tone(3000, 0.15, 0.15, "sine", 4000);
          setTimeout(() => this.tone(4000, 0.1, 0.1, "sine"), 80);
        }
        break;
      default:
        this.noiseBurst(dur, 800, 1, vol, "bandpass");
    }
  }

  // === Player sounds ===

  hit() {
    this.noiseBurst(0.1, 800, 1, 0.2, "lowpass");
    this.tone(300, 0.06, 0.1, "square", 150);
  }

  footstep() {
    this.noiseBurst(0.06, 180, 0.5, 0.08, "lowpass");
  }

  jump() {
    this.tone(400, 0.06, 0.1, "sine", 600);
  }

  land() {
    this.noiseBurst(0.1, 120, 0.5, 0.15, "lowpass");
    this.tone(80, 0.08, 0.1, "sine", 50);
  }

  hurt() {
    // Quick "oof" - descending tone with noise
    this.tone(350, 0.15, 0.3, "square", 100);
    this.noiseBurst(0.1, 600, 0.5, 0.12, "lowpass");
  }

  drown() {
    this.noiseBurst(0.3, 250, 0.3, 0.15, "lowpass");
  }

  eat() {
    // Satisfying bite + chew
    this.noiseBurst(0.05, 1500, 1, 0.2, "bandpass");
    this.tone(200, 0.04, 0.1, "sine");
    setTimeout(() => {
      this.noiseBurst(0.04, 800, 0.5, 0.15, "lowpass");
    }, 80);
  }

  // === UI sounds ===

  click() {
    this.tone(800, 0.03, 0.1, "square");
  }

  openInventory() {
    this.tone(440, 0.05, 0.15, "square");
    setTimeout(() => this.tone(660, 0.05, 0.15, "square"), 40);
  }

  closeInventory() {
    this.tone(660, 0.05, 0.15, "square");
    setTimeout(() => this.tone(440, 0.05, 0.15, "square"), 40);
  }

  craftSuccess() {
    // Pleasant ascending chime
    this.tone(523, 0.08, 0.2, "triangle");
    setTimeout(() => this.tone(659, 0.08, 0.2, "triangle"), 70);
    setTimeout(() => this.tone(784, 0.12, 0.2, "triangle"), 140);
  }

  pickup() {
    // Quick pop sound
    this.tone(880, 0.04, 0.15, "sine", 1200);
    setTimeout(() => this.tone(1200, 0.06, 0.12, "sine", 1600), 30);
  }

  // XP orb pickup - a pleasant ding sound
  orbPickup() {
    this.tone(1318, 0.06, 0.12, "sine", 1700); // E6
    setTimeout(() => this.tone(1568, 0.08, 0.10, "sine", 1800), 40); // G6
  }

  // XP level-up sound
  levelUp() {
    this.tone(523, 0.1, 0.18, "triangle"); // C5
    setTimeout(() => this.tone(659, 0.1, 0.18, "triangle"), 90);   // E5
    setTimeout(() => this.tone(784, 0.15, 0.20, "triangle"), 180); // G5
  }

  // === Background music ===
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private musicPlaying: boolean = false;
  private musicAudio: HTMLAudioElement | null = null;

  startMusic() {
    if (this.musicPlaying) return;
    this.musicPlaying = true;

    // Try to load /Musica.mp3 first
    this.musicAudio = new Audio("/Musica.mp3");
    this.musicAudio.loop = true;
    this.musicAudio.volume = 0.3;
    this.musicAudio.play().then(() => {
      // Music file loaded successfully
    }).catch(() => {
      // Fallback to procedural ambient music
      this.musicAudio = null;
      this.scheduleNextNote();
    });
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio = null;
    }
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleNextNote() {
    if (!this.musicPlaying) return;
    const delay = 2000 + Math.random() * 4000;
    this.musicTimer = setTimeout(() => {
      this.playAmbientNote();
      this.scheduleNextNote();
    }, delay);
  }

  private playAmbientNote() {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;

    const notes = [
      261.63, 293.66, 329.63, 392.00, 440.00,
      523.25, 587.33, 659.25, 783.99, 880.00,
    ];
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const duration = 1.5 + Math.random() * 2;
    const volume = 0.08 + Math.random() * 0.05;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = "sine";
    osc1.frequency.value = freq;
    osc2.type = "triangle";
    osc2.frequency.value = freq * 2;

    filter.type = "lowpass";
    filter.frequency.value = 2000;
    filter.Q.value = 1;

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + duration);
    osc2.stop(ctx.currentTime + duration);

    if (Math.random() > 0.6) {
      setTimeout(() => {
        const harmonyNotes = notes.filter((n) => n > freq && n < freq * 1.5);
        if (harmonyNotes.length > 0) {
          const hFreq = harmonyNotes[Math.floor(Math.random() * harmonyNotes.length)];
          const hOsc = ctx.createOscillator();
          const hGain = ctx.createGain();
          hOsc.type = "sine";
          hOsc.frequency.value = hFreq;
          hGain.gain.setValueAtTime(0, ctx.currentTime);
          hGain.gain.linearRampToValueAtTime(volume * 0.6, ctx.currentTime + 0.05);
          hGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 0.8);
          hOsc.connect(hGain);
          hGain.connect(this.musicGain!);
          hOsc.start();
          hOsc.stop(ctx.currentTime + duration * 0.8);
        }
      }, 200 + Math.random() * 300);
    }
  }
}

// Singleton
let soundInstance: SoundManager | null = null;
export function getSound(): SoundManager {
  if (!soundInstance) soundInstance = new SoundManager();
  return soundInstance;
}
