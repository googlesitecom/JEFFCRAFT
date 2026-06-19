// Texture atlas builder with stable, deterministic tile order
import * as THREE from "three";

// Ordered list of texture names - this order is FIXED and deterministic.
// Adding new textures here MUST append to the end to preserve existing UV mappings.
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

const ATLAS_TILE = 16;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;
const ATLAS_W = ATLAS_TILE * ATLAS_COLS;
const ATLAS_H = ATLAS_TILE * ATLAS_ROWS;

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
    const x = col * ATLAS_TILE;
    const y = row * ATLAS_TILE;
    const src = textureCanvases[name];
    if (src) {
      ctx.drawImage(src, x, y, ATLAS_TILE, ATLAS_TILE);
    }
    // UV coords with inset to prevent bleeding
    const inset = 0.5 / ATLAS_W;
    tiles[name] = {
      u0: (x + inset) / ATLAS_W,
      v0: 1 - (y + ATLAS_TILE - inset) / ATLAS_H,
      u1: (x + ATLAS_TILE - inset) / ATLAS_W,
      v1: 1 - (y + inset) / ATLAS_H,
    };
  });

  const atlasTexture = new THREE.CanvasTexture(canvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
  atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
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
