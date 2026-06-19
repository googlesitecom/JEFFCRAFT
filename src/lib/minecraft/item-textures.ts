// Procedural pixel-art textures for ITEMS (food, materials, tools)
// Items are rendered as 2D icons (not 3D cubes), so textures are different from block textures.
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

function setPixel(img: ImageData, x: number, y: number, rgb: [number, number, number], alpha = 255) {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = rgb[0];
  img.data[i + 1] = rgb[1];
  img.data[i + 2] = rgb[2];
  img.data[i + 3] = alpha;
}

function clearTransparent(img: ImageData) {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i + 3] = 0;
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

// Helper to draw a filled rectangle
function fillRect(img: ImageData, x: number, y: number, w: number, h: number, rgb: [number, number, number], alpha = 255) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(img, x + dx, y + dy, rgb, alpha);
    }
  }
}

// ============================================================
// MATERIALS
// ============================================================

function texStick(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  // Diagonal stick from bottom-left to top-right
  const stickColor = hexToRgb("#9c6f3a");
  const darkColor = hexToRgb("#6e4d28");
  const lightColor = hexToRgb("#b08850");
  // Draw diagonal stick
  const positions = [
    [3, 11], [4, 10], [5, 9], [6, 8], [7, 7], [8, 6], [9, 5], [10, 4], [11, 3],
  ];
  for (const [x, y] of positions) {
    setPixel(img, x, y, stickColor);
    setPixel(img, x + 1, y, lightColor);
    setPixel(img, x, y + 1, darkColor);
  }
  // End caps
  setPixel(img, 2, 12, darkColor);
  setPixel(img, 3, 12, stickColor);
  setPixel(img, 12, 2, stickColor);
  setPixel(img, 13, 2, lightColor);
  return img;
}

function texCoal(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  // Black lump with highlights
  const black = hexToRgb("#1a1a1a");
  const dark = hexToRgb("#0a0a0a");
  const highlight = hexToRgb("#3a3a3a");
  // Main lump (rounded)
  fillRect(img, 4, 5, 8, 7, black);
  fillRect(img, 5, 4, 6, 1, black);
  fillRect(img, 5, 12, 6, 1, black);
  fillRect(img, 3, 6, 1, 5, black);
  fillRect(img, 12, 6, 1, 5, black);
  // Highlights
  setPixel(img, 5, 6, highlight);
  setPixel(img, 6, 5, highlight);
  setPixel(img, 7, 6, highlight);
  // Dark spots
  setPixel(img, 8, 9, dark);
  setPixel(img, 9, 10, dark);
  setPixel(img, 10, 8, dark);
  return img;
}

function texCharcoal(): ImageData {
  const img = texCoal();
  // Slightly different - more brownish
  const brown = hexToRgb("#3a2a1a");
  setPixel(img, 6, 8, brown);
  setPixel(img, 9, 7, brown);
  return img;
}

function texIronIngot(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const iron = hexToRgb("#d8d8d8");
  const light = hexToRgb("#f0f0f0");
  const dark = hexToRgb("#a0a0a0");
  const shadow = hexToRgb("#707070");
  // Ingot shape (trapezoid)
  // Top row (narrower)
  fillRect(img, 5, 5, 6, 1, iron);
  fillRect(img, 4, 6, 8, 1, iron);
  fillRect(img, 4, 7, 8, 3, iron);
  fillRect(img, 4, 10, 8, 1, iron);
  fillRect(img, 5, 11, 6, 1, iron);
  // Highlight on top
  fillRect(img, 5, 5, 6, 1, light);
  setPixel(img, 6, 6, light);
  setPixel(img, 7, 6, light);
  // Shadow on bottom
  fillRect(img, 5, 11, 6, 1, dark);
  setPixel(img, 4, 10, shadow);
  setPixel(img, 11, 10, shadow);
  return img;
}

function texGoldIngot(): ImageData {
  const img = texIronIngot();
  // Recolor to gold
  const gold = hexToRgb("#f7d046");
  const lightGold = hexToRgb("#ffe87a");
  const darkGold = hexToRgb("#c9a020");
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i = (y * TEX_SIZE + x) * 4;
      if (img.data[i + 3] > 0) {
        if (img.data[i] > 230 && img.data[i + 1] > 230) {
          // Light pixel
          setPixel(img, x, y, lightGold);
        } else if (img.data[i] < 180) {
          setPixel(img, x, y, darkGold);
        } else {
          setPixel(img, x, y, gold);
        }
      }
    }
  }
  return img;
}

function texDiamond(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const dia = hexToRgb("#5edcdc");
  const light = hexToRgb("#a0f0f0");
  const dark = hexToRgb("#2a9a9a");
  // Diamond gem shape
  setPixel(img, 8, 3, dia);
  fillRect(img, 7, 4, 3, 1, dia);
  fillRect(img, 6, 5, 5, 1, dia);
  fillRect(img, 5, 6, 7, 1, dia);
  fillRect(img, 4, 7, 9, 2, dia);
  fillRect(img, 5, 9, 7, 1, dia);
  fillRect(img, 6, 10, 5, 1, dia);
  fillRect(img, 7, 11, 3, 1, dia);
  setPixel(img, 8, 12, dia);
  // Highlights
  setPixel(img, 7, 5, light);
  setPixel(img, 6, 6, light);
  setPixel(img, 5, 7, light);
  // Shadows
  setPixel(img, 10, 9, dark);
  setPixel(img, 11, 8, dark);
  setPixel(img, 9, 11, dark);
  return img;
}

// ============================================================
// FOOD
// ============================================================

function texApple(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const red = hexToRgb("#d32f2f");
  const darkRed = hexToRgb("#8b1a1a");
  const lightRed = hexToRgb("#ef5350");
  const brown = hexToRgb("#5d4037");
  const green = hexToRgb("#388e3c");
  // Apple body (round)
  fillRect(img, 5, 5, 6, 7, red);
  fillRect(img, 4, 6, 1, 5, red);
  fillRect(img, 11, 6, 1, 5, red);
  fillRect(img, 5, 12, 6, 1, red);
  fillRect(img, 6, 4, 4, 1, red);
  // Highlight
  setPixel(img, 6, 6, lightRed);
  setPixel(img, 7, 6, lightRed);
  setPixel(img, 6, 7, lightRed);
  // Shadow
  fillRect(img, 9, 10, 2, 2, darkRed);
  setPixel(img, 10, 8, darkRed);
  // Stem
  setPixel(img, 8, 3, brown);
  setPixel(img, 8, 4, brown);
  // Leaf
  setPixel(img, 9, 3, green);
  setPixel(img, 10, 3, green);
  setPixel(img, 9, 4, green);
  return img;
}

function texRawPorkchop(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const pink = hexToRgb("#e89b9b");
  const lightPink = hexToRgb("#f5b8b8");
  const darkPink = hexToRgb("#c47878");
  const white = hexToRgb("#fafafa");
  // Meat shape (oval)
  fillRect(img, 4, 5, 8, 7, pink);
  fillRect(img, 5, 4, 6, 1, pink);
  fillRect(img, 5, 12, 6, 1, pink);
  fillRect(img, 3, 6, 1, 5, pink);
  fillRect(img, 12, 6, 1, 5, pink);
  // Bone (white) at top
  fillRect(img, 6, 3, 4, 2, white);
  setPixel(img, 5, 3, white);
  setPixel(img, 10, 3, white);
  setPixel(img, 5, 4, white);
  setPixel(img, 10, 4, white);
  // Highlights
  fillRect(img, 5, 6, 2, 2, lightPink);
  // Shadows
  fillRect(img, 9, 10, 2, 2, darkPink);
  return img;
}

function texCookedPorkchop(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const brown = hexToRgb("#8b4513");
  const lightBrown = hexToRgb("#a0651e");
  const darkBrown = hexToRgb("#5d2f0a");
  const white = hexToRgb("#fafafa");
  // Meat shape (oval, browned)
  fillRect(img, 4, 5, 8, 7, brown);
  fillRect(img, 5, 4, 6, 1, brown);
  fillRect(img, 5, 12, 6, 1, brown);
  fillRect(img, 3, 6, 1, 5, brown);
  fillRect(img, 12, 6, 1, 5, brown);
  // Bone
  fillRect(img, 6, 3, 4, 2, white);
  setPixel(img, 5, 3, white);
  setPixel(img, 10, 3, white);
  // Highlights (browned top)
  fillRect(img, 5, 5, 6, 1, lightBrown);
  setPixel(img, 6, 6, lightBrown);
  // Dark spots (char)
  setPixel(img, 8, 8, darkBrown);
  setPixel(img, 10, 10, darkBrown);
  setPixel(img, 7, 11, darkBrown);
  return img;
}

function texRawBeef(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const red = hexToRgb("#b71c1c");
  const lightRed = hexToRgb("#d32f2f");
  const darkRed = hexToRgb("#7f0000");
  const white = hexToRgb("#f5f5dc");
  // Steak shape (more rectangular)
  fillRect(img, 4, 5, 9, 7, red);
  fillRect(img, 5, 4, 7, 1, red);
  fillRect(img, 5, 12, 7, 1, red);
  // Fat marbling (white streaks)
  setPixel(img, 6, 6, white);
  setPixel(img, 7, 6, white);
  setPixel(img, 9, 8, white);
  setPixel(img, 10, 8, white);
  setPixel(img, 7, 10, white);
  setPixel(img, 8, 10, white);
  setPixel(img, 11, 6, white);
  // Highlights
  setPixel(img, 5, 5, lightRed);
  setPixel(img, 6, 5, lightRed);
  // Shadows
  setPixel(img, 11, 11, darkRed);
  setPixel(img, 10, 12, darkRed);
  return img;
}

function texCookedBeef(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const brown = hexToRgb("#6b3410");
  const darkBrown = hexToRgb("#3d1f08");
  const lightBrown = hexToRgb("#8b5a2b");
  const white = hexToRgb("#e8d8b0");
  // Steak shape, cooked
  fillRect(img, 4, 5, 9, 7, brown);
  fillRect(img, 5, 4, 7, 1, brown);
  fillRect(img, 5, 12, 7, 1, brown);
  // Fat marbling
  setPixel(img, 6, 6, white);
  setPixel(img, 7, 6, white);
  setPixel(img, 9, 8, white);
  setPixel(img, 7, 10, white);
  // Highlights
  setPixel(img, 5, 5, lightBrown);
  setPixel(img, 6, 5, lightBrown);
  // Char
  setPixel(img, 10, 11, darkBrown);
  setPixel(img, 11, 9, darkBrown);
  return img;
}

function texRawChicken(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const pink = hexToRgb("#f8bbd0");
  const lightPink = hexToRgb("#fce4ec");
  const darkPink = hexToRgb("#e91e63");
  const white = hexToRgb("#fafafa");
  // Chicken leg shape
  fillRect(img, 5, 6, 6, 6, pink);
  fillRect(img, 6, 5, 4, 1, pink);
  fillRect(img, 6, 12, 4, 1, pink);
  // Bone
  fillRect(img, 7, 2, 2, 4, white);
  setPixel(img, 6, 3, white);
  setPixel(img, 9, 3, white);
  setPixel(img, 6, 4, white);
  setPixel(img, 9, 4, white);
  // Highlights
  setPixel(img, 6, 7, lightPink);
  setPixel(img, 7, 7, lightPink);
  // Shadow
  setPixel(img, 9, 10, darkPink);
  setPixel(img, 10, 9, darkPink);
  return img;
}

function texCookedChicken(): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  const golden = hexToRgb("#daa520");
  const lightGolden = hexToRgb("#ffd700");
  const darkGolden = hexToRgb("#8b6914");
  const white = hexToRgb("#fafafa");
  // Chicken leg, golden
  fillRect(img, 5, 6, 6, 6, golden);
  fillRect(img, 6, 5, 4, 1, golden);
  fillRect(img, 6, 12, 4, 1, golden);
  // Bone
  fillRect(img, 7, 2, 2, 4, white);
  setPixel(img, 6, 3, white);
  setPixel(img, 9, 3, white);
  setPixel(img, 6, 4, white);
  setPixel(img, 9, 4, white);
  // Highlights
  setPixel(img, 6, 7, lightGolden);
  setPixel(img, 7, 7, lightGolden);
  // Char
  setPixel(img, 9, 10, darkGolden);
  setPixel(img, 10, 9, darkGolden);
  return img;
}

// ============================================================
// TOOLS
// ============================================================

// Helper to draw a tool head (the part that's not the stick)
function drawToolHead(img: ImageData, headColor: [number, number, number], lightColor: [number, number, number], darkColor: [number, number, number], type: "pickaxe" | "axe" | "sword" | "shovel") {
  if (type === "pickaxe") {
    // Pickaxe head: top row curved
    fillRect(img, 3, 3, 10, 1, headColor);
    setPixel(img, 4, 4, headColor);
    setPixel(img, 7, 4, headColor);
    setPixel(img, 11, 4, headColor);
    // Highlight
    setPixel(img, 4, 3, lightColor);
    setPixel(img, 5, 3, lightColor);
    setPixel(img, 6, 3, lightColor);
    // Shadow
    setPixel(img, 11, 3, darkColor);
    setPixel(img, 12, 3, darkColor);
  } else if (type === "axe") {
    // Axe head: L-shape on top-right
    fillRect(img, 7, 3, 5, 5, headColor);
    setPixel(img, 6, 4, headColor);
    setPixel(img, 6, 5, headColor);
    setPixel(img, 12, 4, headColor);
    setPixel(img, 12, 5, headColor);
    // Highlight
    setPixel(img, 8, 4, lightColor);
    setPixel(img, 8, 5, lightColor);
    // Shadow
    setPixel(img, 11, 7, darkColor);
    setPixel(img, 10, 7, darkColor);
  } else if (type === "sword") {
    // Sword blade: vertical
    fillRect(img, 7, 2, 2, 8, headColor);
    // Blade tip
    setPixel(img, 8, 1, headColor);
    // Highlight
    setPixel(img, 7, 3, lightColor);
    setPixel(img, 7, 4, lightColor);
    setPixel(img, 7, 5, lightColor);
    // Shadow
    setPixel(img, 8, 8, darkColor);
    setPixel(img, 8, 9, darkColor);
    // Guard (cross)
    fillRect(img, 5, 9, 6, 1, hexToRgb("#5d4037"));
    setPixel(img, 6, 10, hexToRgb("#5d4037"));
    setPixel(img, 9, 10, hexToRgb("#5d4037"));
  } else if (type === "shovel") {
    // Shovel head: square on top
    fillRect(img, 6, 3, 4, 4, headColor);
    setPixel(img, 7, 2, headColor);
    setPixel(img, 8, 2, headColor);
    // Highlight
    setPixel(img, 7, 4, lightColor);
    setPixel(img, 7, 5, lightColor);
    // Shadow
    setPixel(img, 9, 6, darkColor);
    setPixel(img, 9, 5, darkColor);
  }
}

function drawStick(img: ImageData) {
  const stickColor = hexToRgb("#9c6f3a");
  const darkStick = hexToRgb("#6e4d28");
  const lightStick = hexToRgb("#b08850");
  // Vertical stick (handle) - diagonal from top-right to bottom-left
  const positions = [
    [8, 8], [8, 9], [8, 10], [8, 11], [8, 12],
    [7, 13], [7, 14],
  ];
  for (const [x, y] of positions) {
    setPixel(img, x, y, stickColor);
    setPixel(img, x + 1, y, lightStick);
    setPixel(img, x, y + 1, darkStick);
  }
}

function makeTool(headColor: [number, number, number], lightColor: [number, number, number], darkColor: [number, number, number], type: "pickaxe" | "axe" | "sword" | "shovel"): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  clearTransparent(img);
  drawToolHead(img, headColor, lightColor, darkColor, type);
  drawStick(img);
  return img;
}

// Wood tools (brown head)
function texWoodPickaxe(): ImageData { return makeTool(hexToRgb("#a07640"), hexToRgb("#c89a60"), hexToRgb("#6e4d28"), "pickaxe"); }
function texWoodAxe(): ImageData { return makeTool(hexToRgb("#a07640"), hexToRgb("#c89a60"), hexToRgb("#6e4d28"), "axe"); }
function texWoodSword(): ImageData { return makeTool(hexToRgb("#a07640"), hexToRgb("#c89a60"), hexToRgb("#6e4d28"), "sword"); }
function texWoodShovel(): ImageData { return makeTool(hexToRgb("#a07640"), hexToRgb("#c89a60"), hexToRgb("#6e4d28"), "shovel"); }

// Stone tools (gray head)
function texStonePickaxe(): ImageData { return makeTool(hexToRgb("#7d7d7d"), hexToRgb("#a0a0a0"), hexToRgb("#5a5a5a"), "pickaxe"); }
function texStoneAxe(): ImageData { return makeTool(hexToRgb("#7d7d7d"), hexToRgb("#a0a0a0"), hexToRgb("#5a5a5a"), "axe"); }
function texStoneSword(): ImageData { return makeTool(hexToRgb("#7d7d7d"), hexToRgb("#a0a0a0"), hexToRgb("#5a5a5a"), "sword"); }
function texStoneShovel(): ImageData { return makeTool(hexToRgb("#7d7d7d"), hexToRgb("#a0a0a0"), hexToRgb("#5a5a5a"), "shovel"); }

// Iron tools (light gray head)
function texIronPickaxe(): ImageData { return makeTool(hexToRgb("#d8d8d8"), hexToRgb("#f0f0f0"), hexToRgb("#a0a0a0"), "pickaxe"); }
function texIronAxe(): ImageData { return makeTool(hexToRgb("#d8d8d8"), hexToRgb("#f0f0f0"), hexToRgb("#a0a0a0"), "axe"); }
function texIronSword(): ImageData { return makeTool(hexToRgb("#d8d8d8"), hexToRgb("#f0f0f0"), hexToRgb("#a0a0a0"), "sword"); }
function texIronShovel(): ImageData { return makeTool(hexToRgb("#d8d8d8"), hexToRgb("#f0f0f0"), hexToRgb("#a0a0a0"), "shovel"); }

// Diamond tools (cyan head)
function texDiamondPickaxe(): ImageData { return makeTool(hexToRgb("#5edcdc"), hexToRgb("#a0f0f0"), hexToRgb("#2a9a9a"), "pickaxe"); }
function texDiamondAxe(): ImageData { return makeTool(hexToRgb("#5edcdc"), hexToRgb("#a0f0f0"), hexToRgb("#2a9a9a"), "axe"); }
function texDiamondSword(): ImageData { return makeTool(hexToRgb("#5edcdc"), hexToRgb("#a0f0f0"), hexToRgb("#2a9a9a"), "sword"); }
function texDiamondShovel(): ImageData { return makeTool(hexToRgb("#5edcdc"), hexToRgb("#a0f0f0"), hexToRgb("#2a9a9a"), "shovel"); }

// ============================================================
// EXPORT
// ============================================================

export function buildItemCanvases(): Record<string, HTMLCanvasElement> {
  return {
    stick: imageDataToCanvas(texStick()),
    coal: imageDataToCanvas(texCoal()),
    charcoal: imageDataToCanvas(texCharcoal()),
    iron_ingot: imageDataToCanvas(texIronIngot()),
    gold_ingot: imageDataToCanvas(texGoldIngot()),
    diamond: imageDataToCanvas(texDiamond()),
    apple: imageDataToCanvas(texApple()),
    raw_porkchop: imageDataToCanvas(texRawPorkchop()),
    cooked_porkchop: imageDataToCanvas(texCookedPorkchop()),
    raw_beef: imageDataToCanvas(texRawBeef()),
    cooked_beef: imageDataToCanvas(texCookedBeef()),
    raw_chicken: imageDataToCanvas(texRawChicken()),
    cooked_chicken: imageDataToCanvas(texCookedChicken()),
    wood_pickaxe: imageDataToCanvas(texWoodPickaxe()),
    wood_axe: imageDataToCanvas(texWoodAxe()),
    wood_sword: imageDataToCanvas(texWoodSword()),
    wood_shovel: imageDataToCanvas(texWoodShovel()),
    stone_pickaxe: imageDataToCanvas(texStonePickaxe()),
    stone_axe: imageDataToCanvas(texStoneAxe()),
    stone_sword: imageDataToCanvas(texStoneSword()),
    stone_shovel: imageDataToCanvas(texStoneShovel()),
    iron_pickaxe: imageDataToCanvas(texIronPickaxe()),
    iron_axe: imageDataToCanvas(texIronAxe()),
    iron_sword: imageDataToCanvas(texIronSword()),
    iron_shovel: imageDataToCanvas(texIronShovel()),
    diamond_pickaxe: imageDataToCanvas(texDiamondPickaxe()),
    diamond_axe: imageDataToCanvas(texDiamondAxe()),
    diamond_sword: imageDataToCanvas(texDiamondSword()),
    diamond_shovel: imageDataToCanvas(texDiamondShovel()),
  };
}
