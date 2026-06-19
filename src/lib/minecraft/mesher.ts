// Chunk mesh builder: generates optimized geometry by only creating visible faces
// Uses a texture atlas so each chunk = 1 opaque mesh + 1 transparent mesh
import * as THREE from "three";
import { World, WORLD_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, BLOCKS, isAir, isTransparent } from "./blocks";

export const CHUNK_SIZE = 16;
export const CHUNKS_X = Math.ceil(WORLD_SIZE / CHUNK_SIZE);
export const CHUNKS_Z = Math.ceil(WORLD_SIZE / CHUNK_SIZE);

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

function shouldDrawFace(block: BlockType, neighbor: BlockType): boolean {
  if (isAir(block)) return false;
  if (isAir(neighbor)) return true;
  if (isTransparent(neighbor)) {
    if (neighbor === block) return false;
    return true;
  }
  return false;
}

// Texture atlas
const ATLAS_TILE = 16;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;
const ATLAS_W = ATLAS_TILE * ATLAS_COLS;
const ATLAS_H = ATLAS_TILE * ATLAS_ROWS;

let atlasCache: {
  texture: THREE.Texture;
  map: Record<string, { u0: number; v0: number; u1: number; v1: number }>;
} | null = null;
let atlasTexRef: Record<string, THREE.Texture> | null = null;

function getAtlas(textures: Record<string, THREE.Texture>) {
  if (atlasCache && atlasTexRef === textures) return atlasCache;

  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  const map: Record<string, { u0: number; v0: number; u1: number; v1: number }> = {};
  let i = 0;
  const names = Object.keys(textures);
  for (const name of names) {
    const tex = textures[name];
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const x = col * ATLAS_TILE;
    const y = row * ATLAS_TILE;
    const srcCanvas = (tex as THREE.CanvasTexture).image as HTMLCanvasElement;
    if (srcCanvas) ctx.drawImage(srcCanvas, x, y, ATLAS_TILE, ATLAS_TILE);
    // UV coords (with small inset to avoid bleeding)
    const inset = 0.5 / ATLAS_W;
    map[name] = {
      u0: (x + inset) / ATLAS_W,
      v0: 1 - (y + ATLAS_TILE - inset) / ATLAS_H,
      u1: (x + ATLAS_TILE - inset) / ATLAS_W,
      v1: 1 - (y + inset) / ATLAS_H,
    };
    i++;
    if (i >= ATLAS_COLS * ATLAS_ROWS) break;
  }

  const atlasTex = new THREE.CanvasTexture(canvas);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.wrapS = THREE.ClampToEdgeWrapping;
  atlasTex.wrapT = THREE.ClampToEdgeWrapping;
  atlasTex.needsUpdate = true;

  atlasCache = { texture: atlasTex, map };
  atlasTexRef = textures;
  return atlasCache;
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

// Build geometry for a single chunk using atlas UVs
export function buildChunkGeometry(
  world: World,
  cx: number,
  cz: number,
  textures: Record<string, THREE.Texture>
): { opaque: THREE.Mesh | null; transparent: THREE.Mesh | null } {
  const atlas = getAtlas(textures);
  const opaque = newFaceData();
  const trans = newFaceData();

  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      if (wx >= WORLD_SIZE || wz >= WORLD_SIZE) continue;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const block = world.getBlock(wx, y, wz);
        if (isAir(block)) continue;

        const isWaterBlock = block === BlockType.Water;
        const isTransp = isTransparent(block);
        const target = isTransp ? trans : opaque;

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
          const tile = atlas.map[texName];
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

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      side: THREE.FrontSide,
    });
    opaqueMesh = new THREE.Mesh(geo, mat);
    opaqueMesh.frustumCulled = true;
  }

  if (trans.positions.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(trans.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(trans.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(trans.uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(trans.colors, 3));
    geo.setIndex(trans.indices);

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    transparentMesh = new THREE.Mesh(geo, mat);
    transparentMesh.frustumCulled = true;
  }

  return { opaque: opaqueMesh, transparent: transparentMesh };
}

// Rebuild a single chunk after a block edit. Returns the new meshes.
export function rebuildChunk(
  world: World,
  cx: number,
  cz: number,
  textures: Record<string, THREE.Texture>
): { opaque: THREE.Mesh | null; transparent: THREE.Mesh | null } {
  return buildChunkGeometry(world, cx, cz, textures);
}

// Get a texture atlas material (for sharing)
export function getAtlasMaterial(textures: Record<string, THREE.Texture>, transparent: boolean): THREE.Material {
  const atlas = getAtlas(textures);
  if (transparent) {
    return new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: atlas.texture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: atlas.texture,
    side: THREE.FrontSide,
  });
}
