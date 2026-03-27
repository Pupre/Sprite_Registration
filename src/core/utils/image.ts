import type { Point } from "../types/sprite";
import type { Rect, RgbaImage, RgbaPixel } from "../types/image";

export function createImage(width: number, height: number, fill?: Partial<RgbaPixel>): RgbaImage {
  const image = {
    width,
    height,
    data: new Uint8Array(width * height * 4)
  };

  const pixel = {
    r: fill?.r ?? 0,
    g: fill?.g ?? 0,
    b: fill?.b ?? 0,
    a: fill?.a ?? 0
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(image, x, y, pixel);
    }
  }

  return image;
}

export function getIndex(image: RgbaImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

export function getPixel(image: RgbaImage, x: number, y: number): RgbaPixel {
  const index = getIndex(image, x, y);
  return {
    r: image.data[index],
    g: image.data[index + 1],
    b: image.data[index + 2],
    a: image.data[index + 3]
  };
}

export function setPixel(image: RgbaImage, x: number, y: number, pixel: RgbaPixel) {
  const index = getIndex(image, x, y);
  image.data[index] = pixel.r;
  image.data[index + 1] = pixel.g;
  image.data[index + 2] = pixel.b;
  image.data[index + 3] = pixel.a;
}

export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const cropped = createImage(rect.width, rect.height);

  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const sourceX = rect.x + x;
      const sourceY = rect.y + y;
      if (sourceX < 0 || sourceY < 0 || sourceX >= image.width || sourceY >= image.height) {
        continue;
      }
      setPixel(cropped, x, y, getPixel(image, sourceX, sourceY));
    }
  }

  return cropped;
}

export function luminance(pixel: RgbaPixel): number {
  const alpha = pixel.a / 255;
  return (pixel.r * 0.2126 + pixel.g * 0.7152 + pixel.b * 0.0722) * alpha;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function expandRect(rect: Rect, margin: number, width: number, height: number): Rect {
  const x = clamp(rect.x - margin, 0, width);
  const y = clamp(rect.y - margin, 0, height);
  const right = clamp(rect.x + rect.width + margin, 0, width);
  const bottom = clamp(rect.y + rect.height + margin, 0, height);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

export function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

export function rectUnion(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  let minX = rects[0].x;
  let minY = rects[0].y;
  let maxX = rects[0].x + rects[0].width;
  let maxY = rects[0].y + rects[0].height;

  for (const rect of rects.slice(1)) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}
