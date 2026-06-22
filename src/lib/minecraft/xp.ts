// Player XP and leveling system - Minecraft-style
// XP is collected as orbs that drop to the ground; when picked up they add to player's XP.

// Minecraft XP level curve (Java Edition):
//  - Levels 0..15:  total XP for next level = 2*L + 7
//  - Levels 16..30: total XP for next level = 5*L - 38
//  - Levels 31+:    total XP for next level = 9*L - 158
export function xpForNextLevel(level: number): number {
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

// Total XP required to REACH a given level from 0 XP (used to normalize current XP)
export function totalXpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= 15) return (level * level) + 6 * level;
  if (level <= 30) return (5 * level * level) - 81 * level + 720;
  // For level >= 31:  (9/2)*L^2 - (325/2)*L + 2220
  return Math.floor((4.5 * level * level) - 162.5 * level + 2220);
}

export class XpState {
  level: number = 0;
  // XP progress within the current level (0 .. xpForNextLevel(level))
  progress: number = 0;

  // Add XP points. Returns number of levels gained.
  addXp(amount: number): number {
    if (amount <= 0) return 0;
    let gained = 0;
    this.progress += amount;
    while (this.progress >= xpForNextLevel(this.level)) {
      this.progress -= xpForNextLevel(this.level);
      this.level++;
      gained++;
      // Hard cap to avoid runaway loops in pathological cases
      if (this.level > 999) break;
    }
    return gained;
  }

  // Returns 0..1 fraction of the way to the next level
  get progressFraction(): number {
    const need = xpForNextLevel(this.level);
    if (need <= 0) return 0;
    return Math.max(0, Math.min(1, this.progress / need));
  }

  // Total absolute XP (level + progress normalized). Used for saving.
  get totalXp(): number {
    return totalXpForLevel(this.level) + this.progress;
  }

  setTotalXp(total: number) {
    if (total < 0) total = 0;
    // Find the level whose total fits under `total`
    let lvl = 0;
    while (lvl < 999 && totalXpForLevel(lvl + 1) <= total) lvl++;
    this.level = lvl;
    this.progress = total - totalXpForLevel(lvl);
  }

  reset() {
    this.level = 0;
    this.progress = 0;
  }

  serialize(): { level: number; progress: number } {
    return { level: this.level, progress: this.progress };
  }

  deserialize(data: { level: number; progress: number } | null) {
    if (!data) {
      this.reset();
      return;
    }
    this.level = Math.max(0, Math.floor(data.level || 0));
    this.progress = Math.max(0, data.progress || 0);
  }
}
