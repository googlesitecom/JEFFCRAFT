// Chunk mesh builder: generates optimized geometry with visible-face culling.
// Three render layers: opaque (solid blocks), cutout (leaves, glass), translucent (water).
import * as THREE from "three";
import { World, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import { BlockType, BLOCKS, isAir, isOpaque, isCutout, isTranslucent, getRenderLayer } from "./blocks";
import { TextureAtlas } from "./atlas";

// Face definitions: dir (toward neighbor), corners (CCW from outside), uv per corner, normal
const FACES = [
  { // +X (right)
    dir: [1, 0, 0] as [number, number, number],
    corners: [[1, 1, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1]] as [number, number, number][],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] as [number, number][],
    normal: [1, 0, 0] as [number, number, number],
    faceIndex: 0,
  },
  { // -X (left)
    dir: [-1, 0, 0] as [number, number, number],
    corners: [[0, 1, 1], [0, 0, 1], [0, 0, 0], [0, 1, 0]] as [number, number, number][],
    uv: [[0, 1], [0, 0], [1, 0], [1, 1]] as [number, number][],
    normal: [-1, 0, 0] as [number, number, number],
    faceIndex: 1,
  },
  { // +Y (top)
    dir: [0, 1, 0] as [number, number, number],
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] as [number, number, number][],
    uv: [[0, 1], [1, 1], [1, 0], [0, 0]] as [number, number][],
    normal: [0, 1, 0] as [number, number, number],
    faceIndex: 2,
  },
  { // -Y (bottom)
    dir: [0, -1, 0] as [number, number, number],
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] as [number, number, number][],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][],
    normal: [0, -1, 0] as [number, number, number],
    faceIndex: 3,
  },
  { // +Z (front)
    dir: [0, 0, 1] as [number, number, number],
    corners: [[1, 1, 1], [0, 1, 1], [0, 0, 1], [1, 0, 1]] as [number, number, number][],
    uv: [[1, 1], [0, 1], [0, 0], [1, 0]] as [number, number][],
    normal: [0, 0, 1] as [number, number, number],
    faceIndex: 4,
  },
  { // -Z (back)
    dir: [0, 0, -1] as [number, number, number],
    corners: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] as [number, number, number][],
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

// Strict visibility rule: draw a face iff the neighbor doesn't fully occlude it.
// - Air neighbor: draw
// - Opaque neighbor (stone, dirt...): don't draw (face is hidden)
// - Cutout/Translucent neighbor: draw, with one exception:
//   - Same block type AND both water/glass: don't draw (avoid internal planes)
function shouldDrawFace(block: BlockType, neighbor: BlockType): boolean {
  if (isAir(block)) return false;
  if (isAir(neighbor)) return true;
  if (isOpaque(neighbor)) return false;
  // Neighbor is see-through (cutout or translucent)
  // For water and glass: don't draw faces between same-type blocks
  if (neighbor === block) {
    if (block === BlockType.Water) return false;
    if (block === BlockType.Glass) return false;
    // Leaves: draw faces so trees look solid
    if (block === BlockType.Leaves) return true;
    return false;
  }
  // Different see-through types: draw the face
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
  transparent: THREE.Mesh | null;
}

export function buildChunkGeometry(
  world: World,
  cx: number,
  cz: number,
  atlas: TextureAtlas,
  opaqueMaterial: THREE.Material,
  cutoutMaterial: THREE.Material,
  transparentMaterial: THREE.Material
): ChunkMeshes {
  const chunk = world.getChunk(cx, cz);
  if (!chunk) return { opaque: null, cutout: null, transparent: null };

  // Ensure neighbors are generated for correct border culling
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    world.getOrCreateChunk(cx + dx, cz + dz);
  }

  const opaque = newFaceData();
  const cutout = newFaceData();
  const transparent = newFaceData();

  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = x0 + lx;
      const wz = z0 + lz;
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const block = chunk.getLocal(lx, y, lz);
        if (isAir(block)) continue;

        // Choose target buffer based on render layer
        let target: FaceData;
        const layer = getRenderLayer(block);
        if (layer === "translucent") target = transparent;
        else if (layer === "cutout") target = cutout;
        else target = opaque;

        const isWaterBlock = block === BlockType.Water;

        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];
          const neighbor = world.getBlock(nx, ny, nz);

          if (!shouldDrawFace(block, neighbor)) continue;

          // Water-specific extra culling
          if (isWaterBlock) {
            if (fi === 2) {
              // Top face: only draw if air above
              if (neighbor !== BlockType.Air) continue;
            } else if (fi === 3) {
              // Bottom face: only draw if solid below
              if (isAir(neighbor) || neighbor === BlockType.Water) continue;
            } else {
              // Side face: skip if water-water
              if (neighbor === BlockType.Water) continue;
            }
          }

          const texName = getTextureName(block, fi);
          const tile = atlas.tiles[texName];
          if (!tile) continue;

          // Per-face shading (like Minecraft's ambient lighting)
          let shade = 1.0;
          if (fi === 2) shade = 1.0;       // top: full bright
          else if (fi === 3) shade = 0.55; // bottom: darkest
          else if (fi === 0 || fi === 1) shade = 0.72; // X sides
          else shade = 0.88;               // Z sides

          // Water surface slightly lowered for visual depth
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

          // Two triangles per face
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
