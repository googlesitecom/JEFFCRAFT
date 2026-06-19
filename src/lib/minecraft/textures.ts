// Procedural pixel-art texture generation for Minecraft blocks
// Returns HTMLCanvasElement (not THREE.Texture) so the atlas can be built deterministically.
const TEX_SIZE = 16;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  return [clamp(rgb[0] + amount, 0, 255), clamp(rgb[1] + amount, 0, 255), clamp(rgb[2] + amount, 0, 255)];
}

function variation(rgb: [number, number, number], v: number, rng: () => number): [number, number, number] {
  return [
    clamp(rgb[0] + (rng() - 0.5) * 2 * v, 0, 255),
    clamp(rgb[1] + (rng() - 0.5) * 2 * v, 0, 255),
    clamp(rgb[2] + (rng() - 0.5) * 2 * v, 0, 255),
  ];
}

function setPixel(img: ImageData, x: number, y: number, rgb: [number, number, number], alpha = 255) {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = rgb[0];
  img.data[i + 1] = rgb[1];
  img.data[i + 2] = rgb[2];
  img.data[i + 3] = alpha;
}

function fill(img: ImageData, rgb: [number, number, number]) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      setPixel(img, x, y, rgb);
    }
  }
}

function noiseFill(img: ImageData, base: [number, number, number], v: number, seed: number) {
  const rng = makeRng(seed);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      setPixel(img, x, y, variation(base, v, rng));
    }
  }
}

function imageDataToCanvas(img: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ============================================================
// BLOCK TEXTURES (16x16 each)
// ============================================================

function texDirt(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#79553a"), 14, 1);
  const rng = makeRng(100);
  // Darker specks
  for (let i = 0; i < 22; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#5e3f29"), -10 + rng() * 15));
  }
  // Lighter specks
  for (let i = 0; i < 12; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#8a6342"), 0 + rng() * 15));
  }
  return img;
}

function texGrassTop(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#5fa83b"), 14, 2);
  const rng = makeRng(102);
  for (let i = 0; i < 24; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#4d8f30"), -10 + rng() * 25));
  }
  for (let i = 0; i < 10; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#74c14a"), 0 + rng() * 15));
  }
  return img;
}

function texGrassSide(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  // Bottom: dirt
  noiseFill(img, hexToRgb("#79553a"), 14, 3);
  const rng = makeRng(103);
  // Top: grass overlay (3-4 pixels deep)
  for (let x = 0; x < TEX_SIZE; x++) {
    const grassH = 3 + Math.floor(rng() * 2);
    for (let y = 0; y < grassH; y++) {
      setPixel(img, x, y, variation(hexToRgb("#5fa83b"), 14, rng));
    }
    // Dangling grass pixels below
    if (rng() > 0.55) {
      setPixel(img, x, grassH, variation(hexToRgb("#4d8f30"), 12, rng));
    }
  }
  // Add a few specks on dirt
  for (let i = 0; i < 10; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), 5 + Math.floor(rng() * 11), shade(hexToRgb("#5e3f29"), -5 + rng() * 10));
  }
  return img;
}

function texStone(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#7d7d7d"), 10, 4);
  const rng = makeRng(104);
  for (let i = 0; i < 18; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#5e5e5e"), -8 + rng() * 16));
  }
  for (let i = 0; i < 8; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#9a9a9a"), 0 + rng() * 12));
  }
  return img;
}

function texCobblestone(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#383838")); // dark mortar
  const rng = makeRng(5);
  // Stones of various sizes
  const stones = [
    { x: 0, y: 0, w: 5, h: 4 },
    { x: 6, y: 0, w: 6, h: 4 },
    { x: 13, y: 0, w: 3, h: 5 },
    { x: 0, y: 5, w: 4, h: 5 },
    { x: 5, y: 5, w: 5, h: 4 },
    { x: 11, y: 6, w: 5, h: 5 },
    { x: 0, y: 11, w: 6, h: 5 },
    { x: 7, y: 10, w: 4, h: 6 },
    { x: 12, y: 12, w: 4, h: 4 },
  ];
  for (const s of stones) {
    const base = variation(hexToRgb("#8a8a8a"), 14, rng);
    for (let y = s.y; y < s.y + s.h && y < TEX_SIZE; y++) {
      for (let x = s.x; x < s.x + s.w && x < TEX_SIZE; x++) {
        setPixel(img, x, y, variation(base, 8, rng));
      }
    }
    // Dark outline on left/top
    for (let y = s.y; y < s.y + s.h && y < TEX_SIZE; y++) {
      setPixel(img, s.x, y, hexToRgb("#383838"));
    }
    for (let x = s.x; x < s.x + s.w && x < TEX_SIZE; x++) {
      setPixel(img, x, s.y, hexToRgb("#383838"));
    }
  }
  return img;
}

function texWoodTop(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#a07640"));
  const cx = 8, cy = 8;
  const rng = makeRng(6);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.floor(d) % 2 === 0;
      if (ring) {
        setPixel(img, x, y, shade(hexToRgb("#7a5a30"), -5 + (d % 3) * 3));
      } else {
        setPixel(img, x, y, variation(hexToRgb("#9a6f3a"), 6, rng));
      }
    }
  }
  // Center knot
  setPixel(img, 8, 8, hexToRgb("#5a3e22"));
  return img;
}

function texWoodSide(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const rng = makeRng(7);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      // Vertical bark stripes
      const stripe = (x + Math.floor(rng() * 2)) % 4 < 2;
      const base = stripe ? hexToRgb("#6e4d28") : hexToRgb("#7a5a30");
      setPixel(img, x, y, variation(base, 6, rng));
    }
  }
  // Knot
  const kx = 5, ky = 6;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      setPixel(img, kx + dx, ky + dy, hexToRgb("#4a3318"));
    }
  }
  return img;
}

function texLeaves(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const rng = makeRng(8);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const r = rng();
      let c: [number, number, number];
      if (r < 0.2) c = variation(hexToRgb("#2d5e1c"), 8, rng);
      else if (r < 0.5) c = variation(hexToRgb("#3a7d28"), 12, rng);
      else if (r < 0.8) c = variation(hexToRgb("#4a8f35"), 12, rng);
      else c = variation(hexToRgb("#1f4012"), 8, rng);
      setPixel(img, x, y, c, 255);
    }
  }
  // Darker spots for depth
  for (let i = 0; i < 10; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), hexToRgb("#16380a"));
  }
  return img;
}

function texSand(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#e0d39b"), 8, 9);
  const rng = makeRng(109);
  for (let i = 0; i < 20; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#c9bb83"), -3 + rng() * 8));
  }
  return img;
}

function texWater(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#2b5fb3"), 10, 10);
  const rng = makeRng(110);
  // Horizontal wave lines
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(rng() * TEX_SIZE);
    for (let x = 0; x < TEX_SIZE; x++) {
      if (rng() > 0.4) {
        setPixel(img, x, y, shade(hexToRgb("#3a72c8"), 12));
      }
    }
  }
  return img;
}

function texBedrock(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#3a3a3a"));
  const rng = makeRng(11);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    const gray = 40 + Math.floor(rng() * 70);
    setPixel(img, x, y, [gray, gray, gray]);
  }
  return img;
}

function texPlanks(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const rng = makeRng(12);
  // Horizontal planks (4 rows of 4px)
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const plankRow = Math.floor(y / 4);
      const base = plankRow % 2 === 0 ? hexToRgb("#a07640") : hexToRgb("#8a6536");
      setPixel(img, x, y, variation(base, 6, rng));
    }
  }
  // Plank separator lines
  for (let y = 0; y < TEX_SIZE; y += 4) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPixel(img, x, y, hexToRgb("#6e4d28"));
    }
  }
  // Vertical seams (offset per row)
  const rng2 = makeRng(13);
  for (let row = 0; row < 4; row++) {
    const x = 4 + Math.floor(rng2() * 8);
    for (let y = row * 4; y < row * 4 + 4; y++) {
      setPixel(img, x, y, hexToRgb("#6e4d28"));
    }
  }
  return img;
}

function texGlass(): ImageData {
  // Glass: mostly transparent with a visible border and a few highlights
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  // Start fully transparent
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPixel(img, x, y, [255, 255, 255], 0);
    }
  }
  // Border (frame)
  const border = [220, 235, 240] as [number, number, number];
  for (let i = 0; i < TEX_SIZE; i++) {
    setPixel(img, i, 0, border, 220);
    setPixel(img, i, TEX_SIZE - 1, border, 220);
    setPixel(img, 0, i, border, 220);
    setPixel(img, TEX_SIZE - 1, i, border, 220);
  }
  // Inner border (1px inside)
  for (let i = 2; i < TEX_SIZE - 2; i++) {
    setPixel(img, i, 2, [200, 220, 230], 100);
    setPixel(img, i, TEX_SIZE - 3, [200, 220, 230], 100);
    setPixel(img, 2, i, [200, 220, 230], 100);
    setPixel(img, TEX_SIZE - 3, i, [200, 220, 230], 100);
  }
  // Highlight stripe (top-left diagonal)
  for (let i = 3; i < 7; i++) {
    setPixel(img, i, i, [255, 255, 255], 180);
  }
  setPixel(img, 4, 3, [255, 255, 255], 200);
  setPixel(img, 3, 4, [255, 255, 255], 200);
  return img;
}

function texBrick(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#9c4f3b")); // mortar color
  const rng = makeRng(14);
  const brickH = 4;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const row = Math.floor(y / brickH);
      const offset = row % 2 === 0 ? 0 : 4;
      const bx = (x + offset) % 8;
      const by = y % brickH;
      if (bx === 0 || by === 0) {
        setPixel(img, x, y, hexToRgb("#cccccc")); // mortar line
      } else {
        setPixel(img, x, y, variation(hexToRgb("#b15a44"), 10, rng));
      }
    }
  }
  return img;
}

function texOre(stoneSeed: number, oreColor: [number, number, number], oreSeed: number): ImageData {
  // Copy stone base
  const base = texStone();
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  img.data.set(base.data);
  const rng = makeRng(oreSeed);
  // 4-6 ore clusters
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    const cy = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    // 3x3 cluster with random holes
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (rng() > 0.3) {
          setPixel(img, cx + dx, cy + dy, variation(oreColor, 14, rng));
        }
      }
    }
  }
  return img;
}

function texCoalOre(): ImageData { return texOre(4, hexToRgb("#1a1a1a"), 15); }
function texIronOre(): ImageData { return texOre(4, hexToRgb("#c69b80"), 16); }
function texGoldOre(): ImageData { return texOre(4, hexToRgb("#f7d046"), 17); }
function texDiamondOre(): ImageData { return texOre(4, hexToRgb("#5edcdc"), 18); }

function texSnow(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#f5fbff"), 5, 19);
  const rng = makeRng(119);
  for (let i = 0; i < 14; i++) {
    setPixel(img, Math.floor(rng() * TEX_SIZE), Math.floor(rng() * TEX_SIZE), shade(hexToRgb("#e0e8f0"), -3 + rng() * 6));
  }
  return img;
}

function texPumpkinTop(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#c67d2a"), 10, 20);
  // Stem in center
  for (let y = 6; y < 10; y++) {
    for (let x = 6; x < 10; x++) {
      setPixel(img, x, y, hexToRgb("#5e7d2a"));
    }
  }
  setPixel(img, 7, 7, hexToRgb("#4a6620"));
  setPixel(img, 8, 8, hexToRgb("#4a6620"));
  return img;
}

function texPumpkinSide(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#c67d2a"), 10, 21);
  const rng = makeRng(121);
  // Vertical ridges
  for (let x = 0; x < TEX_SIZE; x++) {
    if (x % 5 === 0) {
      for (let y = 0; y < TEX_SIZE; y++) {
        setPixel(img, x, y, hexToRgb("#9a5e1f"));
      }
    }
  }
  // Stem top
  for (let x = 6; x < 10; x++) {
    setPixel(img, x, 0, hexToRgb("#5e7d2a"));
    setPixel(img, x, 1, hexToRgb("#5e7d2a"));
  }
  return img;
}

function texGravel(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#6b6b6b"));
  const rng = makeRng(22);
  for (let i = 0; i < 32; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    const size = 1 + Math.floor(rng() * 2);
    const gray = 70 + Math.floor(rng() * 80);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (x + dx < TEX_SIZE && y + dy < TEX_SIZE) {
          setPixel(img, x + dx, y + dy, [gray, gray, gray]);
        }
      }
    }
  }
  return img;
}

function texCraftingTableTop(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  // Planks base
  const base = texPlanks();
  img.data.set(base.data);
  // Darker border
  for (let i = 0; i < TEX_SIZE; i++) {
    setPixel(img, i, 0, hexToRgb("#4a3318"));
    setPixel(img, i, TEX_SIZE - 1, hexToRgb("#4a3318"));
    setPixel(img, 0, i, hexToRgb("#4a3318"));
    setPixel(img, TEX_SIZE - 1, i, hexToRgb("#4a3318"));
  }
  // Cross/grid pattern in the center (crafting grid)
  for (let i = 2; i < 14; i++) {
    setPixel(img, i, 5, hexToRgb("#4a3318"));
    setPixel(img, i, 10, hexToRgb("#4a3318"));
    setPixel(img, 5, i, hexToRgb("#4a3318"));
    setPixel(img, 10, i, hexToRgb("#4a3318"));
  }
  return img;
}

function texCraftingTableSide(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const base = texPlanks();
  img.data.set(base.data);
  // Tool icons (simplified)
  // Top: saw/handle
  for (let x = 3; x < 13; x++) {
    setPixel(img, x, 3, hexToRgb("#3a3a3a"));
  }
  setPixel(img, 3, 4, hexToRgb("#3a3a3a"));
  setPixel(img, 4, 4, hexToRgb("#3a3a3a"));
  // Bottom: crafting grid hint
  for (let i = 6; i < 14; i++) {
    setPixel(img, i, 8, hexToRgb("#4a3318"));
    setPixel(img, i, 11, hexToRgb("#4a3318"));
  }
  return img;
}

function texBookshelf(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const base = texPlanks();
  img.data.set(base.data);
  // Top and bottom planks stay
  // Middle: book area (rows 4-11)
  const rng = makeRng(31);
  const bookColors = [
    hexToRgb("#aa2222"), // red
    hexToRgb("#2244aa"), // blue
    hexToRgb("#22aa44"), // green
    hexToRgb("#aa8822"), // gold
    hexToRgb("#882288"), // purple
    hexToRgb("#222222"), // black
  ];
  // Top shelf border
  for (let x = 0; x < TEX_SIZE; x++) {
    setPixel(img, x, 4, hexToRgb("#4a3318"));
    setPixel(img, x, 11, hexToRgb("#4a3318"));
  }
  // Books standing
  let x = 1;
  while (x < 15) {
    const color = bookColors[Math.floor(rng() * bookColors.length)];
    const bookW = 1 + Math.floor(rng() * 2);
    for (let dx = 0; dx < bookW && x + dx < 15; dx++) {
      for (let y = 5; y < 11; y++) {
        setPixel(img, x + dx, y, variation(color, 8, rng));
      }
    }
    x += bookW;
    // Sometimes a gap
    if (rng() > 0.7) x += 1;
  }
  return img;
}

// ============================================================
// EXPORT
// ============================================================

import { buildItemCanvases } from "./item-textures";

export function buildTextureCanvases(): Record<string, HTMLCanvasElement> {
  const blocks: Record<string, HTMLCanvasElement> = {
    dirt: imageDataToCanvas(texDirt()),
    grass_top: imageDataToCanvas(texGrassTop()),
    grass_side: imageDataToCanvas(texGrassSide()),
    stone: imageDataToCanvas(texStone()),
    cobblestone: imageDataToCanvas(texCobblestone()),
    wood_top: imageDataToCanvas(texWoodTop()),
    wood_side: imageDataToCanvas(texWoodSide()),
    leaves: imageDataToCanvas(texLeaves()),
    sand: imageDataToCanvas(texSand()),
    water: imageDataToCanvas(texWater()),
    bedrock: imageDataToCanvas(texBedrock()),
    planks: imageDataToCanvas(texPlanks()),
    glass: imageDataToCanvas(texGlass()),
    brick: imageDataToCanvas(texBrick()),
    coal_ore: imageDataToCanvas(texCoalOre()),
    iron_ore: imageDataToCanvas(texIronOre()),
    gold_ore: imageDataToCanvas(texGoldOre()),
    diamond_ore: imageDataToCanvas(texDiamondOre()),
    snow: imageDataToCanvas(texSnow()),
    pumpkin_top: imageDataToCanvas(texPumpkinTop()),
    pumpkin_side: imageDataToCanvas(texPumpkinSide()),
    gravel: imageDataToCanvas(texGravel()),
    crafting_table_top: imageDataToCanvas(texCraftingTableTop()),
    crafting_table_side: imageDataToCanvas(texCraftingTableSide()),
    bookshelf: imageDataToCanvas(texBookshelf()),
  };
  // Merge in item textures
  const items = buildItemCanvases();
  return { ...blocks, ...items };
}

export function buildIconDataURLs(canvases: Record<string, HTMLCanvasElement>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, canvas] of Object.entries(canvases)) {
    out[name] = canvas.toDataURL();
  }
  return out;
}
