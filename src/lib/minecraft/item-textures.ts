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
  // Tool heads are drawn in the TOP HALF of the 16x16 texture (Y 0-8).
  // Handle is drawn separately by drawStick() in the BOTTOM HALF (Y 8-15).
  if (type === "pickaxe") {
    // Pickaxe head: a curved horizontal bar with pointed ends (like a real pickaxe)
    // Top row (curved arc)
    fillRect(img, 2, 3, 12, 1, headColor);
    fillRect(img, 3, 2, 10, 1, headColor);
    // Pointed ends (curving down)
    setPixel(img, 2, 4, headColor);
    setPixel(img, 13, 4, headColor);
    setPixel(img, 1, 4, darkColor);
    setPixel(img, 14, 4, darkColor);
    setPixel(img, 1, 5, darkColor);
    setPixel(img, 14, 5, darkColor);
    // Highlight on top-left of the bar
    fillRect(img, 3, 2, 4, 1, lightColor);
    setPixel(img, 4, 3, lightColor);
    setPixel(img, 5, 3, lightColor);
    // Shadow on bottom-right
    setPixel(img, 11, 3, darkColor);
    setPixel(img, 12, 3, darkColor);
    setPixel(img, 10, 4, darkColor);
  } else if (type === "axe") {
    // Axe head: L-shape block on the right side of the handle
    // Main head block
    fillRect(img, 7, 2, 6, 5, headColor);
    // Extra bulk on the left (where it meets handle)
    setPixel(img, 6, 3, headColor);
    setPixel(img, 6, 4, headColor);
    // Blade edge (right side, lighter for sharp look)
    fillRect(img, 12, 2, 1, 5, lightColor);
    setPixel(img, 13, 3, lightColor);
    setPixel(img, 13, 4, lightColor);
    // Highlight on top
    fillRect(img, 7, 2, 5, 1, lightColor);
    // Shadow on bottom
    fillRect(img, 7, 6, 6, 1, darkColor);
    setPixel(img, 6, 5, darkColor);
  } else if (type === "sword") {
    // Sword blade: vertical, pointing up
    fillRect(img, 7, 2, 2, 7, headColor);
    // Blade tip (pointed)
    setPixel(img, 7, 1, headColor);
    setPixel(img, 8, 1, headColor);
    setPixel(img, 8, 0, lightColor);
    // Highlight on left edge of blade
    fillRect(img, 7, 2, 1, 7, lightColor);
    setPixel(img, 7, 1, lightColor);
    // Shadow on right edge
    fillRect(img, 8, 3, 1, 6, darkColor);
    setPixel(img, 8, 2, darkColor);
    // Crossguard (horizontal bar)
    fillRect(img, 5, 9, 6, 1, hexToRgb("#6e4d28"));
    setPixel(img, 4, 9, hexToRgb("#5d4037"));
    setPixel(img, 11, 9, hexToRgb("#5d4037"));
    setPixel(img, 5, 10, hexToRgb("#5d4037"));
    setPixel(img, 10, 10, hexToRgb("#5d4037"));
  } else if (type === "shovel") {
    // Shovel head: a rounded square/spade on top of handle
    fillRect(img, 6, 3, 5, 5, headColor);
    // Top rounded
    setPixel(img, 7, 2, headColor);
    setPixel(img, 8, 2, headColor);
    setPixel(img, 9, 2, headColor);
    // Bottom point (spade shape)
    setPixel(img, 8, 8, headColor);
    setPixel(img, 8, 9, darkColor);
    // Highlight on top-left
    fillRect(img, 7, 3, 2, 1, lightColor);
    setPixel(img, 6, 4, lightColor);
    setPixel(img, 6, 5, lightColor);
    // Shadow on right
    fillRect(img, 10, 4, 1, 4, darkColor);
    setPixel(img, 9, 7, darkColor);
  }
}

function drawStick(img: ImageData) {
  const stickColor = hexToRgb("#9c6f3a");
  const darkStick = hexToRgb("#6e4d28");
  const lightStick = hexToRgb("#b08850");
  // Vertical handle: 2px wide, diagonal from top-center to bottom-left
  const positions = [
    [8, 8], [8, 9], [8, 10], [8, 11],
    [7, 12], [7, 13], [7, 14],
  ];
  for (const [x, y] of positions) {
    setPixel(img, x, y, stickColor);
    setPixel(img, x + 1, y, lightStick);
    setPixel(img, x, y + 1, darkStick);
    setPixel(img, x + 1, y + 1, darkStick);
  }
  // Handle end cap (bottom)
  setPixel(img, 6, 14, darkStick);
  setPixel(img, 7, 15, darkStick);
  setPixel(img, 8, 15, darkStick);
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

// Gold tools (golden head)
function texGoldPickaxe(): ImageData { return makeTool(hexToRgb("#f7d046"), hexToRgb("#ffe87a"), hexToRgb("#c9a020"), "pickaxe"); }
function texGoldAxe(): ImageData { return makeTool(hexToRgb("#f7d046"), hexToRgb("#ffe87a"), hexToRgb("#c9a020"), "axe"); }
function texGoldSword(): ImageData { return makeTool(hexToRgb("#f7d046"), hexToRgb("#ffe87a"), hexToRgb("#c9a020"), "sword"); }
function texGoldShovel(): ImageData { return makeTool(hexToRgb("#f7d046"), hexToRgb("#ffe87a"), hexToRgb("#c9a020"), "shovel"); }

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
    gold_pickaxe: imageDataToCanvas(texGoldPickaxe()),
    gold_axe: imageDataToCanvas(texGoldAxe()),
    gold_sword: imageDataToCanvas(texGoldSword()),
    gold_shovel: imageDataToCanvas(texGoldShovel()),
    // Leather ingot
    leather: imageDataToCanvas(makeIngot(0x8b5a2b, 0xe89a55, 0x8a4a1a)),
    // Armor - simple colored shapes
    leather_helmet: imageDataToCanvas(makeArmor(0x8b5a2b, "helmet")),
    leather_chestplate: imageDataToCanvas(makeArmor(0x8b5a2b, "chestplate")),
    leather_leggings: imageDataToCanvas(makeArmor(0x8b5a2b, "leggings")),
    leather_boots: imageDataToCanvas(makeArmor(0x8b5a2b, "boots")),
    iron_helmet: imageDataToCanvas(makeArmor(0xd8d8d8, "helmet")),
    iron_chestplate: imageDataToCanvas(makeArmor(0xd8d8d8, "chestplate")),
    iron_leggings: imageDataToCanvas(makeArmor(0xd8d8d8, "leggings")),
    iron_boots: imageDataToCanvas(makeArmor(0xd8d8d8, "boots")),
    diamond_helmet: imageDataToCanvas(makeArmor(0x5edcdc, "helmet")),
    diamond_chestplate: imageDataToCanvas(makeArmor(0x5edcdc, "chestplate")),
    diamond_leggings: imageDataToCanvas(makeArmor(0x5edcdc, "leggings")),
    diamond_boots: imageDataToCanvas(makeArmor(0x5edcdc, "boots")),
    // Dragon egg (special item)
    dragon_egg: imageDataToCanvas(texDragonEgg()),
    // Nether / End items
    ender_eye: imageDataToCanvas(texEnderEye()),
    flint_and_steel: imageDataToCanvas(texFlintAndSteel()),
    blaze_rod: imageDataToCanvas(texBlazeRod()),
    // === New item textures (were using wrong placeholders before) ===
    ender_pearl: imageDataToCanvas(texEnderPearl()),
    bow: imageDataToCanvas(texBow()),
    arrow: imageDataToCanvas(texArrow()),
    bucket: imageDataToCanvas(texBucket()),
    water_bucket: imageDataToCanvas(texWaterBucket()),
    wheat: imageDataToCanvas(texWheat()),
    seeds: imageDataToCanvas(texSeeds()),
    sugar: imageDataToCanvas(texSugar()),
    flint: imageDataToCanvas(texFlint()),
    feather: imageDataToCanvas(texFeather()),
    string: imageDataToCanvas(texString()),
    clay: imageDataToCanvas(texClay()),
    iron_block: imageDataToCanvas(texIronBlock()),
    gold_block: imageDataToCanvas(texGoldBlock()),
    diamond_block: imageDataToCanvas(texDiamondBlock()),
    // === New block textures ===
    door_top: imageDataToCanvas(texDoorTop()),
    door_bottom: imageDataToCanvas(texDoorBottom()),
    door_side: imageDataToCanvas(texDoorSide()),
    sign_side: imageDataToCanvas(texSignSide()),
    stone_bricks: imageDataToCanvas(texStoneBricks()),
    stone_slab: imageDataToCanvas(texStoneSlab()),
    fence: imageDataToCanvas(texFence()),
    bed_top: imageDataToCanvas(texBedTop()),
    bed_side: imageDataToCanvas(texBedSide()),
    ladder: imageDataToCanvas(texLadder()),
    anvil_top: imageDataToCanvas(texAnvilTop()),
    anvil_side: imageDataToCanvas(texAnvilSide()),
  };
}

// === New item texture generators ===

// Ender Pearl: green-cyan pearl with swirl
function texEnderPearl(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const teal = hexToRgb("#1a8a7a");
  const light = hexToRgb("#3accaa");
  const dark = hexToRgb("#0a4a3a");
  // Circle (pearl)
  fillRect(img, 5, 4, 6, 8, teal);
  fillRect(img, 4, 5, 8, 6, teal);
  fillRect(img, 6, 3, 4, 1, teal);
  fillRect(img, 6, 12, 4, 1, teal);
  // Highlight (top-left)
  fillRect(img, 5, 5, 2, 2, light);
  setPixel(img, 6, 6, light);
  // Dark swirl (bottom-right)
  fillRect(img, 9, 9, 2, 2, dark);
  setPixel(img, 8, 10, dark);
  setPixel(img, 10, 8, dark);
  return img;
}

// Bow: curved bow with string
function texBow(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wood = hexToRgb("#8b6638");
  const woodLight = hexToRgb("#a87038");
  const string = hexToRgb("#ddd8c8");
  // Bow curve (left side, vertical)
  for (let y = 2; y < 14; y++) {
    setPixel(img, 3, y, wood);
    if (y > 3 && y < 12) setPixel(img, 2, y, woodLight);
  }
  // Top and bottom tips
  setPixel(img, 4, 2, wood);
  setPixel(img, 4, 13, wood);
  setPixel(img, 5, 2, wood);
  setPixel(img, 5, 13, wood);
  // String (right side, vertical line)
  for (let y = 3; y < 13; y++) {
    setPixel(img, 10, y, string);
  }
  // Top and bottom string connections
  setPixel(img, 9, 3, string);
  setPixel(img, 9, 12, string);
  // Arrow nock (center)
  setPixel(img, 11, 7, wood);
  setPixel(img, 11, 8, wood);
  return img;
}

// Arrow: shaft with arrowhead and fletching
function texArrow(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const shaft = hexToRgb("#a87038");
  const head = hexToRgb("#d8d8d8");
  const headLight = hexToRgb("#f0f0f0");
  const fletch = hexToRgb("#dddddd");
  const fletchDark = hexToRgb("#888888");
  // Shaft (diagonal from bottom-left to top-right)
  for (let i = 0; i < 8; i++) {
    setPixel(img, 3 + i, 12 - i, shaft);
  }
  // Arrowhead (top-right)
  setPixel(img, 11, 4, head);
  setPixel(img, 12, 3, head);
  setPixel(img, 12, 4, headLight);
  setPixel(img, 13, 2, headLight);
  // Fletching (bottom-left, 3 feathers)
  setPixel(img, 2, 13, fletch);
  setPixel(img, 2, 14, fletchDark);
  setPixel(img, 3, 14, fletch);
  setPixel(img, 1, 12, fletch);
  setPixel(img, 1, 13, fletchDark);
  return img;
}

// Bucket: iron bucket with handle
function texBucket(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const iron = hexToRgb("#c8c8c8");
  const ironLight = hexToRgb("#e8e8e8");
  const ironDark = hexToRgb("#787878");
  // Bucket body (trapezoid)
  fillRect(img, 4, 5, 8, 9, iron);
  fillRect(img, 5, 14, 6, 1, iron);
  // Highlights (left side)
  fillRect(img, 4, 6, 1, 7, ironLight);
  // Shadow (right side)
  fillRect(img, 11, 6, 1, 7, ironDark);
  // Top rim
  fillRect(img, 3, 4, 10, 1, iron);
  fillRect(img, 3, 4, 10, 1, ironDark);
  // Handle (arc on top)
  setPixel(img, 5, 3, iron);
  setPixel(img, 6, 2, iron);
  setPixel(img, 9, 2, iron);
  setPixel(img, 10, 3, iron);
  return img;
}

// Water Bucket: bucket with water on top
function texWaterBucket(): ImageData {
  const img = texBucket();
  const water = hexToRgb("#3060d8");
  const waterLight = hexToRgb("#5080f0");
  // Water inside top of bucket
  fillRect(img, 4, 5, 8, 2, water);
  fillRect(img, 4, 5, 8, 1, waterLight);
  return img;
}

// Wheat: golden wheat stalk with grains
function texWheat(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wheat = hexToRgb("#d8b830");
  const wheatLight = hexToRgb("#f0d850");
  const wheatDark = hexToRgb("#a88810");
  const stem = hexToRgb("#8aa030");
  // Stem (vertical center)
  fillRect(img, 7, 8, 1, 6, stem);
  fillRect(img, 8, 9, 1, 5, stem);
  // Wheat head (top, grains)
  fillRect(img, 6, 2, 4, 6, wheat);
  fillRect(img, 5, 3, 1, 4, wheat);
  fillRect(img, 11, 3, 1, 4, wheat);
  // Highlights
  fillRect(img, 6, 3, 1, 4, wheatLight);
  fillRect(img, 9, 3, 1, 4, wheatLight);
  // Dark accents
  setPixel(img, 7, 4, wheatDark);
  setPixel(img, 8, 6, wheatDark);
  return img;
}

// Seeds: small brown seeds
function texSeeds(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const seed = hexToRgb("#a88830");
  const seedLight = hexToRgb("#c8a850");
  const seedDark = hexToRgb("#685020");
  // Cluster of seeds
  const positions = [
    [4, 5], [6, 4], [8, 5], [10, 4], [12, 5],
    [5, 7], [7, 8], [9, 7], [11, 8],
    [4, 10], [6, 11], [8, 10], [10, 11], [12, 10],
  ];
  for (const [x, y] of positions) {
    setPixel(img, x, y, seed);
    setPixel(img, x + 1, y, seedLight);
    setPixel(img, x, y + 1, seedDark);
  }
  return img;
}

// Sugar: white powder pile
function texSugar(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const white = hexToRgb("#f8f8f8");
  const light = hexToRgb("#ffffff");
  const shadow = hexToRgb("#c0c0c0");
  // Pile shape (triangle/mound)
  fillRect(img, 6, 10, 4, 2, white);
  fillRect(img, 5, 9, 6, 1, white);
  fillRect(img, 4, 8, 8, 1, white);
  fillRect(img, 5, 7, 6, 1, white);
  fillRect(img, 6, 6, 4, 1, white);
  fillRect(img, 7, 5, 2, 1, white);
  // Highlight
  fillRect(img, 6, 7, 2, 1, light);
  setPixel(img, 7, 6, light);
  // Shadow at base
  fillRect(img, 4, 11, 8, 1, shadow);
  return img;
}

// Flint: dark gray sharp stone
function texFlint(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const dark = hexToRgb("#383838");
  const mid = hexToRgb("#585858");
  const light = hexToRgb("#787878");
  // Flint shape (irregular shard)
  fillRect(img, 5, 5, 6, 6, dark);
  fillRect(img, 4, 6, 8, 4, dark);
  fillRect(img, 6, 4, 4, 8, dark);
  // Highlights
  fillRect(img, 5, 5, 2, 2, light);
  setPixel(img, 6, 6, light);
  fillRect(img, 4, 7, 1, 2, mid);
  // Sharp edge
  setPixel(img, 11, 6, light);
  setPixel(img, 10, 10, light);
  return img;
}

// Feather: white feather with spine
function texFeather(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const white = hexToRgb("#f0f0f0");
  const light = hexToRgb("#ffffff");
  const dark = hexToRgb("#a0a0a0");
  const spine = hexToRgb("#888888");
  // Feather shape (curved, diagonal)
  for (let i = 0; i < 10; i++) {
    const x = 3 + i;
    const y = 12 - i;
    setPixel(img, x, y, white);
    setPixel(img, x + 1, y, white);
    setPixel(img, x, y - 1, white);
  }
  // Spine (central line)
  for (let i = 0; i < 10; i++) {
    setPixel(img, 3 + i, 12 - i, spine);
  }
  // Barbs (perpendicular lines)
  for (let i = 1; i < 9; i++) {
    const x = 3 + i;
    const y = 12 - i;
    setPixel(img, x + 1, y - 1, light);
    setPixel(img, x - 1, y + 1, dark);
  }
  // Tip
  setPixel(img, 12, 3, white);
  return img;
}

// String: white coiled string
function texString(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const white = hexToRgb("#f0f0f0");
  const light = hexToRgb("#ffffff");
  const dark = hexToRgb("#a0a0a0");
  // Coiled string (S-shape)
  // Top curve
  for (let x = 4; x < 12; x++) setPixel(img, x, 4, white);
  // Down stroke
  for (let y = 4; y < 12; y++) setPixel(img, 11, y, white);
  // Bottom curve
  for (let x = 4; x < 12; x++) setPixel(img, x, 11, white);
  // Up stroke
  for (let y = 4; y < 12; y++) setPixel(img, 4, y, white);
  // Highlights
  for (let x = 5; x < 11; x++) setPixel(img, x, 3, light);
  setPixel(img, 10, 5, light);
  // Shadow
  for (let x = 5; x < 11; x++) setPixel(img, x, 12, dark);
  setPixel(img, 5, 10, dark);
  return img;
}

// Clay: gray clay ball
function texClay(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const clay = hexToRgb("#a8a8b8");
  const light = hexToRgb("#c8c8d8");
  const dark = hexToRgb("#787888");
  // Circle (ball)
  fillRect(img, 5, 4, 6, 8, clay);
  fillRect(img, 4, 5, 8, 6, clay);
  fillRect(img, 6, 3, 4, 1, clay);
  fillRect(img, 6, 12, 4, 1, clay);
  // Highlight
  fillRect(img, 5, 5, 2, 2, light);
  // Shadow
  fillRect(img, 10, 10, 2, 2, dark);
  setPixel(img, 9, 11, dark);
  return img;
}

// Iron Block: metallic block with rivets
function texIronBlock(): ImageData {
  const img = new ImageData(16, 16);
  const iron = hexToRgb("#d8d8d8");
  const ironLight = hexToRgb("#f0f0f0");
  const ironDark = hexToRgb("#a0a0a0");
  fillRect(img, 0, 0, 16, 16, iron);
  // Border (darker edges)
  fillRect(img, 0, 0, 16, 1, ironDark);
  fillRect(img, 0, 15, 16, 1, ironDark);
  fillRect(img, 0, 0, 1, 16, ironDark);
  fillRect(img, 15, 0, 1, 16, ironDark);
  // Highlights (top-left)
  fillRect(img, 1, 1, 14, 1, ironLight);
  fillRect(img, 1, 1, 1, 14, ironLight);
  // Rivets (corners)
  setPixel(img, 3, 3, ironDark);
  setPixel(img, 12, 3, ironDark);
  setPixel(img, 3, 12, ironDark);
  setPixel(img, 12, 12, ironDark);
  return img;
}

// Gold Block: golden block with rivets
function texGoldBlock(): ImageData {
  const img = new ImageData(16, 16);
  const gold = hexToRgb("#f7d046");
  const goldLight = hexToRgb("#ffe87a");
  const goldDark = hexToRgb("#c9a020");
  fillRect(img, 0, 0, 16, 16, gold);
  fillRect(img, 0, 0, 16, 1, goldDark);
  fillRect(img, 0, 15, 16, 1, goldDark);
  fillRect(img, 0, 0, 1, 16, goldDark);
  fillRect(img, 15, 0, 1, 16, goldDark);
  fillRect(img, 1, 1, 14, 1, goldLight);
  fillRect(img, 1, 1, 1, 14, goldLight);
  setPixel(img, 3, 3, goldDark);
  setPixel(img, 12, 3, goldDark);
  setPixel(img, 3, 12, goldDark);
  setPixel(img, 12, 12, goldDark);
  return img;
}

// Diamond Block: cyan block with diamond pattern
function texDiamondBlock(): ImageData {
  const img = new ImageData(16, 16);
  const diamond = hexToRgb("#5edcdc");
  const diamondLight = hexToRgb("#8af0f0");
  const diamondDark = hexToRgb("#3aa0a0");
  fillRect(img, 0, 0, 16, 16, diamond);
  fillRect(img, 0, 0, 16, 1, diamondDark);
  fillRect(img, 0, 15, 16, 1, diamondDark);
  fillRect(img, 0, 0, 1, 16, diamondDark);
  fillRect(img, 15, 0, 1, 16, diamondDark);
  fillRect(img, 1, 1, 14, 1, diamondLight);
  fillRect(img, 1, 1, 1, 14, diamondLight);
  // Diamond pattern in center
  fillRect(img, 7, 5, 2, 6, diamondLight);
  fillRect(img, 5, 7, 6, 2, diamondLight);
  setPixel(img, 7, 4, diamondLight);
  setPixel(img, 8, 4, diamondLight);
  setPixel(img, 7, 11, diamondLight);
  setPixel(img, 8, 11, diamondLight);
  setPixel(img, 4, 7, diamondLight);
  setPixel(img, 4, 8, diamondLight);
  setPixel(img, 11, 7, diamondLight);
  setPixel(img, 11, 8, diamondLight);
  return img;
}

// === Block textures ===

// Door Top: top half of wooden door with window
function texDoorTop(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wood = hexToRgb("#8b6638");
  const woodLight = hexToRgb("#a87038");
  const woodDark = hexToRgb("#5a3a18");
  const glass = hexToRgb("#a8c8e8");
  // Frame (border)
  fillRect(img, 0, 0, 16, 16, wood);
  fillRect(img, 1, 1, 14, 14, woodDark);
  // Window (glass panel)
  fillRect(img, 3, 3, 10, 10, glass);
  // Window cross
  fillRect(img, 7, 3, 2, 10, wood);
  fillRect(img, 3, 7, 10, 2, wood);
  // Highlights
  fillRect(img, 0, 0, 16, 1, woodLight);
  fillRect(img, 0, 0, 1, 16, woodLight);
  return img;
}

// Door Bottom: bottom half of wooden door with panels
function texDoorBottom(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wood = hexToRgb("#8b6638");
  const woodLight = hexToRgb("#a87038");
  const woodDark = hexToRgb("#5a3a18");
  // Frame
  fillRect(img, 0, 0, 16, 16, wood);
  fillRect(img, 1, 1, 14, 14, woodDark);
  // Two panels
  fillRect(img, 3, 3, 10, 4, wood);
  fillRect(img, 3, 9, 10, 4, wood);
  // Panel borders
  fillRect(img, 3, 3, 10, 1, woodLight);
  fillRect(img, 3, 9, 10, 1, woodLight);
  // Highlights
  fillRect(img, 0, 0, 16, 1, woodLight);
  fillRect(img, 0, 0, 1, 16, woodLight);
  // Handle
  setPixel(img, 13, 8, woodDark);
  setPixel(img, 13, 7, woodDark);
  return img;
}

// Door Side: thin edge of door
function texDoorSide(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wood = hexToRgb("#8b6638");
  const woodLight = hexToRgb("#a87038");
  const woodDark = hexToRgb("#5a3a18");
  // Thin vertical strip
  fillRect(img, 6, 0, 4, 16, wood);
  fillRect(img, 6, 0, 1, 16, woodLight);
  fillRect(img, 9, 0, 1, 16, woodDark);
  return img;
}

// Sign Side: thin edge of sign post
function texSignSide(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wood = hexToRgb("#8b6638");
  const woodLight = hexToRgb("#a87038");
  const woodDark = hexToRgb("#5a3a18");
  // Sign board (top portion)
  fillRect(img, 2, 2, 12, 8, wood);
  fillRect(img, 2, 2, 12, 1, woodLight);
  fillRect(img, 2, 9, 12, 1, woodDark);
  fillRect(img, 2, 2, 1, 8, woodLight);
  fillRect(img, 13, 2, 1, 8, woodDark);
  // Post (bottom)
  fillRect(img, 7, 10, 2, 6, woodDark);
  return img;
}

// Stone Bricks: gray brick pattern
function texStoneBricks(): ImageData {
  const img = new ImageData(16, 16);
  const stone = hexToRgb("#787878");
  const stoneLight = hexToRgb("#909090");
  const stoneDark = hexToRgb("#505050");
  const mortar = hexToRgb("#606060");
  fillRect(img, 0, 0, 16, 16, stone);
  // Brick pattern (offset rows)
  // Row 1 (y=0-7)
  fillRect(img, 0, 7, 16, 1, mortar);
  fillRect(img, 7, 0, 1, 8, mortar);
  // Row 2 (y=8-15) offset
  fillRect(img, 0, 15, 16, 1, mortar);
  fillRect(img, 3, 8, 1, 8, mortar);
  fillRect(img, 11, 8, 1, 8, mortar);
  // Highlights on bricks
  fillRect(img, 0, 0, 7, 1, stoneLight);
  fillRect(img, 8, 0, 8, 1, stoneLight);
  fillRect(img, 0, 8, 3, 1, stoneLight);
  fillRect(img, 4, 8, 7, 1, stoneLight);
  fillRect(img, 12, 8, 4, 1, stoneLight);
  // Dark accents
  setPixel(img, 6, 6, stoneDark);
  setPixel(img, 14, 6, stoneDark);
  setPixel(img, 2, 14, stoneDark);
  setPixel(img, 10, 14, stoneDark);
  return img;
}

// Stone Slab: smooth stone top with rough bottom
function texStoneSlab(): ImageData {
  const img = new ImageData(16, 16);
  const stone = hexToRgb("#787878");
  const stoneLight = hexToRgb("#a0a0a0");
  const stoneDark = hexToRgb("#505050");
  fillRect(img, 0, 0, 16, 16, stone);
  // Top half (smooth)
  fillRect(img, 0, 0, 16, 8, stoneLight);
  fillRect(img, 0, 0, 16, 1, stoneLight);
  // Seam between top and bottom
  fillRect(img, 0, 8, 16, 1, stoneDark);
  // Bottom half (rough)
  setPixel(img, 2, 11, stoneDark);
  setPixel(img, 5, 13, stoneDark);
  setPixel(img, 8, 10, stoneDark);
  setPixel(img, 11, 12, stoneDark);
  setPixel(img, 14, 14, stoneDark);
  return img;
}

// Fence: planks with holes (transparent gaps)
function texFence(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wood = hexToRgb("#8b6638");
  const woodLight = hexToRgb("#a87038");
  const woodDark = hexToRgb("#5a3a18");
  // Top rail
  fillRect(img, 0, 4, 16, 2, wood);
  fillRect(img, 0, 4, 16, 1, woodLight);
  fillRect(img, 0, 5, 16, 1, woodDark);
  // Middle post
  fillRect(img, 6, 0, 4, 16, wood);
  fillRect(img, 6, 0, 1, 16, woodLight);
  fillRect(img, 9, 0, 1, 16, woodDark);
  // Bottom rail
  fillRect(img, 0, 10, 16, 2, wood);
  fillRect(img, 0, 10, 16, 1, woodLight);
  fillRect(img, 0, 11, 16, 1, woodDark);
  return img;
}

// Bed Top: top view of bed (pillow + blanket)
function texBedTop(): ImageData {
  const img = new ImageData(16, 16);
  const wood = hexToRgb("#8b6638");
  const woodLight = hexToRgb("#a87038");
  const blanket = hexToRgb("#a03030");
  const blanketLight = hexToRgb("#c04040");
  const pillow = hexToRgb("#f0f0e0");
  // Frame
  fillRect(img, 0, 0, 16, 16, wood);
  // Blanket (most of the bed)
  fillRect(img, 1, 1, 14, 11, blanket);
  fillRect(img, 1, 1, 14, 1, blanketLight);
  // Pillow (top)
  fillRect(img, 2, 2, 12, 3, pillow);
  fillRect(img, 2, 2, 12, 1, blanketLight);
  // Wood frame at foot
  fillRect(img, 1, 13, 14, 2, wood);
  fillRect(img, 1, 13, 14, 1, woodLight);
  return img;
}

// Bed Side: side view of bed
function texBedSide(): ImageData {
  const img = new ImageData(16, 16);
  const wood = hexToRgb("#8b6638");
  const woodLight2 = hexToRgb("#a87038");
  const blanket = hexToRgb("#a03030");
  const blanketLight = hexToRgb("#c04040");
  // Frame (legs + base)
  fillRect(img, 0, 0, 16, 16, wood);
  fillRect(img, 0, 0, 16, 1, woodLight2);
  // Mattress/blanket
  fillRect(img, 1, 4, 14, 7, blanket);
  fillRect(img, 1, 4, 14, 1, blanketLight);
  // Legs
  fillRect(img, 0, 11, 2, 5, wood);
  fillRect(img, 14, 11, 2, 5, wood);
  return img;
}

// Ladder: two vertical rails with rungs
function texLadder(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const wood = hexToRgb("#a87038");
  const woodLight = hexToRgb("#c89058");
  const woodDark = hexToRgb("#685020");
  // Two vertical rails
  fillRect(img, 3, 0, 2, 16, wood);
  fillRect(img, 11, 0, 2, 16, wood);
  fillRect(img, 3, 0, 1, 16, woodLight);
  fillRect(img, 12, 0, 1, 16, woodDark);
  // Rungs (horizontal)
  fillRect(img, 3, 3, 10, 1, wood);
  fillRect(img, 3, 7, 10, 1, wood);
  fillRect(img, 3, 11, 10, 1, wood);
  return img;
}

// Anvil Top: top view of anvil
function texAnvilTop(): ImageData {
  const img = new ImageData(16, 16);
  const iron = hexToRgb("#484848");
  const ironLight = hexToRgb("#686868");
  const ironDark = hexToRgb("#282828");
  // Wide top surface
  fillRect(img, 2, 4, 12, 8, iron);
  fillRect(img, 2, 4, 12, 1, ironLight);
  fillRect(img, 2, 11, 12, 1, ironDark);
  fillRect(img, 2, 4, 1, 8, ironLight);
  fillRect(img, 13, 4, 1, 8, ironDark);
  // Horn (right side bump)
  fillRect(img, 13, 6, 2, 4, iron);
  fillRect(img, 14, 7, 1, 2, ironLight);
  return img;
}

// Anvil Side: side view of anvil
function texAnvilSide(): ImageData {
  const img = new ImageData(16, 16);
  const iron = hexToRgb("#484848");
  const ironLight = hexToRgb("#686868");
  const ironDark = hexToRgb("#282828");
  // Top (wide flat part)
  fillRect(img, 2, 2, 12, 3, iron);
  fillRect(img, 2, 2, 12, 1, ironLight);
  fillRect(img, 2, 4, 12, 1, ironDark);
  // Neck (narrow middle)
  fillRect(img, 6, 5, 4, 3, iron);
  // Base (wide bottom)
  fillRect(img, 3, 8, 10, 5, iron);
  fillRect(img, 3, 8, 10, 1, ironLight);
  fillRect(img, 3, 12, 10, 1, ironDark);
  // Feet
  fillRect(img, 3, 13, 2, 1, ironDark);
  fillRect(img, 11, 13, 2, 1, ironDark);
  return img;
}

// Ender Eye: green/teal eye with pupil
function texEnderEye(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const green = hexToRgb("#1a8a4a");
  const lightGreen = hexToRgb("#3acc6a");
  const dark = hexToRgb("#0a4a2a");
  const pupil = hexToRgb("#0a0a0a");
  // Eye shape (oval)
  fillRect(img, 4, 6, 8, 4, green);
  fillRect(img, 5, 5, 6, 1, green);
  fillRect(img, 5, 10, 6, 1, green);
  // Highlight
  fillRect(img, 5, 6, 2, 1, lightGreen);
  // Pupil (center)
  fillRect(img, 7, 7, 2, 2, pupil);
  setPixel(img, 8, 7, dark);
  // Outline
  setPixel(img, 4, 7, dark);
  setPixel(img, 11, 7, dark);
  return img;
}

// Flint and Steel: gray flint + steel striker
function texFlintAndSteel(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const steel = hexToRgb("#888888");
  const steelLight = hexToRgb("#aaaaaa");
  const steelDark = hexToRgb("#555555");
  const flint = hexToRgb("#3a3a3a");
  const flintLight = hexToRgb("#5a5a5a");
  // Steel body (curved shape)
  fillRect(img, 4, 6, 8, 4, steel);
  fillRect(img, 5, 5, 6, 1, steelLight);
  fillRect(img, 5, 10, 6, 1, steelDark);
  // Flint (dark stone at the tip)
  fillRect(img, 10, 7, 3, 3, flint);
  setPixel(img, 11, 8, flintLight);
  // Spark
  setPixel(img, 13, 7, hexToRgb("#ffdd00"));
  setPixel(img, 13, 9, hexToRgb("#ffaa00"));
  return img;
}

// Blaze Rod: golden/yellow rod with glowing ends
function texBlazeRod(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const rod = hexToRgb("#d8a020");
  const rodLight = hexToRgb("#f8c040");
  const rodDark = hexToRgb("#a87010");
  const glow = hexToRgb("#fff080");
  // Rod body (vertical)
  fillRect(img, 7, 2, 2, 12, rod);
  // Highlight
  fillRect(img, 7, 2, 1, 12, rodLight);
  // Shadow
  fillRect(img, 8, 2, 1, 12, rodDark);
  // Glowing ends
  fillRect(img, 6, 1, 4, 1, glow);
  fillRect(img, 6, 14, 4, 1, glow);
  setPixel(img, 7, 0, glow);
  setPixel(img, 8, 0, glow);
  return img;
}

// Dragon egg texture: dark purple/black egg with magenta spots
function texDragonEgg(): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const black = hexToRgb("#0a0014");
  const purple = hexToRgb("#3a0a4a");
  const magenta = hexToRgb("#cc44cc");
  const lightMagenta = hexToRgb("#ff88ff");
  // Egg shape (oval, narrowing at top)
  // Bottom row (widest)
  fillRect(img, 4, 11, 8, 1, black);
  fillRect(img, 3, 10, 10, 1, black);
  fillRect(img, 3, 9, 10, 1, purple);
  fillRect(img, 3, 8, 10, 1, black);
  fillRect(img, 4, 7, 8, 1, purple);
  fillRect(img, 4, 6, 8, 1, black);
  fillRect(img, 4, 5, 8, 1, purple);
  fillRect(img, 5, 4, 6, 1, black);
  fillRect(img, 5, 3, 6, 1, purple);
  fillRect(img, 6, 2, 4, 1, black);
  // Magenta spots (scattered)
  setPixel(img, 5, 9, magenta);
  setPixel(img, 9, 8, magenta);
  setPixel(img, 7, 7, lightMagenta);
  setPixel(img, 4, 6, magenta);
  setPixel(img, 10, 6, magenta);
  setPixel(img, 6, 5, lightMagenta);
  setPixel(img, 8, 4, magenta);
  setPixel(img, 7, 3, lightMagenta);
  // Highlight (top-left)
  setPixel(img, 4, 8, purple);
  setPixel(img, 5, 7, purple);
  return img;
}

// Helper: make ingot texture
function makeIngot(color: number, lightColor: number, darkColor: number): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const c = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff] as [number, number, number];
  const l = [(lightColor >> 16) & 0xff, (lightColor >> 8) & 0xff, lightColor & 0xff] as [number, number, number];
  const d = [(darkColor >> 16) & 0xff, (darkColor >> 8) & 0xff, darkColor & 0xff] as [number, number, number];
  // Ingot shape (trapezoid)
  fillRect(img, 5, 5, 6, 1, c);
  fillRect(img, 4, 6, 8, 1, c);
  fillRect(img, 4, 7, 8, 3, c);
  fillRect(img, 4, 10, 8, 1, c);
  fillRect(img, 5, 11, 6, 1, c);
  fillRect(img, 5, 5, 6, 1, l);
  fillRect(img, 4, 11, 8, 1, d);
  return img;
}

// Helper: make armor texture (simple shape per type)
function makeArmor(color: number, type: string): ImageData {
  const img = new ImageData(16, 16);
  clearTransparent(img);
  const c = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff] as [number, number, number];
  const d = [Math.max(0, c[0] - 40), Math.max(0, c[1] - 40), Math.max(0, c[2] - 40)] as [number, number, number];
  const l = [Math.min(255, c[0] + 30), Math.min(255, c[1] + 30), Math.min(255, c[2] + 30)] as [number, number, number];
  if (type === "helmet") {
    fillRect(img, 4, 3, 8, 1, c); fillRect(img, 3, 4, 10, 4, c); fillRect(img, 3, 8, 2, 2, c); fillRect(img, 11, 8, 2, 2, c);
    fillRect(img, 4, 3, 8, 1, l); fillRect(img, 3, 8, 2, 2, d); fillRect(img, 11, 8, 2, 2, d);
  } else if (type === "chestplate") {
    fillRect(img, 3, 3, 10, 1, c); fillRect(img, 2, 4, 12, 6, c); fillRect(img, 3, 10, 10, 2, c);
    fillRect(img, 3, 3, 10, 1, l); fillRect(img, 3, 11, 10, 1, d);
  } else if (type === "leggings") {
    fillRect(img, 3, 3, 10, 2, c); fillRect(img, 3, 5, 4, 8, c); fillRect(img, 9, 5, 4, 8, c);
    fillRect(img, 3, 3, 10, 1, l); fillRect(img, 3, 12, 4, 1, d); fillRect(img, 9, 12, 4, 1, d);
  } else if (type === "boots") {
    fillRect(img, 3, 8, 4, 2, c); fillRect(img, 3, 10, 5, 3, c); fillRect(img, 9, 8, 4, 2, c); fillRect(img, 8, 10, 5, 3, c);
    fillRect(img, 3, 8, 4, 1, l); fillRect(img, 3, 12, 5, 1, d); fillRect(img, 8, 12, 5, 1, d);
  }
  return img;
}
