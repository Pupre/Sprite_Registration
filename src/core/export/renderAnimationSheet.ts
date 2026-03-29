import type { ProcessedAnimation, RgbaImage, RgbaPixel, SheetExportLayout } from "../types/image";
import { frameContactY } from "../alignment/contact";
import { computeAnimationExportProfile } from "./computeSheetExportLayout";
import { clamp, createImage, getPixel, setPixel } from "../utils/image";

export interface RenderedAnimationSheet {
  image: RgbaImage;
  metadata: {
    animationId: string;
    row: number;
    cellWidth: number;
    cellHeight: number;
    frameCount: number;
    pivotX: number;
    baselineY: number;
    frames: Array<{
      id: string;
      offsetX: number;
      offsetY: number;
      anchorX: number;
      anchorY: number;
      groundY: number;
      scale: number;
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

function frameBottomGap(
  image: RgbaImage,
  cellWidth: number,
  cellHeight: number,
  frameIndex: number
): number {
  for (let y = cellHeight - 1; y >= 0; y -= 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      if (getPixel(image, frameIndex * cellWidth + x, y).a > 0) {
        return cellHeight - 1 - y;
      }
    }
  }

  return cellHeight;
}

function shiftFrameSegmentDown(
  image: RgbaImage,
  cellWidth: number,
  cellHeight: number,
  frameIndex: number,
  amount: number
) {
  if (amount <= 0) {
    return;
  }

  const startX = frameIndex * cellWidth;
  const snapshot = createImage(cellWidth, cellHeight, { a: 0 });

  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      setPixel(snapshot, x, y, getPixel(image, startX + x, y));
      setPixel(image, startX + x, y, { r: 0, g: 0, b: 0, a: 0 });
    }
  }

  for (let y = cellHeight - 1; y >= amount; y -= 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      setPixel(image, startX + x, y, getPixel(snapshot, x, y - amount));
    }
  }
}

export function renderAnimationSheet(
  animation: ProcessedAnimation,
  layout?: SheetExportLayout
): RenderedAnimationSheet {
  const padding = 0;
  const profile = computeAnimationExportProfile(animation);
  const cellWidth = layout?.cellWidth ?? profile.leftExtent + profile.rightExtent + padding * 2;
  const cellHeight = layout?.cellHeight ?? profile.topExtent + profile.bottomExtent + padding * 2;
  const pivotX = layout?.pivotX ?? profile.leftExtent + padding;
  const baselineY = layout?.baselineY ?? profile.topExtent + padding;
  const output = createImage(cellWidth * animation.frames.length, cellHeight, { a: 0 });

  animation.frames.forEach((frame, frameIndex) => {
    const sourceRect = profile.sourceRects[frameIndex];
    const scale = profile.frameScales[frameIndex] ?? 1;
    const localAnchorX = frame.analysis.coreAnchor.x;
    const localGroundY = frameContactY(frame);
    const baseX =
      frameIndex * cellWidth +
      pivotX +
      (localAnchorX + frame.offset.x - profile.anchorX);
    const baseY = baselineY + (localGroundY + frame.offset.y - profile.groundY);
    const startX = Math.floor(baseX + (sourceRect.x - localAnchorX) * scale);
    const endX = Math.ceil(baseX + (sourceRect.x + sourceRect.width - localAnchorX) * scale);
    const startY = Math.floor(baseY + (sourceRect.y - localGroundY) * scale);
    const endY = Math.ceil(baseY + (sourceRect.y + sourceRect.height - localGroundY) * scale);

    for (let targetY = startY; targetY < endY; targetY += 1) {
      if (targetY < 0 || targetY >= cellHeight) {
        continue;
      }

      for (let targetX = startX; targetX < endX; targetX += 1) {
        if (targetX < frameIndex * cellWidth || targetX >= (frameIndex + 1) * cellWidth) {
          continue;
        }

        const sourceX = Math.floor(localAnchorX + (targetX + 0.5 - baseX) / scale);
        const sourceY = Math.floor(localGroundY + (targetY + 0.5 - baseY) / scale);
        if (
          sourceX < sourceRect.x ||
          sourceY < sourceRect.y ||
          sourceX >= sourceRect.x + sourceRect.width ||
          sourceY >= sourceRect.y + sourceRect.height
        ) {
          continue;
        }

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
        setPixel(output, targetX, targetY, outputPixel);
      }
    }

    shiftFrameSegmentDown(
      output,
      cellWidth,
      cellHeight,
      frameIndex,
      frameBottomGap(output, cellWidth, cellHeight, frameIndex)
    );
  });

  return {
    image: output,
    metadata: {
      animationId: animation.id,
      row: animation.row,
      cellWidth,
      cellHeight,
      frameCount: animation.frames.length,
      pivotX,
      baselineY,
      frames: animation.frames.map((frame, index) => ({
        id: frame.id,
        offsetX: frame.offset.x,
        offsetY: frame.offset.y,
        anchorX: Number(frame.analysis.coreAnchor.x.toFixed(2)),
        anchorY: Number(frame.analysis.coreAnchor.y.toFixed(2)),
        groundY: frame.analysis.groundY,
        scale: profile.frameScales[index] ?? 1
      }))
    }
  };
}
