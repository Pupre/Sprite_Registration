import type { ProcessedAnimation, Rect, RgbaImage, RgbaPixel } from "../types/image";
import { clamp, createImage, expandRect, getPixel, rectUnion, setPixel } from "../utils/image";

export interface RenderedAnimationSheet {
  image: RgbaImage;
  metadata: {
    animationId: string;
    row: number;
    cellWidth: number;
    cellHeight: number;
    frameCount: number;
    frames: Array<{
      id: string;
      offsetX: number;
      offsetY: number;
      anchorX: number;
      anchorY: number;
      groundY: number;
    }>;
  };
}

function saturation(pixel: { r: number; g: number; b: number }): number {
  return Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
}

function bilinearBackground(corners: [RgbaPixel, RgbaPixel, RgbaPixel, RgbaPixel], x: number, y: number, width: number, height: number): RgbaPixel {
  const u = width <= 1 ? 0 : x / (width - 1);
  const v = height <= 1 ? 0 : y / (height - 1);
  const [topLeft, topRight, bottomLeft, bottomRight] = corners;

  const interpolate = (a: number, b: number, c: number, d: number) =>
    a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;

  return {
    r: interpolate(topLeft.r, topRight.r, bottomLeft.r, bottomRight.r),
    g: interpolate(topLeft.g, topRight.g, bottomLeft.g, bottomRight.g),
    b: interpolate(topLeft.b, topRight.b, bottomLeft.b, bottomRight.b),
    a: interpolate(topLeft.a, topRight.a, bottomLeft.a, bottomRight.a)
  };
}

function nearestPalettePixel(pixel: RgbaPixel, palette: RgbaPixel[]): RgbaPixel | null {
  let best: RgbaPixel | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const colorDistance = Math.hypot(pixel.r - candidate.r, pixel.g - candidate.g, pixel.b - candidate.b);
    const saturationDistance = Math.abs(saturation(pixel) - saturation(candidate)) * 0.9;
    const score = colorDistance + saturationDistance;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function estimateBackground(pixel: RgbaPixel, x: number, y: number, width: number, height: number, corners: [RgbaPixel, RgbaPixel, RgbaPixel, RgbaPixel], palette: RgbaPixel[]): RgbaPixel {
  const bilinear = bilinearBackground(corners, x, y, width, height);
  const palettePixel = nearestPalettePixel(pixel, palette);
  if (!palettePixel) {
    return bilinear;
  }

  const bilinearScore = Math.hypot(pixel.r - bilinear.r, pixel.g - bilinear.g, pixel.b - bilinear.b);
  const paletteScore = Math.hypot(pixel.r - palettePixel.r, pixel.g - palettePixel.g, pixel.b - palettePixel.b);
  return paletteScore < bilinearScore ? palettePixel : bilinear;
}

function recoverForegroundPixel(pixel: RgbaPixel, background: RgbaPixel, alpha: number): RgbaPixel {
  if (alpha >= 252) {
    return { ...pixel, a: 255 };
  }

  const normalizedAlpha = Math.max(alpha / 255, 0.02);
  const inverse = 1 - normalizedAlpha;
  return {
    r: clamp(Math.round((pixel.r - background.r * inverse) / normalizedAlpha), 0, 255),
    g: clamp(Math.round((pixel.g - background.g * inverse) / normalizedAlpha), 0, 255),
    b: clamp(Math.round((pixel.b - background.b * inverse) / normalizedAlpha), 0, 255),
    a: alpha
  };
}

export function renderAnimationSheet(animation: ProcessedAnimation): RenderedAnimationSheet {
  const padding = 4;
  const sourceRects = animation.frames.map((frame) =>
    expandRect(frame.analysis.fullBounds, 2, frame.image.width, frame.image.height)
  );
  const worldRects: Rect[] = sourceRects.map((rect, index) => ({
    x: rect.x + animation.frames[index].offset.x,
    y: rect.y + animation.frames[index].offset.y,
    width: rect.width,
    height: rect.height
  }));
  const union = rectUnion(worldRects);

  const cellWidth = union.width + padding * 2;
  const cellHeight = union.height + padding * 2;
  const output = createImage(cellWidth * animation.frames.length, cellHeight, { a: 0 });

  animation.frames.forEach((frame, frameIndex) => {
    const sourceRect = sourceRects[frameIndex];
    for (let y = 0; y < sourceRect.height; y += 1) {
      for (let x = 0; x < sourceRect.width; x += 1) {
        const sourceX = sourceRect.x + x;
        const sourceY = sourceRect.y + y;
        const pixel = getPixel(frame.image, sourceX, sourceY);

        let outputPixel: RgbaPixel;
        if (frame.analysis.alphaMode) {
          if (pixel.a <= 3) {
            continue;
          }
          outputPixel = pixel;
        } else {
          const matteAlpha = Math.round((frame.analysis.matte[sourceY]?.[sourceX] ?? 0) * 255);
          if (matteAlpha <= 6) {
            continue;
          }
          const background = estimateBackground(
            pixel,
            sourceX,
            sourceY,
            frame.image.width,
            frame.image.height,
            frame.analysis.backgroundCorners,
            frame.analysis.backgroundPalette
          );
          outputPixel = recoverForegroundPixel(pixel, background, matteAlpha);
        }

        const targetX =
          frameIndex * cellWidth +
          sourceX +
          frame.offset.x -
          union.x +
          padding;
        const targetY = sourceY + frame.offset.y - union.y + padding;
        setPixel(output, targetX, targetY, outputPixel);
      }
    }
  });

  return {
    image: output,
    metadata: {
      animationId: animation.id,
      row: animation.row,
      cellWidth,
      cellHeight,
      frameCount: animation.frames.length,
      frames: animation.frames.map((frame) => ({
        id: frame.id,
        offsetX: frame.offset.x,
        offsetY: frame.offset.y,
        anchorX: Number(frame.analysis.coreAnchor.x.toFixed(2)),
        anchorY: Number(frame.analysis.coreAnchor.y.toFixed(2)),
        groundY: frame.analysis.groundY
      }))
    }
  };
}
