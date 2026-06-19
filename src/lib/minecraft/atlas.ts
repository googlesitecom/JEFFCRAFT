// Texture atlas builder with stable, deterministic tile order.
// Uses generous padding between tiles to PREVENT any texture bleeding.
import * as THREE from "three";

// Fixed, ordered list of all texture names
export const TEXTURE_NAMES = [
  // Blocks (25)
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
  "crafting_table_top",
  "crafting_table_side",
  "bookshelf",
  // Materials (6)
  "stick",
  "coal",
  "iron_ingot",
  "gold_ingot",
  "diamond",
  "charcoal",
  // Food (7)
  "apple",
  "raw_porkchop",
  "cooked_porkchop",
  "raw_beef",
  "cooked_beef",
  "raw_chicken",
  "cooked_chicken",
  // Tools (16)
  "wood_pickaxe",
  "wood_axe",
  "wood_sword",
  "wood_shovel",
  "stone_pickaxe",
  "stone_axe",
  "stone_sword",
  "stone_shovel",
  "iron_pickaxe",
  "iron_axe",
  "iron_sword",
  "iron_shovel",
  "diamond_pickaxe",
  "diamond_axe",
  "diamond_sword",
  "diamond_shovel",
] as const;

export type TextureName = (typeof TEXTURE_NAMES)[number];

// Tile source size = 16x16 pixels (classic Minecraft)
const TILE_SIZE = 16;
// Padding pixels around each tile - generous to avoid ANY bleeding
const PADDING = 8;
const SLOT = TILE_SIZE + PADDING * 2; // 32 pixels per slot
const COLS = 8;
const ROWS = 8; // 8x8 = 64 slots, enough for 54 textures
const ATLAS_W = SLOT * COLS; // 256
const ATLAS_H = SLOT * ROWS; // 256

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
  // Fill background magenta so missing textures are obvious
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  const tiles: Record<string, AtlasTile> = {};

  TEXTURE_NAMES.forEach((name, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // Top-left of the inner 16x16 tile
    const x = col * SLOT + PADDING;
    const y = row * SLOT + PADDING;
    const src = textureCanvases[name];
    if (src) {
      // Draw the source tile
      ctx.drawImage(src, x, y, TILE_SIZE, TILE_SIZE);
      // === Edge padding: replicate border pixels into the padding region ===
      // This prevents bleeding when the GPU samples slightly outside the tile
      // Top edge: copy top row of source into PADDING rows above
      const topRow = ctx.getImageData(x, y, TILE_SIZE, 1);
      for (let p = 1; p <= PADDING; p++) {
        ctx.putImageData(topRow, x, y - p);
      }
      // Bottom edge
      const botRow = ctx.getImageData(x, y + TILE_SIZE - 1, TILE_SIZE, 1);
      for (let p = 0; p < PADDING; p++) {
        ctx.putImageData(botRow, x, y + TILE_SIZE + p);
      }
      // Left edge
      const leftCol = ctx.getImageData(x, y, 1, TILE_SIZE);
      for (let p = 1; p <= PADDING; p++) {
        ctx.putImageData(leftCol, x - p, y);
      }
      // Right edge
      const rightCol = ctx.getImageData(x + TILE_SIZE - 1, y, 1, TILE_SIZE);
      for (let p = 0; p < PADDING; p++) {
        ctx.putImageData(rightCol, x + TILE_SIZE + p, y);
      }
      // Corners: copy 1x1 corner pixels into the corner padding regions
      const tl = ctx.getImageData(x, y, 1, 1);
      const tr = ctx.getImageData(x + TILE_SIZE - 1, y, 1, 1);
      const bl = ctx.getImageData(x, y + TILE_SIZE - 1, 1, 1);
      const br = ctx.getImageData(x + TILE_SIZE - 1, y + TILE_SIZE - 1, 1, 1);
      for (let py = 1; py <= PADDING; py++) {
        for (let px = 1; px <= PADDING; px++) {
          ctx.putImageData(tl, x - px, y - py);
          ctx.putImageData(tr, x + TILE_SIZE - 1 + px, y - py);
          ctx.putImageData(bl, x - px, y + TILE_SIZE - 1 + py);
          ctx.putImageData(br, x + TILE_SIZE - 1 + px, y + TILE_SIZE - 1 + py);
        }
      }
    }
    // UV coords - map exactly to the inner 16x16 tile
    tiles[name] = {
      u0: x / ATLAS_W,
      v0: 1 - (y + TILE_SIZE) / ATLAS_H,
      u1: (x + TILE_SIZE) / ATLAS_W,
      v1: 1 - y / ATLAS_H,
    };
  });

  const atlasTexture = new THREE.CanvasTexture(canvas);
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

export function resetAtlas() {
  if (atlasInstance) {
    atlasInstance.texture.dispose();
    atlasInstance = null;
  }
}
