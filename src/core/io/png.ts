import { promises as fs } from "node:fs";
import { PNG } from "pngjs";
import type { RgbaImage } from "../types/image";

export async function loadPng(filePath: string): Promise<RgbaImage> {
  const buffer = await fs.readFile(filePath);
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: Uint8Array.from(png.data)
  };
}

export function encodePng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  return PNG.sync.write(png);
}

export async function writePng(filePath: string, image: RgbaImage) {
  await fs.writeFile(filePath, encodePng(image));
}
