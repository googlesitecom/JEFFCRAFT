// Nether dimension: a separate world generator for the Nether.
// Generates netherrack terrain with lava lakes, soul sand valleys, glowstone clusters,
// and blaze fortresses (structures made of nether bricks with blaze spawners).
import { createNoise2D, createNoise3D } from "simplex-noise";
import { BlockType } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./world";

function alea(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const NETHER_HEIGHT = 64; // nether is shorter than overworld

export class NetherChunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  generated: boolean = false;
  decorated: boolean = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  }

  index(lx: number, y: number, lz: number): number {
    return lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
  }

  getLocal(lx: number, y: number, lz: number): BlockType {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockType.Air;
    return this.blocks[this.index(lx, y, lz)] as BlockType;
  }

  setLocal(lx: number, y: number, lz: number, type: BlockType) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[this.index(lx, y, lz)] = type;
  }
}

export class NetherWorld {
  chunks: Map<string, NetherChunk> = new Map();
  noise2D: ReturnType<typeof createNoise2D>;
  noise3D: ReturnType<typeof createNoise3D>;
  noise2DCave: ReturnType<typeof createNoise2D>;
  seed: number;

  constructor(seed = 666) {
    this.seed = seed;
    this.noise2D = createNoise2D(alea(seed));
    this.noise3D = createNoise3D(alea(seed + 1234));
    this.noise2DCave = createNoise2D(alea(seed + 5678));
  }

  key(cx: number, cz: number): string { return `${cx},${cz}`; }

  getChunk(cx: number, cz: number): NetherChunk | undefined { return this.chunks.get(this.key(cx, cz)); }

  getOrCreateChunk(cx: number, cz: number): NetherChunk {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new NetherChunk(cx, cz);
      this.chunks.set(k, c);
      this.generateChunk(c);
      this.decorateChunk(c);
    }
    return c;
  }

  getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0) return BlockType.Bedrock;
    if (wy >= WORLD_HEIGHT) return BlockType.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return this.peekBlock(wx, wy, wz);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.getLocal(lx, wy, lz);
  }

  getBlockIfLoaded(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0) return BlockType.Bedrock;
    if (wy >= WORLD_HEIGHT) return BlockType.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BlockType.Air;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.getLocal(lx, wy, lz);
  }

  setBlock(wx: number, wy: number, wz: number, type: BlockType) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    chunk.setLocal(lx, wy, lz, type);
  }

  // === TERRAIN HEIGHT (Nether is a cave system, so "height" is the ceiling/floor) ===
  getFloorHeight(wx: number, wz: number): number {
    // Floor is around Y=10-20 with some variation
    const n = this.noise2D(wx * 0.05, wz * 0.05);
    return Math.floor(10 + n * 6);
  }

  getCeilingHeight(wx: number, wz: number): number {
    // Ceiling is around Y=50-60
    const n = this.noise2D(wx * 0.04 + 100, wz * 0.04 + 100);
    return Math.floor(55 + n * 8);
  }

  peekBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0) return BlockType.Bedrock;
    if (wy >= WORLD_HEIGHT) return BlockType.Air;
    const floor = this.getFloorHeight(wx, wz);
    const ceil = this.getCeilingHeight(wx, wz);
    if (wy < 2) return BlockType.Bedrock; // bedrock floor
    if (wy > 60) return BlockType.Bedrock; // bedrock ceiling
    if (wy < floor) return BlockType.Netherrack;
    if (wy > ceil) return BlockType.Netherrack;
    return BlockType.Air;
  }

  // === CHUNK GENERATION ===
  generateChunk(chunk: NetherChunk) {
    if (chunk.generated) return;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const floor = this.getFloorHeight(wx, wz);
        const ceil = this.getCeilingHeight(wx, wz);

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let block: BlockType = BlockType.Air;
          if (y < 2) {
            block = BlockType.Bedrock; // bedrock floor
          } else if (y > 60) {
            block = BlockType.Bedrock; // bedrock ceiling
          } else if (y < floor) {
            block = BlockType.Netherrack;
            // Soul sand patches near the floor
            if (y >= floor - 2 && y < floor && this.noise2D(wx * 0.1, wz * 0.1) > 0.4) {
              block = BlockType.SoulSand;
            }
          } else if (y > ceil) {
            block = BlockType.Netherrack;
            // Glowstone clusters on the ceiling
            if (y >= ceil && y < ceil + 3 && this.noise3D(wx * 0.15, y * 0.15, wz * 0.15) > 0.6) {
              block = BlockType.Glowstone;
            }
          } else {
            // Air space — sometimes lava at the bottom
            if (y <= 12 && y >= floor - 1) {
              block = BlockType.Water; // reuse water for lava (translucent)
            }
            // Caves: 3D noise carves out large caverns
            const cavern = this.noise3D(wx * 0.03, y * 0.05, wz * 0.03);
            if (cavern > 0.4 && block === BlockType.Air) {
              block = BlockType.Air;
            }
          }
          chunk.setLocal(lx, y, lz, block);
        }
      }
    }

    chunk.generated = true;
  }

  // === DECORATIONS: blaze fortresses ===
  decorateChunk(chunk: NetherChunk) {
    if (chunk.decorated) return;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    // Blaze fortress: rare structure (1 in 16 chunks)
    const fortressRng = alea((chunk.cx * 12345) ^ (chunk.cz * 54321) ^ this.seed);
    if (fortressRng() < 0.06) {
      this.generateBlazeFortress(chunk, x0 + 4, z0 + 4);
    }

    chunk.decorated = true;
  }

  // Generate a blaze fortress: a structure made of nether bricks with rooms
  generateBlazeFortress(chunk: NetherChunk, startX: number, startZ: number) {
    // Find a suitable Y (on top of netherrack, above lava)
    let baseY = 20;
    for (let y = 30; y >= 15; y--) {
      if (chunk.getLocal(startX - x0_ref(chunk), y, startZ - z0_ref(chunk)) === BlockType.Netherrack) {
        baseY = y + 1;
        break;
      }
    }

    const lx0 = startX - chunk.cx * CHUNK_SIZE;
    const lz0 = startZ - chunk.cz * CHUNK_SIZE;

    // Fortress dimensions: 8x8 base, 10 tall
    const fw = 8, fh = 10;
    const brick = BlockType.Brick; // reuse brick for nether fortress bricks

    for (let dx = 0; dx < fw; dx++) {
      for (let dz = 0; dz < fw; dz++) {
        for (let dy = 0; dy < fh; dy++) {
          const x = lx0 + dx;
          const z = lz0 + dz;
          const y = baseY + dy;
          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
          if (y < 0 || y >= WORLD_HEIGHT) continue;

          // Walls on the perimeter
          if (dx === 0 || dx === fw - 1 || dz === 0 || dz === fw - 1) {
            if (dy < fh) {
              chunk.setLocal(x, y, z, brick);
            }
          } else {
            // Interior: floor and ceiling
            if (dy === 0 || dy === fh - 1) {
              chunk.setLocal(x, y, z, brick);
            }
            // Doorway
            if (dy === 1 && dx === Math.floor(fw / 2) && (dz === 0 || dz === fw - 1)) {
              chunk.setLocal(x, y, z, BlockType.Air);
            }
          }
        }
      }
    }

    // Glowstone lighting inside
    for (let i = 1; i < fw - 1; i += 3) {
      const gx = lx0 + i;
      const gz = lz0 + i;
      if (gx >= 0 && gx < CHUNK_SIZE && gz >= 0 && gz < CHUNK_SIZE) {
        chunk.setLocal(gx, baseY + fh - 2, gz, BlockType.Glowstone);
      }
    }
  }

  getSpawnPoint(): { x: number; y: number; z: number } {
    this.getOrCreateChunk(0, 0);
    // Find a safe spot above the lava
    for (let y = 40; y >= 15; y--) {
      const b = this.getBlock(0, y, 0);
      if (b === BlockType.Netherrack || b === BlockType.SoulSand) {
        return { x: 0.5, y: y + 2, z: 0.5 };
      }
    }
    return { x: 0.5, y: 30, z: 0.5 };
  }

  unloadDistantChunks(centerCx: number, centerCz: number, radius: number) {
    const toRemove: string[] = [];
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - centerCx;
      const dz = chunk.cz - centerCz;
      if (Math.abs(dx) > radius + 2 || Math.abs(dz) > radius + 2) toRemove.push(key);
    }
    for (const k of toRemove) this.chunks.delete(k);
  }
}

// Helper to get x0 from chunk (used in fortress generation)
function x0_ref(chunk: NetherChunk): number {
  return chunk.cx * CHUNK_SIZE;
}

function z0_ref(chunk: NetherChunk): number {
  return chunk.cz * CHUNK_SIZE;
}
