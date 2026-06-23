// Procedural infinite world with deep layers (simulating Minecraft's -64 to +64)
import { createNoise2D, createNoise3D } from "simplex-noise";
import { BlockType } from "./blocks";

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128; // Y=0 = deep bedrock (MC -64), Y=64 = sea level (MC 0), Y=127 = surface max
export const WATER_LEVEL = 64;   // Sea level (MC Y=0)
export const SEA_FLOOR = 54;     // Ocean floor (MC Y=-10)
export const BEDROCK_DEPTH = 4;  // Bottom layers are bedrock

function alea(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Chunk {
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

export type BiomeType = "plains" | "forest" | "mountains" | "desert";

export class World {
  chunks: Map<string, Chunk> = new Map();
  noise2D: ReturnType<typeof createNoise2D>;
  noise2DDetail: ReturnType<typeof createNoise2D>;
  noise2DBiome: ReturnType<typeof createNoise2D>;
  noise2DBiomeTemp: ReturnType<typeof createNoise2D>;
  noise3D: ReturnType<typeof createNoise3D>;
  noise3DTree: ReturnType<typeof createNoise3D>;
  seed: number;
  playerModifications: Map<string, number> = new Map();
  private _trackPlayerMods: boolean = false;

  constructor(seed = 2024) {
    this.seed = seed;
    this.noise2D = createNoise2D(alea(seed));
    this.noise2DDetail = createNoise2D(alea(seed + 999));
    this.noise2DBiome = createNoise2D(alea(seed + 222));
    this.noise2DBiomeTemp = createNoise2D(alea(seed + 888));
    this.noise3D = createNoise3D(alea(seed + 555));
    this.noise3DTree = createNoise3D(alea(seed + 31337));
  }

  key(cx: number, cz: number): string { return `${cx},${cz}`; }

  getChunk(cx: number, cz: number): Chunk | undefined { return this.chunks.get(this.key(cx, cz)); }

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
    if (this._trackPlayerMods) {
      this.playerModifications.set(`${wx},${wy},${wz}`, type);
    }
  }

  enablePlayerModificationTracking(enabled: boolean) { this._trackPlayerMods = enabled; }

  // === BIOMES ===
  getBiomeAt(wx: number, wz: number): BiomeType {
    const biomeNoise = this.noise2DBiome(wx * 0.005, wz * 0.005);
    if (biomeNoise < -0.5) return "desert";
    if (biomeNoise < -0.15) return "plains";
    if (biomeNoise < 0.3) return "forest";
    if (biomeNoise < 0.5) return "mountains";
    return "plains";
  }

  isOcean(wx: number, wz: number): boolean {
    return this.noise2DBiomeTemp(wx * 0.004, wz * 0.004) > 0.5;
  }

  isIsland(wx: number, wz: number): boolean {
    if (!this.isOcean(wx, wz)) return false;
    return this.noise2DDetail(wx * 0.02, wz * 0.02) > 0.6;
  }

  // === TERRAIN HEIGHT ===
  getHeightAt(wx: number, wz: number): number {
    if (this.isOcean(wx, wz) && !this.isIsland(wx, wz)) {
      const depth = this.noise2D(wx * 0.02, wz * 0.02) * 4;
      return Math.floor(SEA_FLOOR + 2 + depth);
    }
    if (this.isIsland(wx, wz)) {
      const h = this.noise2D(wx * 0.03, wz * 0.03) * 4;
      return Math.floor(WATER_LEVEL + 2 + h);
    }

    const biome = this.getBiomeAt(wx, wz);
    let baseHeight: number;
    let amplitude: number;

    switch (biome) {
      case "desert": baseHeight = WATER_LEVEL + 2; amplitude = 3; break;
      case "plains": baseHeight = WATER_LEVEL + 4; amplitude = 5; break;
      case "forest": baseHeight = WATER_LEVEL + 6; amplitude = 8; break;
      case "mountains": baseHeight = WATER_LEVEL + 10; amplitude = 22; break;
    }

    const base = this.noise2D(wx * 0.012, wz * 0.012) * amplitude;
    const detail = this.noise2DDetail(wx * 0.04, wz * 0.04) * (amplitude * 0.3);
    const fine = this.noise2D(wx * 0.1, wz * 0.1) * 2;

    return Math.floor(baseHeight + base + detail + fine);
  }

  // === PEEK (for cross-chunk culling) ===
  peekBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0) return BlockType.Bedrock;
    if (wy >= WORLD_HEIGHT) return BlockType.Air;
    const h = this.getHeightAt(wx, wz);
    const biome = this.getBiomeAt(wx, wz);
    if (wy > h) {
      if (wy <= WATER_LEVEL) return BlockType.Water;
      return BlockType.Air;
    }
    if (wy < BEDROCK_DEPTH) return BlockType.Bedrock;
    if (wy < h - 3) {
      // Ores: use same vein logic as decorateChunk for consistency
      // Use the same LCG seeded by chunk coords
      const chunkCx = Math.floor(wx / CHUNK_SIZE);
      const chunkCz = Math.floor(wz / CHUNK_SIZE);
      const oreSeed = (this.seed ^ (chunkCx * 73856093) ^ (chunkCz * 19349663)) >>> 0;
      // We can't replay the full vein generation, so just return Stone
      // The actual ores are placed in decorateChunk and stored in the chunk
      return BlockType.Stone;
    }
    if (wy < h) {
      if (biome === "desert") return BlockType.Sand;
      if (h <= WATER_LEVEL + 1) return BlockType.Sand;
      return BlockType.Dirt;
    }
    if (biome === "desert") return BlockType.Sand;
    if (h <= WATER_LEVEL + 1) return BlockType.Sand;
    if (biome === "mountains" && h >= 90) return BlockType.Snow;
    if (biome === "mountains" && h >= 80) return BlockType.Stone;
    return BlockType.Grass;
  }

  // === CHUNK GENERATION ===
  generateChunk(chunk: Chunk) {
    if (chunk.generated) return;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = this.getHeightAt(wx, wz);
        const biome = this.getBiomeAt(wx, wz);

        for (let y = 0; y <= h && y < WORLD_HEIGHT; y++) {
          let block: BlockType;
          if (y < BEDROCK_DEPTH) {
            block = BlockType.Bedrock;
          } else if (y < BEDROCK_DEPTH && this.noise3D(wx * 0.5, y * 0.5, wz * 0.5) > 0.2) {
            block = BlockType.Bedrock;
          } else if (y < h - 3) {
            block = BlockType.Stone; // ores placed by vein generation in decorateChunk
          } else if (y < h) {
            if (biome === "desert") block = BlockType.Sand;
            else if (h <= WATER_LEVEL + 1) block = BlockType.Sand;
            else block = BlockType.Dirt;
          } else {
            if (biome === "desert") block = BlockType.Sand;
            else if (h <= WATER_LEVEL + 1) block = BlockType.Sand;
            else if (biome === "mountains" && h >= 90) block = BlockType.Snow;
            else if (biome === "mountains" && h >= 80) block = BlockType.Stone;
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

  // === DECORATIONS: caves, ore veins, trees ===
  decorateChunk(chunk: Chunk) {
    if (chunk.decorated) return;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    // --- Carve caves FIRST (only stone and dirt, before ores are placed) ---
    // Caves are less frequent so most of the underground is solid stone with ores.
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        for (let y = BEDROCK_DEPTH; y < 100; y++) {
          const b = chunk.getLocal(lx, y, lz);
          if (b === BlockType.Stone || b === BlockType.Dirt) {
            // Caverns: large open spaces (rare, threshold 0.55 = less frequent)
            const cavern = this.noise3D(wx * 0.035, y * 0.04, wz * 0.035);
            // Tunnels: narrow winding passages (very rare, threshold 0.72)
            const tunnel = this.noise3D(wx * 0.08, y * 0.12, wz * 0.08);
            if (cavern > 0.55) {
              chunk.setLocal(lx, y, lz, BlockType.Air);
            } else if (tunnel > 0.72 && cavern > 0.3) {
              chunk.setLocal(lx, y, lz, BlockType.Air);
            }
            // Most blocks remain Stone — ores are placed after cave carving
          }
        }
      }
    }

    // --- ORE VEIN GENERATION (placed AFTER caves, so ores are in solid stone) ---
    // Deterministic LCG RNG seeded by chunk coords + world seed
    const oreSeed = (this.seed ^ (chunk.cx * 73856093) ^ (chunk.cz * 19349663)) >>> 0;
    let oreState = oreSeed;
    const oreRand = () => {
      oreState = (oreState * 1664525 + 1013904223) >>> 0;
      return oreState / 4294967296;
    };

    // Helper: place a vein of ore using random walk
    const placeVein = (oreType: BlockType, startLx: number, startY: number, startLz: number, size: number): number => {
      let cx = startLx, cy = startY, cz = startLz;
      let placed = 0;
      for (let i = 0; i < size; i++) {
        if (cx >= 0 && cx < CHUNK_SIZE && cy >= 0 && cy < WORLD_HEIGHT && cz >= 0 && cz < CHUNK_SIZE) {
          if (chunk.getLocal(cx, cy, cz) === BlockType.Stone) {
            chunk.setLocal(cx, cy, cz, oreType);
            placed++;
          }
        }
        cx += Math.floor(oreRand() * 3) - 1;
        cy += Math.floor(oreRand() * 3) - 1;
        cz += Math.floor(oreRand() * 3) - 1;
      }
      return placed;
    };

    // CARBÓN: 30 attempts, Y=0 to Y=110, vein 8-16 blocks (VERY COMMON)
    for (let i = 0; i < 30; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 110);
      const size = 8 + Math.floor(oreRand() * 9); // 8-16
      placeVein(BlockType.CoalOre, lx, y, lz, size);
    }

    // HIERRO: 15 attempts, Y=0 to Y=80, vein 4-8 blocks (COMMON)
    for (let i = 0; i < 15; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 80);
      const size = 4 + Math.floor(oreRand() * 5); // 4-8
      placeVein(BlockType.IronOre, lx, y, lz, size);
    }

    // ORO: 6 attempts, Y=0 to Y=40, vein 2-6 blocks (RARE)
    for (let i = 0; i < 6; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 40);
      const size = 2 + Math.floor(oreRand() * 5); // 2-6
      placeVein(BlockType.GoldOre, lx, y, lz, size);
    }

    // DIAMANTE: 3 attempts, Y=0 to Y=20, vein 1-4 blocks (VERY RARE)
    for (let i = 0; i < 3; i++) {
      const lx = Math.floor(oreRand() * CHUNK_SIZE);
      const lz = Math.floor(oreRand() * CHUNK_SIZE);
      const y = Math.floor(oreRand() * 20);
      const size = 1 + Math.floor(oreRand() * 4); // 1-4
      placeVein(BlockType.DiamondOre, lx, y, lz, size);
    }

    // --- Plant trees ---
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const biome = this.getBiomeAt(wx, wz);
        let treeThreshold: number;
        switch (biome) {
          case "forest": treeThreshold = 0.65; break;
          case "plains": treeThreshold = 0.88; break;
          case "mountains": treeThreshold = 0.82; break;
          case "desert": treeThreshold = 2.0; break;
          default: treeThreshold = 0.85;
        }
        const treeNoise = this.noise3DTree(wx * 0.4, 0, wz * 0.4);
        if (treeNoise > treeThreshold) {
          let topY = -1;
          for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
            const b = chunk.getLocal(lx, y, lz);
            if (b !== BlockType.Air && b !== BlockType.Water) { topY = y; break; }
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

  // === TREE ===
  plantTree(wx: number, baseY: number, wz: number) {
    const h = 4 + Math.floor((this.noise3DTree(wx * 0.7, baseY * 0.7, wz * 0.7) + 1) * 1.5);
    for (let i = 0; i < h; i++) {
      if (baseY + i < WORLD_HEIGHT) this.setBlock(wx, baseY + i, wz, BlockType.Wood);
    }
    const topY = baseY + h - 1;
    for (let dy = -2; dy <= 0; dy++) {
      const r = 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r) {
            if (this.noise3DTree((wx + dx) * 0.9, (topY + dy) * 0.9, (wz + dz) * 0.9) < 0) continue;
          }
          const lx = wx + dx, ly = topY + dy, lz = wz + dz;
          if (ly < 0 || ly >= WORLD_HEIGHT) continue;
          if (this.getBlockIfLoaded(lx, ly, lz) === BlockType.Air) this.setBlock(lx, ly, lz, BlockType.Leaves);
        }
      }
    }
    for (let dy = 1; dy <= 2; dy++) {
      const r = dy === 1 ? 1 : 0;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const lx = wx + dx, ly = topY + dy, lz = wz + dz;
          if (ly < 0 || ly >= WORLD_HEIGHT) continue;
          if (this.getBlockIfLoaded(lx, ly, lz) === BlockType.Air) this.setBlock(lx, ly, lz, BlockType.Leaves);
        }
      }
    }
  }

  // === SPAWN ===
  getSpawnPoint(): { x: number; y: number; z: number } {
    this.getOrCreateChunk(0, 0);
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      const b = this.getBlock(0, y, 0);
      if (b !== BlockType.Air && b !== BlockType.Water) {
        return { x: 0.5, y: y + 2.2, z: 0.5 };
      }
    }
    return { x: 0.5, y: 70, z: 0.5 };
  }

  // === UNLOAD ===
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
