// Chunk mesh builder: generates optimized geometry with visible-face culling.
// Three render layers: opaque (solid blocks), cutout (leaves, glass), translucent (water).
// CRITICAL: All face windings are CCW when viewed from OUTSIDE, so they're front-facing.
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, BLOCKS, isAir, isOpaque, getRenderLayer } from "./blocks";
import { TextureAtlas } from "./atlas";

// Each face: dir (toward neighbor), 4 corners in CCW order from outside, UV per corner, normal.
// Triangles are: (0,1,2) and (0,2,3) - this gives CCW front face from outside.
const FACES = [
  { // +X (right face, viewed from +X looking toward -X)
    // Outside view: Y up, Z to the LEFT
    // CCW from outside: bottom-left, bottom-right, top-right, top-left
    dir: [1, 0, 0] as [number, number, number],
    corners: [
      [1, 0, 1], // bottom-left (z=1 is left in view)
      [1, 0, 0], // bottom-right (z=0 is right in view)
      [1, 1, 0], // top-right
      [1, 1, 1], // top-left
    ] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
    normal: [1, 0, 0] as [number, number, number],
    faceIndex: 0,
  },
  { // -X (left face, viewed from -X looking toward +X)
    // Outside view: Y up, Z to the RIGHT
    dir: [-1, 0, 0] as [number, number, number],
    corners: [
      [0, 0, 0], // bottom-left (z=0 is left in view)
      [0, 0, 1], // bottom-right (z=1 is right in view)
      [0, 1, 1], // top-right
      [0, 1, 0], // top-left
    ] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
    normal: [-1, 0, 0] as [number, number, number],
    faceIndex: 1,
  },
  { // +Y (top face, viewed from above looking down)
    // Outside view: X right, Z "down" in screen (toward viewer)
    dir: [0, 1, 0] as [number, number, number],
    corners: [
      [0, 1, 1], // bottom-left (x=0 left, z=1 bottom of view)
      [1, 1, 1], // bottom-right
      [1, 1, 0], // top-right
      [0, 1, 0], // top-left
    ] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
    normal: [0, 1, 0] as [number, number, number],
    faceIndex: 2,
  },
  { // -Y (bottom face, viewed from below looking up)
    // Outside view: X right, Z up in screen
    dir: [0, -1, 0] as [number, number, number],
    corners: [
      [0, 0, 0], // bottom-left
      [1, 0, 0], // bottom-right
      [1, 0, 1], // top-right
      [0, 0, 1], // top-left
    ] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
    normal: [0, -1, 0] as [number, number, number],
    faceIndex: 3,
  },
  { // +Z (front face, viewed from +Z looking toward -Z)
    // Outside view: Y up, X to the LEFT
    dir: [0, 0, 1] as [number, number, number],
    corners: [
      [0, 0, 1], // bottom-left (x=0 left)
      [1, 0, 1], // bottom-right (x=1 right)
      [1, 1, 1], // top-right
      [0, 1, 1], // top-left
    ] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
    normal: [0, 0, 1] as [number, number, number],
    faceIndex: 4,
  },
  { // -Z (back face, viewed from -Z looking toward +Z)
    // Outside view: Y up, X to the RIGHT
    dir: [0, 0, -1] as [number, number, number],
    corners: [
      [1, 0, 0], // bottom-left (x=1 left in view)
      [0, 0, 0], // bottom-right (x=0 right in view)
      [0, 1, 0], // top-right
      [1, 1, 0], // top-left
    ] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
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

// Strict visibility rule: draw a face iff the neighbor doesn't fully occlude it.
function shouldDrawFace(block: BlockType, neighbor: BlockType): boolean {
  if (isAir(block)) return false;
  if (isAir(neighbor)) return true;
  if (isOpaque(neighbor)) return false;
  // Neighbor is see-through (cutout or translucent)
  if (neighbor === block) {
    if (block === BlockType.Water) return false;
    if (block === BlockType.Glass) return false; // don't draw glass-glass faces
    if (block === BlockType.Leaves) return true;
    return false;
  }
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
  opaque: THREE.Mesh | null;
  cutout: THREE.Mesh | null;
  transparent: THREE.Mesh | null; // water (alpha-blended, depthWrite off)
  glass: THREE.Mesh | null; // glass (alpha-blended, depthWrite ON)
}

export function buildChunkGeometry(
  world: World,
  cx: number,
  cz: number,
  atlas: TextureAtlas,
  opaqueMaterial: THREE.Material,
  cutoutMaterial: THREE.Material,
  transparentMaterial: THREE.Material,
  glassMaterial: THREE.Material
): ChunkMeshes {
  const chunk = world.getChunk(cx, cz);
  if (!chunk) return { opaque: null, cutout: null, transparent: null, glass: null };

  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    world.getOrCreateChunk(cx + dx, cz + dz);
  }

  const opaque = newFaceData();
  const cutout = newFaceData();
  const transparent = newFaceData();
  const glass = newFaceData();

  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const block = chunk.getLocal(lx, y, lz);
        if (isAir(block)) continue;

        // Torch: render as small cross (like Minecraft) instead of full cube
        if (block === BlockType.Torch) {
          const tile = atlas.tiles["torch"];
          if (tile) {
            const target = cutout;
            // Small torch: 2 crossed planes at center of block
            // Plane 1 (X-aligned)
            const cx = wx + 0.5, cy = y + 0.2, cz = wz + 0.5;
            const w = 0.15, h = 0.5;
            // Front face (+Z side)
            const si = target.positions.length / 3;
            target.positions.push(cx - w, cy, cz, cx + w, cy, cz, cx + w, cy + h, cz, cx - w, cy + h, cz);
            target.normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
            target.uvs.push(tile.u0, tile.v0, tile.u1, tile.v0, tile.u1, tile.v1, tile.u0, tile.v1);
            target.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
            target.indices.push(si, si + 1, si + 2, si, si + 2, si + 3);
            // Back face (-Z side)
            const si2 = target.positions.length / 3;
            target.positions.push(cx - w, cy, cz, cx + w, cy, cz, cx + w, cy + h, cz, cx - w, cy + h, cz);
            target.normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1);
            target.uvs.push(tile.u1, tile.v0, tile.u0, tile.v0, tile.u0, tile.v1, tile.u1, tile.v1);
            target.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
            target.indices.push(si2, si2 + 1, si2 + 2, si2, si2 + 2, si2 + 3);
            // Side faces (X-aligned cross)
            const si3 = target.positions.length / 3;
            target.positions.push(cx, cy, cz - w, cx, cy, cz + w, cx, cy + h, cz + w, cx, cy + h, cz - w);
            target.normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0);
            target.uvs.push(tile.u0, tile.v0, tile.u1, tile.v0, tile.u1, tile.v1, tile.u0, tile.v1);
            target.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
            target.indices.push(si3, si3 + 1, si3 + 2, si3, si3 + 2, si3 + 3);
            const si4 = target.positions.length / 3;
            target.positions.push(cx, cy, cz - w, cx, cy, cz + w, cx, cy + h, cz + w, cx, cy + h, cz - w);
            target.normals.push(-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0);
            target.uvs.push(tile.u1, tile.v0, tile.u0, tile.v0, tile.u0, tile.v1, tile.u1, tile.v1);
            target.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
            target.indices.push(si4, si4 + 1, si4 + 2, si4, si4 + 2, si4 + 3);
          }
          continue; // skip normal block rendering for torches
        }

        // Choose target buffer
        let target: FaceData;
        if (block === BlockType.Water) target = transparent;
        else if (block === BlockType.Glass) target = glass;
        else if (getRenderLayer(block) === "cutout") target = cutout;
        else target = opaque;

        const isWaterBlock = block === BlockType.Water;

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
          else if (fi === 3) shade = 0.55;
          else if (fi === 0 || fi === 1) shade = 0.72;
          else shade = 0.88;

          const yOffset = isWaterBlock && fi === 2 ? -0.12 : 0;

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

  return {
    opaque: buildMesh(opaque, opaqueMaterial),
    cutout: buildMesh(cutout, cutoutMaterial),
    transparent: buildMesh(transparent, transparentMaterial),
    glass: buildMesh(glass, glassMaterial),
  };
}

function buildMesh(data: FaceData, material: THREE.Material): THREE.Mesh | null {
  if (data.positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
  geo.setIndex(data.indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = true;
  return mesh;
}
