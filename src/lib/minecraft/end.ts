// End dimension: floating islands of End Stone in the void, with an Ender Dragon boss.
import { createNoise2D } from "simplex-noise";
import { BlockType } from "./blocks";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./world";

function alea(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class EndChunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  generated: boolean = false;

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

export class EndWorld {
  chunks: Map<string, EndChunk> = new Map();
  noise2D: ReturnType<typeof createNoise2D>;
  noise2DIsland: ReturnType<typeof createNoise2D>;
  seed: number;
  // Central island has the dragon
  dragonDefeated: boolean = false;

  constructor(seed = 999) {
    this.seed = seed;
    this.noise2D = createNoise2D(alea(seed));
    this.noise2DIsland = createNoise2D(alea(seed + 111));
  }

  key(cx: number, cz: number): string { return `${cx},${cz}`; }

  getChunk(cx: number, cz: number): EndChunk | undefined { return this.chunks.get(this.key(cx, cz)); }

  getOrCreateChunk(cx: number, cz: number): EndChunk {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new EndChunk(cx, cz);
      this.chunks.set(k, c);
      this.generateChunk(c);
    }
    return c;
  }

  getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BlockType.Air;
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

  // The End is mostly void with floating End Stone islands.
  // The central island (around 0,0) is large and flat.
  // Outer islands are smaller and scattered.
  generateChunk(chunk: EndChunk) {
    if (chunk.generated) return;
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const distFromCenter = Math.sqrt(wx * wx + wz * wz);

        // Central island: large flat disc at Y=40-45
        if (distFromCenter < 40) {
          const heightVar = this.noise2D(wx * 0.1, wz * 0.1) * 2;
          const baseY = 42 + Math.floor(heightVar);
          for (let y = baseY; y < baseY + 5; y++) {
            chunk.setLocal(lx, y, lz, BlockType.EndStone);
          }
        } else {
          // Outer islands: scattered, smaller
          const islandNoise = this.noise2DIsland(wx * 0.02, wz * 0.02);
          if (islandNoise > 0.3) {
            const islandY = 35 + Math.floor(this.noise2D(wx * 0.05, wz * 0.05) * 10);
            const islandSize = Math.floor((islandNoise - 0.3) * 20);
            for (let y = islandY; y < islandY + islandSize; y++) {
              if (y >= 0 && y < WORLD_HEIGHT) {
                chunk.setLocal(lx, y, lz, BlockType.EndStone);
              }
            }
          }
        }
      }
    }

    chunk.generated = true;
  }

  getSpawnPoint(): { x: number; y: number; z: number } {
    this.getOrCreateChunk(0, 0);
    return { x: 0.5, y: 50, z: 0.5 };
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
