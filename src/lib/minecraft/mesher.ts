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
    if (block === BlockType.NetherPortal) return true; // portal blocks show internal faces
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

/**
 * Helper: push a simple box (6 quads) into a FaceData buffer.
 * Used for special block geometry (bed, fence, door, etc.).
 */
function pushBox(
  target: FaceData,
  x: number, y: number, z: number,
  w: number, h: number, d: number,
  tile: { u0: number; v0: number; u1: number; v1: number },
  shade: number = 1.0
) {
  const x2 = x + w, y2 = y + h, z2 = z + d;
  const c = shade;
  // 6 faces: +X, -X, +Y, -Y, +Z, -Z
  const faces: Array<{ n: number[]; verts: number[][] }> = [
    { n: [1, 0, 0], verts: [[x2, y, z], [x2, y2, z], [x2, y2, z2], [x2, y, z2]] },     // +X
    { n: [-1, 0, 0], verts: [[x, y, z2], [x, y2, z2], [x, y2, z], [x, y, z]] },         // -X
    { n: [0, 1, 0], verts: [[x, y2, z], [x, y2, z2], [x2, y2, z2], [x2, y2, z]] },     // +Y
    { n: [0, -1, 0], verts: [[x, y, z2], [x, y, z], [x2, y, z], [x2, y, z2]] },         // -Y
    { n: [0, 0, 1], verts: [[x, y, z2], [x2, y, z2], [x2, y2, z2], [x, y2, z2]] },     // +Z
    { n: [0, 0, -1], verts: [[x2, y, z], [x, y, z], [x, y2, z], [x2, y2, z]] },         // -Z
  ];
  for (const f of faces) {
    const si = target.positions.length / 3;
    for (const v of f.verts) {
      target.positions.push(v[0], v[1], v[2]);
      target.normals.push(f.n[0], f.n[1], f.n[2]);
      target.colors.push(c, c, c);
    }
    target.uvs.push(tile.u0, tile.v0, tile.u0, tile.v1, tile.u1, tile.v1, tile.u1, tile.v0);
    target.indices.push(si, si + 1, si + 2, si, si + 2, si + 3);
  }
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
        const def = BLOCKS[block];

        // === Bed: render as a flat bed shape (headboard + mattress) ===
        // A bed occupies a 1×1×2 area (head + foot). We render it as a low
        // platform with a headboard at the back.
        if (block === BlockType.Bed) {
          const tile = atlas.tiles["bed_top"] || atlas.tiles["planks"];
          if (tile) {
            const target = cutout;
            // Mattress: low box (0.9 wide, 0.3 tall, 0.9 deep) centered in the block
            const mw = 0.9, mh = 0.3, md = 0.9;
            const mx = wx + (1 - mw) / 2, my = y, mz = wz + (1 - md) / 2;
            pushBox(target, mx, my, mz, mw, mh, md, tile, 1.0);
            // Headboard: thin tall box at the back
            const hw = 0.9, hh = 0.5, hd = 0.1;
            const hx = wx + (1 - hw) / 2, hy = y + 0.3, hz = wz;
            pushBox(target, hx, hy, hz, hw, hh, hd, tile, 0.8);
            // Pillow: small white box at the head
            const pw = 0.3, ph = 0.1, pd = 0.3;
            const px = wx + (1 - pw) / 2, py = y + 0.3, pz = wz + 0.1;
            const pillowTile = atlas.tiles["bed_top"] || atlas.tiles["planks"];
            if (pillowTile) pushBox(target, px, py, pz, pw, ph, pd, pillowTile, 1.0);
          }
          continue;
        }

        // === Fence: render as a post + rails connecting to adjacent fences ===
        if (block === BlockType.Fence) {
          const tile = atlas.tiles[def.textures.side] || atlas.tiles["planks"];
          if (tile) {
            const target = cutout;
            // Center post: 0.3×1.0×0.3
            const pw = 0.3, ph = 1.0, pd = 0.3;
            const px = wx + (1 - pw) / 2, py = y, pz = wz + (1 - pd) / 2;
            pushBox(target, px, py, pz, pw, ph, pd, tile, 1.0);
            // Rails: connect to adjacent fences in all 4 directions
            const railW = 0.3, railH = 0.2, railD = 0.6;
            const railY1 = y + 0.2, railY2 = y + 0.6;
            // +X direction
            if (world.getBlock(wx + 1, y, wz) === BlockType.Fence) {
              pushBox(target, wx + 0.65, railY1, wz + 0.2, 0.4, railH, railW, tile, 0.9);
              pushBox(target, wx + 0.65, railY2, wz + 0.2, 0.4, railH, railW, tile, 0.9);
            }
            // -X direction
            if (world.getBlock(wx - 1, y, wz) === BlockType.Fence) {
              pushBox(target, wx - 0.05, railY1, wz + 0.2, 0.4, railH, railW, tile, 0.9);
              pushBox(target, wx - 0.05, railY2, wz + 0.2, 0.4, railH, railW, tile, 0.9);
            }
            // +Z direction
            if (world.getBlock(wx, y, wz + 1) === BlockType.Fence) {
              pushBox(target, wx + 0.2, railY1, wz + 0.65, railW, railH, 0.4, tile, 0.9);
              pushBox(target, wx + 0.2, railY2, wz + 0.65, railW, railH, 0.4, tile, 0.9);
            }
            // -Z direction
            if (world.getBlock(wx, y, wz - 1) === BlockType.Fence) {
              pushBox(target, wx + 0.2, railY1, wz - 0.05, railW, railH, 0.4, tile, 0.9);
              pushBox(target, wx + 0.2, railY2, wz - 0.05, railW, railH, 0.4, tile, 0.9);
            }
          }
          continue;
        }

        // === Wooden Door: render as a tall thin door panel ===
        if (block === BlockType.WoodenDoor) {
          const tile = atlas.tiles[def.textures.side] || atlas.tiles["planks"];
          if (tile) {
            const target = cutout;
            // Door panel: 0.9 wide, 1.0 tall, 0.08 thick
            const dw = 0.9, dh = 1.0, dd = 0.08;
            const dx = wx + (1 - dw) / 2, dy = y, dz = wz + (1 - dd) / 2;
            pushBox(target, dx, dy, dz, dw, dh, dd, tile, 1.0);
          }
          continue;
        }

        // Torch: render as small cross, attached to adjacent wall or floor (no floating).
        if (block === BlockType.Torch) {
          const tile = atlas.tiles["torch"];
          if (tile) {
            const target = cutout;
            // Detect orientation: which adjacent solid block determines where the torch attaches.
            // Priority: wall (sides) > floor (below).
            const blockBelow = world.getBlock(wx, y - 1, wz);
            const blockEast = world.getBlock(wx + 1, y, wz);   // +X
            const blockWest = world.getBlock(wx - 1, y, wz);   // -X
            const blockNorth = world.getBlock(wx, y, wz + 1);  // +Z
            const blockSouth = world.getBlock(wx, y, wz - 1);  // -Z
            let attachDir: "floor" | "east" | "west" | "north" | "south" = "floor";
            if (isOpaque(blockEast)) attachDir = "east";
            else if (isOpaque(blockWest)) attachDir = "west";
            else if (isOpaque(blockNorth)) attachDir = "north";
            else if (isOpaque(blockSouth)) attachDir = "south";
            // Default: floor (if block below is solid, or nothing solid adjacent)

            // Position and tilt based on attachment direction
            let cx = wx + 0.5, cy = y + 0.02, cz = wz + 0.5;
            const w = 0.1, h = 0.5;
            // Offset toward the wall and tilt slightly
            let tiltX = 0, tiltZ = 0;
            if (attachDir === "east") { cx = wx + 0.85; tiltX = -0.3; }
            else if (attachDir === "west") { cx = wx + 0.15; tiltX = 0.3; }
            else if (attachDir === "north") { cz = wz + 0.85; tiltZ = -0.3; }
            else if (attachDir === "south") { cz = wz + 0.15; tiltZ = 0.3; }
            // Floor torch: centered, no tilt

            // Render as 2 crossed planes (X and Z aligned) at the attachment position.
            // The torch is tilted toward the wall it's attached to.
            // Plane 1 (Z-aligned, facing ±X)
            const si = target.positions.length / 3;
            // Compute tilted corners: base at (cx, cy, cz), top at (cx+tiltX*h, cy+h, cz+tiltZ*h)
            const baseX = cx, baseZ = cz;
            const topX = cx + tiltX * h * 0.5;
            const topZ = cz + tiltZ * h * 0.5;
            // Plane 1: along X axis (left-right), facing Z
            target.positions.push(
              baseX - w, cy, cz,        // bottom-left
              baseX + w, cy, cz,        // bottom-right
              topX + w, cy + h, topZ,   // top-right (tilted)
              topX - w, cy + h, topZ    // top-left (tilted)
            );
            target.normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
            target.uvs.push(tile.u0, tile.v0, tile.u1, tile.v0, tile.u1, tile.v1, tile.u0, tile.v1);
            target.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
            target.indices.push(si, si + 1, si + 2, si, si + 2, si + 3);
            // Back face of plane 1
            const si2 = target.positions.length / 3;
            target.positions.push(
              baseX - w, cy, cz,
              baseX + w, cy, cz,
              topX + w, cy + h, topZ,
              topX - w, cy + h, topZ
            );
            target.normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1);
            target.uvs.push(tile.u1, tile.v0, tile.u0, tile.v0, tile.u0, tile.v1, tile.u1, tile.v1);
            target.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
            target.indices.push(si2, si2 + 1, si2 + 2, si2, si2 + 2, si2 + 3);
            // Plane 2: along Z axis (front-back), facing X
            const si3 = target.positions.length / 3;
            target.positions.push(
              cx, cy, baseZ - w,
              cx, cy, baseZ + w,
              topX, cy + h, topZ + w,
              topX, cy + h, topZ - w
            );
            target.normals.push(1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0);
            target.uvs.push(tile.u0, tile.v0, tile.u1, tile.v0, tile.u1, tile.v1, tile.u0, tile.v1);
            target.colors.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
            target.indices.push(si3, si3 + 1, si3 + 2, si3, si3 + 2, si3 + 3);
            // Back face of plane 2
            const si4 = target.positions.length / 3;
            target.positions.push(
              cx, cy, baseZ - w,
              cx, cy, baseZ + w,
              topX, cy + h, topZ + w,
              topX, cy + h, topZ - w
            );
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
        else if (block === BlockType.Glass || block === BlockType.NetherPortal) target = glass;
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
  // Enable shadow receiving for all solid meshes
  mesh.receiveShadow = true;
  return mesh;
}
