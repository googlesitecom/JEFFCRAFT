// World generation and voxel storage
import { createNoise2D, createNoise3D } from "simplex-noise";
import { BlockType } from "./blocks";

export const WORLD_SIZE = 96; // X and Z dimensions
export const WORLD_HEIGHT = 48; // Y dimension
export const WATER_LEVEL = 12;
export const SEA_FLOOR = 4;

// Seeded RNG for noise initialization
function alea(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class World {
  // Flat array: index = x + z * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE
  blocks: Uint8Array;
  noise2D: ReturnType<typeof createNoise2D>;
  noise2DDetail: ReturnType<typeof createNoise2D>;
  noise3D: ReturnType<typeof createNoise3D>;
  treeRng: () => number;
  seed: number;

  constructor(seed = 1337) {
    this.seed = seed;
    this.blocks = new Uint8Array(WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT);
    this.noise2D = createNoise2D(alea(seed));
    this.noise2DDetail = createNoise2D(alea(seed + 999));
    this.noise3D = createNoise3D(alea(seed + 555));
    this.treeRng = alea(seed + 777);
    this.generate();
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && x < WORLD_SIZE &&
      y >= 0 && y < WORLD_HEIGHT &&
      z >= 0 && z < WORLD_SIZE
    );
  }

  index(x: number, y: number, z: number): number {
    return x + z * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE;
  }

  getBlock(x: number, y: number, z: number): BlockType {
    if (!this.inBounds(x, y, z)) {
      // Out of bounds: treat as air above, stone below ground level
      if (y < 0) return BlockType.Bedrock;
      return BlockType.Air;
    }
    return this.blocks[this.index(x, y, z)] as BlockType;
  }

  setBlock(x: number, y: number, z: number, type: BlockType) {
    if (!this.inBounds(x, y, z)) return;
    this.blocks[this.index(x, y, z)] = type;
  }

  // Heightmap-based terrain generation
  getHeightAt(x: number, z: number): number {
    // Multiple octaves of noise
    const scale1 = 0.018;
    const scale2 = 0.05;
    const scale3 = 0.1;

    const base = this.noise2D(x * scale1, z * scale1) * 14;
    const detail = this.noise2DDetail(x * scale2, z * scale2) * 5;
    const fine = this.noise2D(x * scale3, z * scale3) * 1.5;

    return Math.floor(SEA_FLOOR + 14 + base + detail + fine);
  }

  generate() {
    // 1. Terrain heightmap
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const h = this.getHeightAt(x, z);

        for (let y = 0; y <= h && y < WORLD_HEIGHT; y++) {
          let block: BlockType;
          if (y === 0) {
            block = BlockType.Bedrock;
          } else if (y < h - 3) {
            block = BlockType.Stone;
            // Ore generation in stone
            const oreNoise = this.noise3D(x * 0.1, y * 0.1, z * 0.1);
            if (y < 8 && oreNoise > 0.85) block = BlockType.Diamond;
            else if (y < 16 && oreNoise > 0.8) block = BlockType.Gold;
            else if (oreNoise > 0.78) block = BlockType.Iron;
            else if (oreNoise > 0.7) block = BlockType.Coal;
          } else if (y < h) {
            block = BlockType.Dirt;
          } else {
            // Top block
            if (h <= WATER_LEVEL + 1) {
              block = BlockType.Sand; // beaches
            } else if (h >= 26) {
              block = BlockType.Snow; // mountain tops
            } else {
              block = BlockType.Grass;
            }
          }
          this.setBlock(x, y, z, block);
        }

        // Water fill
        if (h < WATER_LEVEL) {
          for (let y = h + 1; y <= WATER_LEVEL; y++) {
            this.setBlock(x, y, z, BlockType.Water);
          }
        }
      }
    }

    // 2. Trees on grass
    for (let x = 4; x < WORLD_SIZE - 4; x++) {
      for (let z = 4; z < WORLD_SIZE - 4; z++) {
        // Find top solid block
        let topY = -1;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const b = this.getBlock(x, y, z);
          if (b !== BlockType.Air && b !== BlockType.Water) {
            topY = y;
            break;
          }
        }
        if (topY < 0) continue;
        if (this.getBlock(x, topY, z) !== BlockType.Grass) continue;
        if (topY < WATER_LEVEL) continue;

        // Tree density
        if (this.treeRng() < 0.018) {
          this.plantTree(x, topY + 1, z);
        }
      }
    }

    // 3. Caves via 3D noise
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        for (let y = 2; y < 22; y++) {
          const b = this.getBlock(x, y, z);
          if (b === BlockType.Stone || b === BlockType.Dirt) {
            const cave = this.noise3D(x * 0.08, y * 0.12, z * 0.08);
            if (cave > 0.65) {
              this.setBlock(x, y, z, BlockType.Air);
            }
          }
        }
      }
    }
  }

  plantTree(x: number, y: number, z: number) {
    const h = 4 + Math.floor(this.treeRng() * 3); // tree height 4-6
    // Trunk
    for (let i = 0; i < h; i++) {
      if (y + i < WORLD_HEIGHT) {
        this.setBlock(x, y + i, z, BlockType.Wood);
      }
    }
    // Leaves - two layers wider at bottom, narrower at top
    const topY = y + h - 1;
    // Wide bottom layer
    for (let dy = -2; dy <= 0; dy++) {
      const r = 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && this.treeRng() < 0.5) continue;
          const lx = x + dx;
          const ly = topY + dy;
          const lz = z + dz;
          if (!this.inBounds(lx, ly, lz)) continue;
          if (this.getBlock(lx, ly, lz) === BlockType.Air) {
            this.setBlock(lx, ly, lz, BlockType.Leaves);
          }
        }
      }
    }
    // Top narrower layer
    for (let dy = 1; dy <= 2; dy++) {
      const r = dy === 1 ? 1 : 0;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const lx = x + dx;
          const ly = topY + dy;
          const lz = z + dz;
          if (!this.inBounds(lx, ly, lz)) continue;
          if (this.getBlock(lx, ly, lz) === BlockType.Air) {
            this.setBlock(lx, ly, lz, BlockType.Leaves);
          }
        }
      }
    }
  }

  // Find a safe spawn point (top of terrain near center)
  getSpawnPoint(): { x: number; y: number; z: number } {
    const cx = Math.floor(WORLD_SIZE / 2);
    const cz = Math.floor(WORLD_SIZE / 2);
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      const b = this.getBlock(cx, y, cz);
      if (b !== BlockType.Air && b !== BlockType.Water) {
        return { x: cx + 0.5, y: y + 2.2, z: cz + 0.5 };
      }
    }
    return { x: cx + 0.5, y: 30, z: cz + 0.5 };
  }
}
