// Texture atlas builder with stable, deterministic tile order.
// Uses padding between tiles to prevent texture bleeding at any resolution/filter.
import * as THREE from "three";

export const TEXTURE_NAMES = [
  "dirt",
  "grass_top",
  "grass_side",
  "stone",
  "cobblestone",
  "wood_top",
  "wood_side",
  "leaves",
  "sand",
  "water",
  "bedrock",
  "planks",
  "glass",
  "brick",
  "coal_ore",
  "iron_ore",
  "gold_ore",
  "diamond_ore",
  "snow",
  "pumpkin_top",
  "pumpkin_side",
  "gravel",
] as const;

export type TextureName = (typeof TEXTURE_NAMES)[number];

const ATLAS_TILE = 16; // source tile size
const ATLAS_PADDING = 4; // padding pixels around each tile to prevent bleeding
const TILE_TOTAL = ATLAS_TILE + ATLAS_PADDING * 2; // 24px per tile slot
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;
const ATLAS_W = TILE_TOTAL * ATLAS_COLS; // 192
const ATLAS_H = TILE_TOTAL * ATLAS_ROWS; // 96

export interface AtlasTile {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface TextureAtlas {
  texture: THREE.Texture;
  tiles: Record<string, AtlasTile>;
}

let atlasInstance: TextureAtlas | null = null;

export function buildAtlas(
  textureCanvases: Record<string, HTMLCanvasElement>
): TextureAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  // Fill with magenta as error indicator
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  const tiles: Record<string, AtlasTile> = {};

  TEXTURE_NAMES.forEach((name, i) => {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const x = col * TILE_TOTAL + ATLAS_PADDING;
    const y = row * TILE_TOTAL + ATLAS_PADDING;
    const src = textureCanvases[name];
    if (src) {
      // Draw the 16x16 tile, then repeat its edge pixels into the padding
      // (edge padding) to prevent bleeding at any filter
      ctx.drawImage(src, x, y, ATLAS_TILE, ATLAS_TILE);
      // Top padding: copy top row
      const topImg = ctx.getImageData(x, y, ATLAS_TILE, 1);
      for (let p = 1; p <= ATLAS_PADDING; p++) {
        ctx.putImageData(topImg, x, y - p);
      }
      // Bottom padding: copy bottom row
      const botImg = ctx.getImageData(x, y + ATLAS_TILE - 1, ATLAS_TILE, 1);
      for (let p = 0; p < ATLAS_PADDING; p++) {
        ctx.putImageData(botImg, x, y + ATLAS_TILE + p);
      }
      // Left padding: copy left column
      const leftImg = ctx.getImageData(x, y, 1, ATLAS_TILE);
      for (let p = 1; p <= ATLAS_PADDING; p++) {
        ctx.putImageData(leftImg, x - p, y);
      }
      // Right padding: copy right column
      const rightImg = ctx.getImageData(x + ATLAS_TILE - 1, y, 1, ATLAS_TILE);
      for (let p = 0; p < ATLAS_PADDING; p++) {
        ctx.putImageData(rightImg, x + ATLAS_TILE + p, y);
      }
      // Corner padding: copy corner pixels
      const tl = ctx.getImageData(x, y, 1, 1);
      const tr = ctx.getImageData(x + ATLAS_TILE - 1, y, 1, 1);
      const bl = ctx.getImageData(x, y + ATLAS_TILE - 1, 1, 1);
      const br = ctx.getImageData(x + ATLAS_TILE - 1, y + ATLAS_TILE - 1, 1, 1);
      for (let py = 1; py <= ATLAS_PADDING; py++) {
        for (let px = 1; px <= ATLAS_PADDING; px++) {
          ctx.putImageData(tl, x - px, y - py);
          ctx.putImageData(tr, x + ATLAS_TILE - 1 + px, y - py);
          ctx.putImageData(bl, x - px, y + ATLAS_TILE - 1 + py);
          ctx.putImageData(br, x + ATLAS_TILE - 1 + px, y + ATLAS_TILE - 1 + py);
        }
      }
    }
    // UV coords - map to the 16x16 inner tile (padding excluded from UV range)
    tiles[name] = {
      u0: x / ATLAS_W,
      v0: 1 - (y + ATLAS_TILE) / ATLAS_H,
      u1: (x + ATLAS_TILE) / ATLAS_W,
      v1: 1 - y / ATLAS_H,
    };
  });

  const atlasTexture = new THREE.CanvasTexture(canvas);
  // Use linear filtering with mipmaps for stable rendering at distance
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
  atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.needsUpdate = true;

  return { texture: atlasTexture, tiles };
}

export function getSharedAtlas(
  textureCanvases: Record<string, HTMLCanvasElement>
): TextureAtlas {
  if (!atlasInstance) {
    atlasInstance = buildAtlas(textureCanvases);
  }
  return atlasInstance;
}

// Reset cached atlas (used when entering a new game session)
export function resetAtlas() {
  if (atlasInstance) {
    atlasInstance.texture.dispose();
    atlasInstance = null;
  }
}
