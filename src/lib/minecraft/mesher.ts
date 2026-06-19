// Chunk mesh builder: generates optimized geometry by only creating visible faces
// Uses a shared texture atlas with stable, deterministic tile order.
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, BLOCKS, isAir, isTransparent } from "./blocks";
import { TextureAtlas } from "./atlas";

const FACES = [
  {
    dir: [1, 0, 0] as [number, number, number],
    corners: [
      [1, 1, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1],
    ] as [number, number, number][],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] as [number, number][],
    normal: [1, 0, 0] as [number, number, number],
    faceIndex: 0,
  },
  {
    dir: [-1, 0, 0] as [number, number, number],
    corners: [
      [0, 1, 1], [0, 0, 1], [0, 0, 0], [0, 1, 0],
    ] as [number, number, number][],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] as [number, number][],
    normal: [-1, 0, 0] as [number, number, number],
    faceIndex: 1,
  },
  {
    dir: [0, 1, 0] as [number, number, number],
    corners: [
      [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0],
    ] as [number, number, number][],
    uv: [[0, 1], [1, 1], [1, 0], [0, 0]] as [number, number][],
    normal: [0, 1, 0] as [number, number, number],
    faceIndex: 2,
  },
  {
    dir: [0, -1, 0] as [number, number, number],
    corners: [
      [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
    ] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
    normal: [0, -1, 0] as [number, number, number],
    faceIndex: 3,
  },
  {
    dir: [0, 0, 1] as [number, number, number],
    corners: [
      [1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1],
    ] as [number, number, number][],
    uv: [[1, 1], [0, 1], [0, 0], [1, 0]] as [number, number][],
    normal: [0, 0, 1] as [number, number, number],
    faceIndex: 4,
  },
  {
    dir: [0, 0, -1] as [number, number, number],
    corners: [
      [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0],
    ] as [number, number, number][],
    uv: [[0, 1], [1, 1], [1, 0], [0, 0]] as [number, number][],
    normal: [0, 0, -1] as [number, number, number],
    faceIndex: 5,
  },
];

function getTextureName(block: BlockType, faceIndex: number): string {
  const def = BLOCKS[block];
  if (faceIndex === 2) return def.textures.top;
  if (faceIndex === 3) return def.textures.bottom;
  return def.textures.side;
}

// Whether a block renders as a "cutout" (transparent texture but solid pixels, e.g. glass)
// vs "translucent" (alpha-blended, e.g. water). Cutout goes into opaque pass.
function isCutout(block: BlockType): boolean {
  return block === BlockType.Glass;
}

// Whether a block uses alpha blending
function isTranslucent(block: BlockType): boolean {
  return block === BlockType.Water;
}

function shouldDrawFace(block: BlockType, neighbor: BlockType): boolean {
  if (isAir(block)) return false;
  if (isAir(neighbor)) return true;
  // Opaque neighbor hides the face
  if (!isTransparent(neighbor)) return false;
  // Transparent neighbor:
  // - Water next to water: hide face (avoid internal water planes)
  // - Glass next to glass: hide face (looks cleaner)
  // - Leaves next to leaves: keep face (otherwise trees look hollow)
  if (neighbor === block) {
    if (block === BlockType.Water) return false;
    if (block === BlockType.Glass) return false;
    if (block === BlockType.Leaves) return true; // draw, so leaves look solid
    return false;
  }
  // Different transparent types: draw face
  return true;
}

interface FaceData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function newFaceData(): FaceData {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

export interface ChunkMeshes {
  opaque: THREE.Mesh | null; // solid blocks + leaves + glass (cutout, depthWrite on)
  transparent: THREE.Mesh | null; // water only (alpha-blended, depthWrite off)
}

// Build geometry for a single chunk using shared atlas UVs.
export function buildChunkGeometry(
  world: World,
  cx: number,
  cz: number,
  atlas: TextureAtlas,
  opaqueMaterial: THREE.Material,
  transparentMaterial: THREE.Material
): ChunkMeshes {
  const chunk = world.getChunk(cx, cz);
  if (!chunk) return { opaque: null, transparent: null };

  // Ensure neighbors are generated so we can cull border faces correctly
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    world.getOrCreateChunk(cx + dx, cz + dz);
  }

  const opaque = newFaceData(); // includes leaves and glass (drawn with depthWrite on, alphaTest)
  const trans = newFaceData(); // water only

  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const block = chunk.getLocal(lx, y, lz);
        if (isAir(block)) continue;

        const isWaterBlock = block === BlockType.Water;
        const target = isWaterBlock ? trans : opaque;

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];
          const neighbor = world.getBlock(nx, ny, nz);

          if (!shouldDrawFace(block, neighbor)) continue;

          if (isWaterBlock) {
            if (fi === 2) {
              if (neighbor !== BlockType.Air) continue;
            } else if (fi === 3) {
              if (isAir(neighbor) || neighbor === BlockType.Water) continue;
            } else {
              if (neighbor === BlockType.Water) continue;
            }
          }

          const texName = getTextureName(block, fi);
          const tile = atlas.tiles[texName];
          if (!tile) continue;

          let shade = 1.0;
          if (fi === 2) shade = 1.0;
          else if (fi === 3) shade = 0.5;
          else if (fi === 0 || fi === 1) shade = 0.72;
          else shade = 0.86;

          const yOffset = isWaterBlock && fi === 2 ? -0.15 : 0;

          const startIndex = target.positions.length / 3;
          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            const py = y + corner[1] + (corner[1] === 1 ? yOffset : 0);
            target.positions.push(wx + corner[0], py, wz + corner[2]);
            target.normals.push(face.normal[0], face.normal[1], face.normal[2]);
            const uv = face.uv[c];
            const u = tile.u0 + (tile.u1 - tile.u0) * uv[0];
            const v = tile.v0 + (tile.v1 - tile.v0) * uv[1];
            target.uvs.push(u, v);
            target.colors.push(shade, shade, shade);
          }

          target.indices.push(startIndex, startIndex + 1, startIndex + 2);
          target.indices.push(startIndex, startIndex + 2, startIndex + 3);
        }
      }
    }
  }

  let opaqueMesh: THREE.Mesh | null = null;
  let transparentMesh: THREE.Mesh | null = null;

  if (opaque.positions.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(opaque.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(opaque.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(opaque.uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(opaque.colors, 3));
    geo.setIndex(opaque.indices);
    opaqueMesh = new THREE.Mesh(geo, opaqueMaterial);
    opaqueMesh.frustumCulled = true;
  }

  if (trans.positions.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(trans.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(trans.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(trans.uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(trans.colors, 3));
    geo.setIndex(trans.indices);
    transparentMesh = new THREE.Mesh(geo, transparentMaterial);
    transparentMesh.frustumCulled = true;
  }

  return { opaque: opaqueMesh, transparent: transparentMesh };
}
