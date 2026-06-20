// Process uploaded texture images: scale to 16x16 and convert to canvas
import * as THREE from "three";

// Load an image file and return a 16x16 canvas with pixelated scaling
export function loadTextureImage(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 16, 16);
      resolve(canvas);
    };
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// Copy a 16x16 region from a source canvas
export function copyRegion(src: HTMLCanvasElement, sx: number, sy: number, size: number = 16): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, size, size, 0, 0, 16, 16);
  return canvas;
}
