// Procedural pixel-art texture generation for Minecraft blocks
import * as THREE from "three";

const TEX_SIZE = 16; // 16x16 pixel texture like Minecraft

// Deterministic pseudo-random for repeatable textures
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

function rgbToHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    rgb[0] + amount,
    rgb[1] + amount,
    rgb[2] + amount,
  ];
}

function variation(rgb: [number, number, number], v: number, rng: () => number): [number, number, number] {
  return [
    rgb[0] + (rng() - 0.5) * 2 * v,
    rgb[1] + (rng() - 0.5) * 2 * v,
    rgb[2] + (rng() - 0.5) * 2 * v,
  ];
}

// Draw a single pixel into ImageData
function setPixel(img: ImageData, x: number, y: number, rgb: [number, number, number], alpha = 255) {
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

function noiseFill(img: ImageData, base: [number, number, number], variation: number, seed: number) {
  const rng = makeRng(seed);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const c = variation_(base, variation, rng);
      setPixel(img, x, y, c);
    }
  }
}

function variation_(rgb: [number, number, number], v: number, rng: () => number): [number, number, number] {
  return [
    rgb[0] + (rng() - 0.5) * 2 * v,
    rgb[1] + (rng() - 0.5) * 2 * v,
    rgb[2] + (rng() - 0.5) * 2 * v,
  ];
}

// Specific texture generators
function texDirt(seed = 1): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#79553a"), 18, seed);
  // Add darker specks
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 25; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    setPixel(img, x, y, shade(hexToRgb("#5e3f29"), -10 + rng() * 20));
  }
  return img;
}

function texGrassTop(seed = 2): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#5fa83b"), 18, seed);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    setPixel(img, x, y, shade(hexToRgb("#4d8f30"), -15 + rng() * 30));
  }
  return img;
}

function texGrassSide(seed = 3): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  // Bottom dirt
  noiseFill(img, hexToRgb("#79553a"), 15, seed);
  // Top grass overlay (a few pixels)
  const rng = makeRng(seed + 100);
  for (let x = 0; x < TEX_SIZE; x++) {
    const grassHeight = 2 + Math.floor(rng() * 3);
    for (let y = 0; y < grassHeight; y++) {
      setPixel(img, x, y, variation_(hexToRgb("#5fa83b"), 18, rng));
    }
    // A few dangling grass pixels
    if (rng() > 0.6) {
      setPixel(img, x, grassHeight, variation_(hexToRgb("#4d8f30"), 15, rng));
    }
  }
  return img;
}

function texStone(seed = 4): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#7d7d7d"), 12, seed);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    setPixel(img, x, y, shade(hexToRgb("#5e5e5e"), -10 + rng() * 20));
  }
  return img;
}

function texCobblestone(seed = 5): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#5e5e5e"));
  const rng = makeRng(seed);
  // Random stones
  const stones = [
    { x: 1, y: 1, w: 5, h: 5 },
    { x: 8, y: 1, w: 6, h: 4 },
    { x: 1, y: 8, w: 6, h: 6 },
    { x: 9, y: 7, w: 5, h: 7 },
    { x: 6, y: 6, w: 2, h: 2 },
  ];
  for (const s of stones) {
    const base = variation_(hexToRgb("#828282"), 15, rng);
    for (let y = s.y; y < s.y + s.h && y < TEX_SIZE; y++) {
      for (let x = s.x; x < s.x + s.w && x < TEX_SIZE; x++) {
        setPixel(img, x, y, variation_(base, 10, rng));
      }
    }
  }
  return img;
}

function texWoodTop(seed = 6): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#a07640"));
  // Tree rings
  const cx = 8, cy = 8;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.floor(d) % 2 === 0;
      if (ring) {
        setPixel(img, x, y, shade(hexToRgb("#7a5a30"), -5 + (d % 3) * 3));
      } else {
        setPixel(img, x, y, variation_(hexToRgb("#9a6f3a"), 8, makeRng(seed + x * 16 + y)));
      }
    }
  }
  return img;
}

function texWoodSide(seed = 7): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const rng = makeRng(seed);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      // Vertical bark stripes
      const stripe = (x + Math.floor(rng() * 2)) % 4 < 2;
      const base = stripe ? hexToRgb("#6e4d28") : hexToRgb("#7a5a30");
      setPixel(img, x, y, variation_(base, 8, rng));
    }
  }
  return img;
}

function texLeaves(seed = 8): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const rng = makeRng(seed);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      // Mostly transparent "holes" to look like leaves
      if (rng() < 0.15) {
        setPixel(img, x, y, [0, 0, 0], 0);
      } else {
        const c = variation_(hexToRgb("#3a7d28"), 25, rng);
        setPixel(img, x, y, c, 255);
      }
    }
  }
  return img;
}

function texSand(seed = 9): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#e0d39b"), 10, seed);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    setPixel(img, x, y, shade(hexToRgb("#c9bb83"), -5 + rng() * 10));
  }
  return img;
}

function texWater(seed = 10): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#2b5fb3"), 12, seed);
  // Add a few horizontal wave lines
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 4; i++) {
    const y = Math.floor(rng() * TEX_SIZE);
    for (let x = 0; x < TEX_SIZE; x++) {
      if (rng() > 0.4) {
        setPixel(img, x, y, shade(hexToRgb("#3a72c8"), 10));
      }
    }
  }
  return img;
}

function texBedrock(seed = 11): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#3a3a3a"));
  const rng = makeRng(seed);
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    const gray = 40 + Math.floor(rng() * 70);
    setPixel(img, x, y, [gray, gray, gray]);
  }
  return img;
}

function texPlanks(seed = 12): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const rng = makeRng(seed);
  // Horizontal planks
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const plankRow = Math.floor(y / 4);
      const base = plankRow % 2 === 0 ? hexToRgb("#a07640") : hexToRgb("#8a6536");
      setPixel(img, x, y, variation_(base, 8, rng));
    }
  }
  // Plank separator lines
  for (let y = 0; y < TEX_SIZE; y += 4) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPixel(img, x, y, hexToRgb("#6e4d28"));
    }
  }
  // Vertical seams offset per row
  const rng2 = makeRng(seed + 1);
  for (let row = 0; row < 4; row++) {
    const x = 4 + Math.floor(rng2() * 8);
    for (let y = row * 4; y < row * 4 + 4; y++) {
      setPixel(img, x, y, hexToRgb("#6e4d28"));
    }
  }
  return img;
}

function texGlass(seed = 13): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  // Mostly transparent
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPixel(img, x, y, [200, 220, 230], 30);
    }
  }
  // Border
  for (let i = 0; i < TEX_SIZE; i++) {
    setPixel(img, i, 0, [220, 235, 240], 220);
    setPixel(img, i, TEX_SIZE - 1, [220, 235, 240], 220);
    setPixel(img, 0, i, [220, 235, 240], 220);
    setPixel(img, TEX_SIZE - 1, i, [220, 235, 240], 220);
  }
  // Highlight stripe
  for (let i = 2; i < 6; i++) {
    setPixel(img, i, i, [255, 255, 255], 200);
  }
  return img;
}

function texBrick(seed = 14): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#9c4f3b")); // mortar background
  const rng = makeRng(seed);
  // Brick pattern
  const brickH = 4;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const row = Math.floor(y / brickH);
      const offset = row % 2 === 0 ? 0 : 4;
      const bx = (x + offset) % 8;
      const by = y % brickH;
      if (bx === 0 || by === 0) {
        setPixel(img, x, y, hexToRgb("#cccccc")); // mortar
      } else {
        setPixel(img, x, y, variation_(hexToRgb("#b15a44"), 12, rng));
      }
    }
  }
  return img;
}

function texCoalOre(seed = 15): ImageData {
  const img = texStone(seed);
  const rng = makeRng(seed + 100);
  // Coal deposits
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    const cy = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (rng() > 0.3) {
          setPixel(img, cx + dx, cy + dy, variation_(hexToRgb("#222222"), 15, rng));
        }
      }
    }
  }
  return img;
}

function texIronOre(seed = 16): ImageData {
  const img = texStone(seed);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    const cy = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (rng() > 0.3) {
          setPixel(img, cx + dx, cy + dy, variation_(hexToRgb("#c69b80"), 15, rng));
        }
      }
    }
  }
  return img;
}

function texGoldOre(seed = 17): ImageData {
  const img = texStone(seed);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    const cy = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (rng() > 0.3) {
          setPixel(img, cx + dx, cy + dy, variation_(hexToRgb("#f7d046"), 15, rng));
        }
      }
    }
  }
  return img;
}

function texDiamondOre(seed = 18): ImageData {
  const img = texStone(seed);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    const cy = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (rng() > 0.3) {
          setPixel(img, cx + dx, cy + dy, variation_(hexToRgb("#5edcdc"), 15, rng));
        }
      }
    }
  }
  return img;
}

function texSnow(seed = 19): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#f5fbff"), 6, seed);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    setPixel(img, x, y, shade(hexToRgb("#e0e8f0"), -3 + rng() * 6));
  }
  return img;
}

function texPumpkinTop(seed = 20): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#c67d2a"), 12, seed);
  // Stem in center
  for (let y = 6; y < 10; y++) {
    for (let x = 6; x < 10; x++) {
      setPixel(img, x, y, hexToRgb("#5e7d2a"));
    }
  }
  return img;
}

function texPumpkinSide(seed = 21): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#c67d2a"), 12, seed);
  const rng = makeRng(seed + 100);
  // Vertical ridges
  for (let x = 0; x < TEX_SIZE; x++) {
    if (x % 5 === 0) {
      for (let y = 0; y < TEX_SIZE; y++) {
        setPixel(img, x, y, shade(hexToRgb("#9a5e1f"), 0));
      }
    }
  }
  return img;
}

function texGravel(seed = 22): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#6b6b6b"));
  const rng = makeRng(seed);
  for (let i = 0; i < 30; i++) {
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

// Convert ImageData to THREE.Texture
function imageDataToTexture(img: ImageData): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Convert ImageData to data URL (for hotbar icons)
export function imageDataToDataURL(img: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

// Build a texture atlas: map of texture name -> THREE.Texture
export function buildTextures(): Record<string, THREE.Texture> {
  return {
    dirt: imageDataToTexture(texDirt()),
    grass_top: imageDataToTexture(texGrassTop()),
    grass_side: imageDataToTexture(texGrassSide()),
    stone: imageDataToTexture(texStone()),
    cobblestone: imageDataToTexture(texCobblestone()),
    wood_top: imageDataToTexture(texWoodTop()),
    wood_side: imageDataToTexture(texWoodSide()),
    leaves: imageDataToTexture(texLeaves()),
    sand: imageDataToTexture(texSand()),
    water: imageDataToTexture(texWater()),
    bedrock: imageDataToTexture(texBedrock()),
    planks: imageDataToTexture(texPlanks()),
    glass: imageDataToTexture(texGlass()),
    brick: imageDataToTexture(texBrick()),
    coal_ore: imageDataToTexture(texCoalOre()),
    iron_ore: imageDataToTexture(texIronOre()),
    gold_ore: imageDataToTexture(texGoldOre()),
    diamond_ore: imageDataToTexture(texDiamondOre()),
    snow: imageDataToTexture(texSnow()),
    pumpkin_top: imageDataToTexture(texPumpkinTop()),
    pumpkin_side: imageDataToTexture(texPumpkinSide()),
    gravel: imageDataToTexture(texGravel()),
  };
}

// Build data URLs for hotbar icons
export function buildIconDataURLs(): Record<string, string> {
  return {
    dirt: imageDataToDataURL(texDirt()),
    grass_top: imageDataToDataURL(texGrassTop()),
    grass_side: imageDataToDataURL(texGrassSide()),
    stone: imageDataToDataURL(texStone()),
    cobblestone: imageDataToDataURL(texCobblestone()),
    wood_top: imageDataToDataURL(texWoodTop()),
    wood_side: imageDataToDataURL(texWoodSide()),
    leaves: imageDataToDataURL(texLeaves()),
    sand: imageDataToDataURL(texSand()),
    water: imageDataToDataURL(texWater()),
    bedrock: imageDataToDataURL(texBedrock()),
    planks: imageDataToDataURL(texPlanks()),
    glass: imageDataToDataURL(texGlass()),
    brick: imageDataToDataURL(texBrick()),
    coal_ore: imageDataToDataURL(texCoalOre()),
    iron_ore: imageDataToDataURL(texIronOre()),
    gold_ore: imageDataToDataURL(texGoldOre()),
    diamond_ore: imageDataToDataURL(texDiamondOre()),
    snow: imageDataToDataURL(texSnow()),
    pumpkin_top: imageDataToDataURL(texPumpkinTop()),
    pumpkin_side: imageDataToDataURL(texPumpkinSide()),
    gravel: imageDataToDataURL(texGravel()),
  };
}
