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

export type Dimension = "overworld" | "nether" | "end";

export class World {
  chunks: Map<string, Chunk> = new Map();
  noise2D: ReturnType<typeof createNoise2D>;
  noise2DDetail: ReturnType<typeof createNoise2D>;
  noise2DBiome: ReturnType<typeof createNoise2D>;
  noise2DBiomeTemp: ReturnType<typeof createNoise2D>;
  noise3D: ReturnType<typeof createNoise3D>;
  noise3DTree: ReturnType<typeof createNoise3D>;
  noise2DVillage: ReturnType<typeof createNoise2D>;
  seed: number;
  dimension: Dimension = "overworld";
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
    this.noise2DVillage = createNoise2D(alea(seed + 99999));
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
    // Check caves in peekBlock too (so chunk borders match)
    if (wy < 100) {
      const cavern = this.noise3D(wx * 0.035, wy * 0.04, wz * 0.035);
      const tunnel = this.noise3D(wx * 0.08, wy * 0.12, wz * 0.08);
      if (cavern > 0.55 || (tunnel > 0.72 && cavern > 0.3)) {
        if (wy < h - 3) return BlockType.Air; // cave in stone layer
      }
    }
    if (wy < h - 3) {
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
    if (this.dimension === "nether") { this.generateNetherChunk(chunk); return; }
    if (this.dimension === "end") { this.generateEndChunk(chunk); return; }
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

    // Village + Stronghold generation
    this.tryGenerateVillage(Math.floor(x0 / CHUNK_SIZE), Math.floor(z0 / CHUNK_SIZE));
    this.tryGenerateStronghold(Math.floor(x0 / CHUNK_SIZE), Math.floor(z0 / CHUNK_SIZE));
  }

  clearAllChunks() { this.chunks.clear(); }

  // === FLUID FLOW (Minecraft-style) ===
  // Water flows 7 blocks horizontally from source; lava flows 3 blocks.
  // Fluids fall down infinitely. Source blocks (placed by player or generated)
  // persist; flowing blocks spread with decreasing "level" (distance from source).
  fluidUpdateQueue: Array<{ x: number; y: number; z: number; type: BlockType }> = [];
  queueFluidUpdate(x: number, y: number, z: number, type: BlockType) { this.fluidUpdateQueue.push({ x, y, z, type }); }

  // Track flow distance per fluid block so it doesn't spread infinitely.
  // Key: "x,y,z" → flow level (0 = source, 1..7 = distance from source)
  fluidLevels: Map<string, number> = new Map();
  fluidLevelKey(x: number, y: number, z: number): string { return `${x},${y},${z}`; }
  getFluidLevel(x: number, y: number, z: number): number {
    return this.fluidLevels.get(this.fluidLevelKey(x, y, z)) ?? 0;
  }
  setFluidLevel(x: number, y: number, z: number, level: number) {
    this.fluidLevels.set(this.fluidLevelKey(x, y, z), level);
  }
  clearFluidLevel(x: number, y: number, z: number) {
    this.fluidLevels.delete(this.fluidLevelKey(x, y, z));
  }

  // Max horizontal flow distance: water = 7, lava = 3 (in overworld)
  getMaxFlow(type: BlockType): number {
    return type === BlockType.Lava ? 3 : 7;
  }

  processFluidFlow(maxSteps: number = 50): boolean {
    if (this.fluidUpdateQueue.length === 0) return false;
    let steps = 0;
    while (this.fluidUpdateQueue.length > 0 && steps < maxSteps) {
      const { x, y, z, type } = this.fluidUpdateQueue.shift()!;
      steps++;
      if (this.getBlockIfLoaded(x, y, z) !== type) continue;

      const myLevel = this.getFluidLevel(x, y, z);
      const maxFlow = this.getMaxFlow(type);

      // 1. Flow down first (always, regardless of level)
      if (y > 0) {
        const below = this.getBlockIfLoaded(x, y - 1, z);
        if (below === BlockType.Air) {
          this.setBlock(x, y - 1, z, type);
          this.setFluidLevel(x, y - 1, z, 0); // falling fluid is a new source
          this.queueFluidUpdate(x, y - 1, z, type);
          continue;
        }
        // Flow into water below (water merges with water)
        if (below === type) continue;
      }

      // 2. Flow horizontally (only if not at max distance)
      if (myLevel < maxFlow) {
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = x + dx, nz = z + dz;
          const neighbor = this.getBlockIfLoaded(nx, y, nz);
          if (neighbor === BlockType.Air) {
            // Spread to air
            this.setBlock(nx, y, nz, type);
            this.setFluidLevel(nx, y, nz, myLevel + 1);
            this.queueFluidUpdate(nx, y, nz, type);
          }
        }
      }

      // 3. Remove fluid if it has no support (source above or adjacent source)
      //    This prevents floating fluid blocks. Check if there's a same-type
      //    fluid above OR a source-level fluid adjacent. If not, and this is a
      //    flowing block (level > 0), remove it.
      if (myLevel > 0) {
        const above = this.getBlockIfLoaded(x, y + 1, z);
        let hasSource = false;
        if (above === type) hasSource = true;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          if (this.getBlockIfLoaded(x + dx, y, z + dz) === type) {
            const nLevel = this.getFluidLevel(x + dx, y, z + dz);
            if (nLevel < myLevel) { hasSource = true; break; }
          }
        }
        if (!hasSource) {
          this.setBlock(x, y, z, BlockType.Air);
          this.clearFluidLevel(x, y, z);
        }
      }
    }
    return true;
  }

  // === NETHER GENERATION ===
  private generateNetherChunk(chunk: Chunk) {
    const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx, wz = z0 + lz;
        const n1 = this.noise2D(wx * 0.05, wz * 0.05), n2 = this.noise2DDetail(wx * 0.1, wz * 0.1);
        const floorH = Math.floor(30 + n1 * 15 + n2 * 5), ceilH = Math.floor(100 + n2 * 10);
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (y <= 2 || y >= 125) { chunk.setLocal(lx, y, lz, BlockType.Bedrock); continue; }
          if (y < floorH) chunk.setLocal(lx, y, lz, BlockType.Netherrack);
          else if (y === floorH) chunk.setLocal(lx, y, lz, n2 < -0.3 ? BlockType.SoulSand : BlockType.Netherrack);
          else if (y > ceilH) chunk.setLocal(lx, y, lz, BlockType.Netherrack);
          else if (y < 32 && n1 < -0.3) chunk.setLocal(lx, y, lz, BlockType.Lava);
          else chunk.setLocal(lx, y, lz, BlockType.Air);
        }
        if (Math.abs(n2) < 0.05 && n1 > 0.3) chunk.setLocal(lx, ceilH - 1, lz, BlockType.Glowstone);
      }
    }
    chunk.generated = true; chunk.decorated = true;
    // Nether fortress
    const fn = this.noise2DVillage(chunk.cx * 0.04 + 2000, chunk.cz * 0.04 + 2000);
    if (fn > 0.75) {
      const cx = x0 + 8, cz = z0 + 8;
      let fy = 35;
      for (let y = 40; y >= 3; y--) { if (chunk.getLocal(8, y, 8) !== BlockType.Air && chunk.getLocal(8, y, 8) !== BlockType.Lava) { fy = y + 1; break; } }
      this.buildNetherFortress(cx, fy, cz);
    }
  }

  private buildNetherFortress(cx: number, baseY: number, cz: number) {
    const rng = (() => { let s = (cx * 31 + cz * 17 + this.seed * 7) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const m = BlockType.Netherrack;
    const len = 20 + Math.floor(rng() * 15), dir = Math.floor(rng() * 4);
    let bx = cx, bz = cz;
    for (let s = 0; s < len; s++) {
      for (let dw = -2; dw <= 2; dw++) {
        const tx = dir < 2 ? bx + dw : bx, tz = dir >= 2 ? bz + dw : bz;
        this.setBlock(tx, baseY - 1, tz, m);
        for (let dy = 0; dy < 4; dy++) this.setBlock(tx, baseY + dy, tz, BlockType.Air);
      }
      if (dir === 0) bx++; else if (dir === 1) bx--; else if (dir === 2) bz++; else bz--;
    }
    // Blaze spawner rooms
    for (let r = 0; r < 2 + Math.floor(rng() * 2); r++) {
      const rx = cx + Math.floor((rng() - 0.5) * len), rz = cz + Math.floor((rng() - 0.5) * len), ry = baseY + 1;
      for (let dy = 0; dy < 5; dy++) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) this.setBlock(rx+dx, ry+dy, rz+dz, BlockType.Air);
      for (let dy = -1; dy <= 5; dy++) for (let i = -3; i <= 3; i++) { this.setBlock(rx+i, ry+dy, rz-4, m); this.setBlock(rx+i, ry+dy, rz+4, m); this.setBlock(rx-4, ry+dy, rz+i, m); this.setBlock(rx+4, ry+dy, rz+i, m); }
      this.setBlock(rx, ry, rz, BlockType.Furnace); // Blaze spawner proxy
      this.setBlock(rx-3, ry+4, rz-3, BlockType.Glowstone); this.setBlock(rx+3, ry+4, rz+3, BlockType.Glowstone);
      this.setBlock(rx+3, ry, rz-3, BlockType.GoldOre); this.setBlock(rx-3, ry, rz+3, BlockType.IronOre);
    }
  }

  // === END GENERATION ===
  private generateEndChunk(chunk: Chunk) {
    const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx, wz = z0 + lz;
        const dist = Math.sqrt(wx * wx + wz * wz), n = this.noise2D(wx * 0.02, wz * 0.02);
        if (dist < 50) { for (let y = 45; y <= 50; y++) chunk.setLocal(lx, y, lz, BlockType.EndStone); }
        else if (dist > 100 && n > 0.2) { const iy = 50 + Math.floor(n * 20); for (let y = iy; y < iy + 5; y++) if (y < WORLD_HEIGHT) chunk.setLocal(lx, y, lz, BlockType.EndStone); }
        // Obsidian pillars
        for (let p = 0; p < 10; p++) {
          const pa = (p / 10) * Math.PI * 2, pr = 20 + (p % 3) * 5;
          const px = Math.floor(Math.cos(pa) * pr), pz = Math.floor(Math.sin(pa) * pr);
          if (wx === px && wz === pz) {
            const ph = 10 + (p * 7 % 20);
            for (let y = 50; y < 50 + ph; y++) if (y < WORLD_HEIGHT) chunk.setLocal(lx, y, lz, BlockType.Obsidian);
            if (50 + ph < WORLD_HEIGHT) chunk.setLocal(lx, 50 + ph, lz, BlockType.Glowstone);
          }
        }
        if (wx === 0 && wz === 0) for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (Math.abs(dx)+Math.abs(dz) <= 1) chunk.setLocal(lx, 48+dy, lz, BlockType.Bedrock);
      }
    }
    chunk.generated = true; chunk.decorated = true;
  }

  // === VILLAGE ===
  tryGenerateVillage(chunkX: number, chunkZ: number) {
    const vn = this.noise2DVillage(chunkX * 0.08, chunkZ * 0.08);
    if (vn < 0.85) return;
    const cx = chunkX * CHUNK_SIZE + 8, cz = chunkZ * CHUNK_SIZE + 8;
    let sy = -1;
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) { const b = this.getBlockIfLoaded(cx, y, cz); if (b !== undefined && b !== BlockType.Air && b !== BlockType.Water) { sy = y; break; } }
    if (sy < 5 || this.getBlockIfLoaded(cx, sy, cz) !== BlockType.Grass) return;
    const num = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < num; i++) {
      const a = (i / num) * Math.PI * 2, d = 4 + Math.random() * 6;
      const hx = cx + Math.round(Math.cos(a) * d), hz = cz + Math.round(Math.sin(a) * d);
      let hy = sy; for (let y = WORLD_HEIGHT - 1; y >= 1; y--) { const b = this.getBlockIfLoaded(hx, y, hz); if (b !== undefined && b !== BlockType.Air && b !== BlockType.Water) { hy = y; break; } }
      this.buildVillageHouse(hx, hy + 1, hz);
    }
  }
  private buildVillageHouse(cx: number, baseY: number, cz: number) {
    const minX = cx - 2, maxX = cx + 2, minZ = cz - 2, maxZ = cz + 2;
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) this.setBlock(x, baseY - 1, z, BlockType.Planks);
    for (let y = 0; y < 3; y++) { for (let x = minX; x <= maxX; x++) { if (x === cx && y < 2) continue; this.setBlock(x, baseY+y, minZ, BlockType.Cobblestone); this.setBlock(x, baseY+y, maxZ, BlockType.Cobblestone); } for (let z = minZ; z <= maxZ; z++) { this.setBlock(minX, baseY+y, z, BlockType.Cobblestone); this.setBlock(maxX, baseY+y, z, BlockType.Cobblestone); } }
    this.setBlock(cx, baseY, maxZ, BlockType.WoodenDoor); this.setBlock(cx, baseY+1, maxZ, BlockType.WoodenDoor);
    for (let x = minX-1; x <= maxX+1; x++) for (let z = minZ-1; z <= maxZ+1; z++) this.setBlock(x, baseY+3, z, BlockType.Wood);
    this.setBlock(cx, baseY, cz-1, BlockType.Furnace); this.setBlock(cx+1, baseY, cz-1, BlockType.CraftingTable);
    this.setBlock(cx-1, baseY-2, cz-1, BlockType.IronOre); this.setBlock(cx+1, baseY-2, cz-1, BlockType.CoalOre);
    this.setBlock(minX+1, baseY+2, minZ+1, BlockType.Torch); this.setBlock(maxX-1, baseY+2, maxZ-1, BlockType.Torch);
  }

  // === STRONGHOLD ===
  strongholdPositions: Array<{ x: number; z: number }> | null = null;
  computeStrongholdPositionsPublic() {
    if (this.strongholdPositions) return;
    const pos: Array<{ x: number; z: number }> = [];
    const a0 = (this.seed % 360) * Math.PI / 180;
    for (let i = 0; i < 3; i++) { const a = a0 + (i * 120 * Math.PI / 180); const r = 640 + (this.seed * (i+1) % 512); pos.push({ x: Math.floor(Math.cos(a) * r), z: Math.floor(Math.sin(a) * r) }); }
    this.strongholdPositions = pos;
  }
  tryGenerateStronghold(chunkX: number, chunkZ: number) {
    this.computeStrongholdPositionsPublic();
    if (!this.strongholdPositions) return;
    const cx = chunkX * CHUNK_SIZE + 8, cz = chunkZ * CHUNK_SIZE + 8;
    for (const p of this.strongholdPositions) { if (Math.abs(cx - p.x) <= 8 && Math.abs(cz - p.z) <= 8) { this.buildStronghold(p.x, 20, p.z); return; } }
  }
  private buildStronghold(cx: number, baseY: number, cz: number) {
    const rng = (() => { let s = (cx * 7919 + cz * 6271 + this.seed) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    // Maze corridors
    for (let c = 0; c < 5; c++) {
      const dir = Math.floor(rng() * 4), len = 10 + Math.floor(rng() * 15), h = baseY + Math.floor(rng() * 4);
      let x = cx, z = cz;
      for (let s = 0; s < len; s++) {
        for (let dy = 0; dy < 3; dy++) for (let dw = -1; dw <= 1; dw++) { const tx = dir < 2 ? x + dw : x, tz = dir >= 2 ? z + dw : z; this.setBlock(tx, h+dy, tz, BlockType.Air); }
        if (dir === 0) x++; else if (dir === 1) x--; else if (dir === 2) z++; else z--;
      }
    }
    // Portal room
    const pY = 12, pminX = cx - 4, pmaxX = cx + 4, pminZ = cz - 4, pmaxZ = cz + 4;
    for (let y = 0; y < 5; y++) for (let x = pminX; x <= pmaxX; x++) for (let z = pminZ; z <= pmaxZ; z++) this.setBlock(x, pY+y, z, BlockType.Air);
    for (let y = -1; y <= 5; y++) { for (let x = pminX-1; x <= pmaxX+1; x++) { this.setBlock(x, pY+y, pminZ-1, BlockType.StoneBricks); this.setBlock(x, pY+y, pmaxZ+1, BlockType.StoneBricks); } for (let z = pminZ-1; z <= pmaxZ+1; z++) { this.setBlock(pminX-1, pY+y, z, BlockType.StoneBricks); this.setBlock(pmaxX+1, pY+y, z, BlockType.StoneBricks); } }
    for (let x = pminX-1; x <= pmaxX+1; x++) for (let z = pminZ-1; z <= pmaxZ+1; z++) { this.setBlock(x, pY-1, z, BlockType.StoneBricks); this.setBlock(x, pY+5, z, BlockType.StoneBricks); }
    // Silverfish spawner + End Portal frame
    this.setBlock(cx, pY, cz - 3, BlockType.Furnace);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (dx === 0 && dz === 0) this.setBlock(cx, pY, cz, BlockType.Air); else this.setBlock(cx+dx, pY, cz+dz, BlockType.EndPortalFrame); }
    this.setBlock(pminX+1, pY+3, pminZ+1, BlockType.Torch); this.setBlock(pmaxX-1, pY+3, pmaxZ-1, BlockType.Torch);
    // Stairs to surface
    for (let y = 0; y < 15; y++) { this.setBlock(cx, pY+y, pmaxZ+2, BlockType.Air); this.setBlock(cx, pY+y, pmaxZ+3, BlockType.Air); this.setBlock(cx-1, pY+y, pmaxZ+2, BlockType.StoneBricks); this.setBlock(cx+1, pY+y, pmaxZ+2, BlockType.StoneBricks); }
    // Loot
    this.setBlock(pminX+1, pY, pminZ+1, BlockType.DiamondOre); this.setBlock(pmaxX-1, pY, pmaxZ-1, BlockType.IronOre);
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
