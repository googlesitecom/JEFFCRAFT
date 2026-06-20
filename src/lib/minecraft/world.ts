// Procedural infinite world. Chunks are generated on-demand.
import { createNoise2D, createNoise3D } from "simplex-noise";
import { BlockType } from "./blocks";

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const WATER_LEVEL = 18;
export const SEA_FLOOR = 8;
export const BEDROCK_DEPTH = 2;

// Seeded RNG for noise initialization
function alea(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A Chunk is a CHUNK_SIZE x WORLD_HEIGHT x CHUNK_SIZE column of blocks
export class Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  generated: boolean = false;
  // Track whether this chunk has trees/decorations applied
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

export class World {
  chunks: Map<string, Chunk> = new Map();
  noise2D: ReturnType<typeof createNoise2D>;
  noise2DDetail: ReturnType<typeof createNoise2D>;
  noise2DBiome: ReturnType<typeof createNoise2D>;
  noise3D: ReturnType<typeof createNoise3D>;
  noise3DTree: ReturnType<typeof createNoise3D>;
  seed: number;
  // Track player-modified blocks for save system
  playerModifications: Map<string, number> = new Map();

  constructor(seed = 2024) {
    this.seed = seed;
    this.noise2D = createNoise2D(alea(seed));
    this.noise2DDetail = createNoise2D(alea(seed + 999));
    this.noise2DBiome = createNoise2D(alea(seed + 222));
    this.noise3D = createNoise3D(alea(seed + 555));
    this.noise3DTree = createNoise3D(alea(seed + 31337));
  }

  key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(this.key(cx, cz));
  }

  getOrCreateChunk(cx: number, cz: number): Chunk {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
      this.generateChunk(c);
      this.decorateChunk(c);
    }
    return c;
  }

  // Get block from any world coordinate, generating the chunk if needed
  getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0) return BlockType.Bedrock;
    if (wy >= WORLD_HEIGHT) return BlockType.Air;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) {
      // We need to peek at terrain without storing it.
      return this.peekBlock(wx, wy, wz);
    }
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return chunk.getLocal(lx, wy, lz);
  }

  // Like getBlock but does NOT generate the chunk; returns Air if not loaded
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

  // Track if the next setBlock calls should be recorded as player modifications
  private _trackPlayerMods: boolean = false;
  
  setBlock(wx: number, wy: number, wz: number, type: BlockType) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    chunk.setLocal(lx, wy, lz, type);
    // Record player modification if tracking is enabled
    if (this._trackPlayerMods) {
      this.playerModifications.set(`${wx},${wy},${wz}`, type);
    }
  }
  
  // Enable/disable tracking of player modifications (for save system)
  enablePlayerModificationTracking(enabled: boolean) {
    this._trackPlayerMods = enabled;
  }

  // Peek at terrain height at a world coordinate without generating a chunk
  getHeightAt(wx: number, wz: number): number {
    const scale1 = 0.012;
    const scale2 = 0.04;
    const scale3 = 0.1;

    const base = this.noise2D(wx * scale1, wz * scale1) * 18;
    const detail = this.noise2DDetail(wx * scale2, wz * scale2) * 6;
    const fine = this.noise2D(wx * scale3, wz * scale3) * 2;

    return Math.floor(SEA_FLOOR + 18 + base + detail + fine);
  }

  // Peek at what block would be at this location (used for cross-chunk face culling)
  peekBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0) return BlockType.Bedrock;
    if (wy >= WORLD_HEIGHT) return BlockType.Air;
    const h = this.getHeightAt(wx, wz);
    if (wy > h) {
      if (wy <= WATER_LEVEL) return BlockType.Water;
      return BlockType.Air;
    }
    if (wy === 0) return BlockType.Bedrock;
    if (wy < h - 3) {
      return BlockType.Stone; // ores are placed by vein generation in decorateChunk
    }
    if (wy < h) {
      // Sub-surface: dirt or sand near water
      if (h <= WATER_LEVEL + 1) return BlockType.Sand;
      return BlockType.Dirt;
    }
    // Top block
    if (h <= WATER_LEVEL + 1) return BlockType.Sand;
    if (h >= 34) return BlockType.Snow;
    return BlockType.Grass;
  }

  // Generate the basic terrain for a chunk
  generateChunk(chunk: Chunk) {
    if (chunk.generated) return;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = this.getHeightAt(wx, wz);

        for (let y = 0; y <= h && y < WORLD_HEIGHT; y++) {
          let block: BlockType;
          if (y === 0) {
            block = BlockType.Bedrock;
          } else if (y < BEDROCK_DEPTH && this.noise3D(wx * 0.5, y * 0.5, wz * 0.5) > 0.2) {
            block = BlockType.Bedrock;
          } else if (y < h - 3) {
            block = BlockType.Stone; // ores placed by vein generation later
          } else if (y < h) {
            block = h <= WATER_LEVEL + 1 ? BlockType.Sand : BlockType.Dirt;
          } else {
            if (h <= WATER_LEVEL + 1) block = BlockType.Sand;
            else if (h >= 34) block = BlockType.Snow;
            else block = BlockType.Grass;
          }
          chunk.setLocal(lx, y, lz, block);
        }

        // Water fill
        if (h < WATER_LEVEL) {
          for (let y = h + 1; y <= WATER_LEVEL; y++) {
            chunk.setLocal(lx, y, lz, BlockType.Water);
          }
        }
      }
    }

    chunk.generated = true;
  }

  // Apply decorations: trees, cave carving
  decorateChunk(chunk: Chunk) {
    if (chunk.decorated) return;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    // Carve caves
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        for (let y = 2; y < 30; y++) {
          const b = chunk.getLocal(lx, y, lz);
          if (b === BlockType.Stone || b === BlockType.Dirt) {
            const cave = this.noise3D(wx * 0.08, y * 0.12, wz * 0.08);
            if (cave > 0.68) {
              chunk.setLocal(lx, y, lz, BlockType.Air);
            }
          }
        }
      }
    }

    // === ORE VEIN GENERATION (like Minecraft) ===
    // Deterministic RNG seeded by chunk coords + seed
    const oreSeed = this.seed ^ (chunk.cx * 73856093) ^ (chunk.cz * 19349663);
    let oreState = oreSeed >>> 0;
    const oreRand = () => {
      oreState = (oreState * 1664525 + 1013904223) >>> 0;
      return oreState / 4294967296;
    };

    // Helper: place a vein of ore at (lx, y, lz) with given size
    const placeVein = (oreType: BlockType, startLx: number, startY: number, startLz: number, size: number) => {
      let cx = startLx, cy = startY, cz = startLz;
      for (let i = 0; i < size; i++) {
        // Check bounds and only replace stone
        if (cx >= 0 && cx < CHUNK_SIZE && cy >= 0 && cy < WORLD_HEIGHT && cz >= 0 && cz < CHUNK_SIZE) {
          if (chunk.getLocal(cx, cy, cz) === BlockType.Stone) {
            chunk.setLocal(cx, cy, cz, oreType);
          }
        }
        // Random walk to next block in vein
        cx += Math.floor(oreRand() * 3) - 1;
        cy += Math.floor(oreRand() * 3) - 1;
        cz += Math.floor(oreRand() * 3) - 1;
      }
    };

    // COAL: 20 attempts per chunk, Y=0 to Y=40, vein size 8-16
    for (let i = 0; i < 20; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 40);
      const size = 8 + Math.floor(oreRand() * 9); // 8-16
      placeVein(BlockType.Coal, lx, y, lz, size);
    }

    // IRON: 10 attempts per chunk, Y=0 to Y=30, vein size 4-8
    for (let i = 0; i < 10; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 30);
      const size = 4 + Math.floor(oreRand() * 5); // 4-8
      placeVein(BlockType.Iron, lx, y, lz, size);
    }

    // GOLD: 4 attempts per chunk, Y=0 to Y=16, vein size 2-6
    for (let i = 0; i < 4; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 16);
      const size = 2 + Math.floor(oreRand() * 5); // 2-6
      placeVein(BlockType.Gold, lx, y, lz, size);
    }

    // DIAMOND: 2 attempts per chunk, Y=0 to Y=14, vein size 1-4 (very rare)
    for (let i = 0; i < 2; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 14);
      const size = 1 + Math.floor(oreRand() * 4); // 1-4
      placeVein(BlockType.Diamond, lx, y, lz, size);
    }

    // Plant trees: deterministic per (wx, wz)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        // Use noise3DTree as a deterministic tree noise in 2D slice
        const treeNoise = this.noise3DTree(wx * 0.4, 0, wz * 0.4);
        if (treeNoise > 0.78) {
          // Find top solid block
          let topY = -1;
          for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
            const b = chunk.getLocal(lx, y, lz);
            if (b !== BlockType.Air && b !== BlockType.Water) {
              topY = y;
              break;
            }
          }
          if (topY < 0) continue;
          if (chunk.getLocal(lx, topY, lz) !== BlockType.Grass) continue;
          if (topY < WATER_LEVEL) continue;
          this.plantTree(wx, topY + 1, wz);
        }
      }
    }

    chunk.decorated = true;
  }

  // Plant a tree whose trunk is at (wx, baseY, wz). Leaves spill across chunk boundaries.
  plantTree(wx: number, baseY: number, wz: number) {
    const h = 4 + Math.floor((this.noise3DTree(wx * 0.7, baseY * 0.7, wz * 0.7) + 1) * 1.5); // 4-6
    for (let i = 0; i < h; i++) {
      if (baseY + i < WORLD_HEIGHT) {
        this.setBlock(wx, baseY + i, wz, BlockType.Wood);
      }
    }
    const topY = baseY + h - 1;
    // Wide bottom layer
    for (let dy = -2; dy <= 0; dy++) {
      const r = 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r) {
            // Corner: skip sometimes deterministically
            const cornerNoise = this.noise3DTree((wx + dx) * 0.9, (topY + dy) * 0.9, (wz + dz) * 0.9);
            if (cornerNoise < 0) continue;
          }
          const lx = wx + dx;
          const ly = topY + dy;
          const lz = wz + dz;
          if (ly < 0 || ly >= WORLD_HEIGHT) continue;
          if (this.getBlockIfLoaded(lx, ly, lz) === BlockType.Air) {
            this.setBlock(lx, ly, lz, BlockType.Leaves);
          }
        }
      }
    }
    // Top narrower layers
    for (let dy = 1; dy <= 2; dy++) {
      const r = dy === 1 ? 1 : 0;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const lx = wx + dx;
          const ly = topY + dy;
          const lz = wz + dz;
          if (ly < 0 || ly >= WORLD_HEIGHT) continue;
          if (this.getBlockIfLoaded(lx, ly, lz) === BlockType.Air) {
            this.setBlock(lx, ly, lz, BlockType.Leaves);
          }
        }
      }
    }
  }

  // Find a safe spawn point
  getSpawnPoint(): { x: number; y: number; z: number } {
    const cx = 0;
    const cz = 0;
    // Ensure spawn chunk is generated
    this.getOrCreateChunk(0, 0);
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      const b = this.getBlock(cx, y, cz);
      if (b !== BlockType.Air && b !== BlockType.Water) {
        return { x: cx + 0.5, y: y + 2.2, z: cz + 0.5 };
      }
    }
    return { x: cx + 0.5, y: 30, z: cz + 0.5 };
  }

  // Unload distant chunks to free memory
  unloadDistantChunks(centerCx: number, centerCz: number, radius: number) {
    const toRemove: string[] = [];
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - centerCx;
      const dz = chunk.cz - centerCz;
      if (Math.abs(dx) > radius + 2 || Math.abs(dz) > radius + 2) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) {
      this.chunks.delete(k);
    }
  }
}
