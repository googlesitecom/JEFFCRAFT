// Procedural pixel-art texture generation for Minecraft blocks
// Returns HTMLCanvasElement (not THREE.Texture) so the atlas can be built deterministically.

const TEX_SIZE = 16;

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

function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  return [rgb[0] + amount, rgb[1] + amount, rgb[2] + amount];
}

function variation(rgb: [number, number, number], v: number, rng: () => number): [number, number, number] {
  return [
    rgb[0] + (rng() - 0.5) * 2 * v,
    rgb[1] + (rng() - 0.5) * 2 * v,
    rgb[2] + (rng() - 0.5) * 2 * v,
  ];
}

function setPixel(img: ImageData, x: number, y: number, rgb: [number, number, number], alpha = 255) {
  const i = (y * img.width + x) * 4;
  img.data[i] = Math.max(0, Math.min(255, rgb[0]));
  img.data[i + 1] = Math.max(0, Math.min(255, rgb[1]));
  img.data[i + 2] = Math.max(0, Math.min(255, rgb[2]));
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

// === Specific texture generators ===

function texDirt(seed = 1): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  noiseFill(img, hexToRgb("#79553a"), 18, seed);
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
  noiseFill(img, hexToRgb("#79553a"), 15, seed);
  const rng = makeRng(seed + 100);
  for (let x = 0; x < TEX_SIZE; x++) {
    const grassHeight = 3 + Math.floor(rng() * 3);
    for (let y = 0; y < grassHeight; y++) {
      setPixel(img, x, y, variation(hexToRgb("#5fa83b"), 18, rng));
    }
    if (rng() > 0.5) {
      setPixel(img, x, grassHeight, variation(hexToRgb("#4d8f30"), 15, rng));
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
  // Add a couple of cracks
  for (let i = 0; i < 3; i++) {
    const sx = 2 + Math.floor(rng() * 12);
    const sy = 2 + Math.floor(rng() * 12);
    for (let j = 0; j < 4; j++) {
      const px = sx + Math.floor(rng() * 2);
      const py = sy + j;
      if (px < TEX_SIZE && py < TEX_SIZE) setPixel(img, px, py, hexToRgb("#444444"));
    }
  }
  return img;
}

function texCobblestone(seed = 5): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#3a3a3a"));
  const rng = makeRng(seed);
  const stones = [
    { x: 0, y: 0, w: 6, h: 5 },
    { x: 7, y: 0, w: 9, h: 4 },
    { x: 0, y: 6, w: 5, h: 6 },
    { x: 6, y: 5, w: 5, h: 5 },
    { x: 12, y: 5, w: 4, h: 6 },
    { x: 5, y: 11, w: 7, h: 5 },
  ];
  for (const s of stones) {
    const base = variation(hexToRgb("#8a8a8a"), 18, rng);
    for (let y = s.y; y < s.y + s.h && y < TEX_SIZE; y++) {
      for (let x = s.x; x < s.x + s.w && x < TEX_SIZE; x++) {
        setPixel(img, x, y, variation(base, 12, rng));
      }
    }
    // Dark outline around stone
    for (let y = s.y; y < s.y + s.h && y < TEX_SIZE; y++) {
      setPixel(img, s.x, y, hexToRgb("#2a2a2a"));
      if (s.x + s.w - 1 < TEX_SIZE) setPixel(img, s.x + s.w - 1, y, hexToRgb("#2a2a2a"));
    }
  }
  return img;
}

function texWoodTop(seed = 6): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#a07640"));
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
        setPixel(img, x, y, variation(hexToRgb("#9a6f3a"), 8, makeRng(seed + x * 16 + y)));
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
      const stripe = (x + Math.floor(rng() * 2)) % 4 < 2;
      const base = stripe ? hexToRgb("#6e4d28") : hexToRgb("#7a5a30");
      setPixel(img, x, y, variation(base, 8, rng));
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

// Improved leaves: solid texture with dark spots, like Minecraft's "fast" leaves
function texLeaves(seed = 8): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  const rng = makeRng(seed);
  // Base dark green
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      // Mix of dark and light green clumps for organic look
      const r = rng();
      let c: [number, number, number];
      if (r < 0.2) c = variation(hexToRgb("#2d5e1c"), 10, rng);
      else if (r < 0.5) c = variation(hexToRgb("#3a7d28"), 15, rng);
      else if (r < 0.8) c = variation(hexToRgb("#4a8f35"), 15, rng);
      else c = variation(hexToRgb("#1f4012"), 10, rng);
      setPixel(img, x, y, c, 255);
    }
  }
  // A few darker spots for depth (still solid)
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rng() * TEX_SIZE);
    const y = Math.floor(rng() * TEX_SIZE);
    setPixel(img, x, y, hexToRgb("#16380a"));
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
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const plankRow = Math.floor(y / 4);
      const base = plankRow % 2 === 0 ? hexToRgb("#a07640") : hexToRgb("#8a6536");
      setPixel(img, x, y, variation(base, 8, rng));
    }
  }
  for (let y = 0; y < TEX_SIZE; y += 4) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPixel(img, x, y, hexToRgb("#6e4d28"));
    }
  }
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
  // Mostly light tint
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      setPixel(img, x, y, [200, 220, 230], 40);
    }
  }
  // Border
  for (let i = 0; i < TEX_SIZE; i++) {
    setPixel(img, i, 0, [220, 235, 240], 220);
    setPixel(img, i, TEX_SIZE - 1, [220, 235, 240], 220);
    setPixel(img, 0, i, [220, 235, 240], 220);
    setPixel(img, TEX_SIZE - 1, i, [220, 235, 240], 220);
  }
  for (let i = 2; i < 6; i++) {
    setPixel(img, i, i, [255, 255, 255], 200);
  }
  return img;
}

function texBrick(seed = 14): ImageData {
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  fill(img, hexToRgb("#9c4f3b"));
  const rng = makeRng(seed);
  const brickH = 4;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const row = Math.floor(y / brickH);
      const offset = row % 2 === 0 ? 0 : 4;
      const bx = (x + offset) % 8;
      const by = y % brickH;
      if (bx === 0 || by === 0) {
        setPixel(img, x, y, hexToRgb("#cccccc"));
      } else {
        setPixel(img, x, y, variation(hexToRgb("#b15a44"), 12, rng));
      }
    }
  }
  return img;
}

function texOreBase(stoneImg: ImageData, oreColor: [number, number, number], seed: number): ImageData {
  // Copy the stone texture first
  const img = new ImageData(TEX_SIZE, TEX_SIZE);
  img.data.set(stoneImg.data);
  const rng = makeRng(seed + 100);
  for (let i = 0; i < 5; i++) {
    const cx = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    const cy = 2 + Math.floor(rng() * (TEX_SIZE - 4));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (rng() > 0.3) {
          setPixel(img, cx + dx, cy + dy, variation(oreColor, 15, rng));
        }
      }
    }
  }
  return img;
}

function texCoalOre(seed = 15): ImageData {
  return texOreBase(texStone(seed), hexToRgb("#1a1a1a"), seed);
}
function texIronOre(seed = 16): ImageData {
  return texOreBase(texStone(seed), hexToRgb("#c69b80"), seed);
}
function texGoldOre(seed = 17): ImageData {
  return texOreBase(texStone(seed), hexToRgb("#f7d046"), seed);
}
function texDiamondOre(seed = 18): ImageData {
  return texOreBase(texStone(seed), hexToRgb("#5edcdc"), seed);
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
  for (let x = 0; x < TEX_SIZE; x++) {
    if (x % 5 === 0) {
      for (let y = 0; y < TEX_SIZE; y++) {
        setPixel(img, x, y, hexToRgb("#9a5e1f"));
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

// Build a map of texture name -> HTMLCanvasElement
export function buildTextureCanvases(): Record<string, HTMLCanvasElement> {
  return {
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
  };
}

// Build data URLs for hotbar icons (also stable)
export function buildIconDataURLs(canvases: Record<string, HTMLCanvasElement>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, canvas] of Object.entries(canvases)) {
    out[name] = canvas.toDataURL();
  }
  return out;
}
