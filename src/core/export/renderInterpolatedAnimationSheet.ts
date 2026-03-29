import type { ProcessedAnimation, RgbaImage, SheetExportLayout } from "../types/image";
import { createImage, cropImage, getPixel, setPixel } from "../utils/image";
import { renderAnimationSheet } from "./renderAnimationSheet";

export interface RenderedInterpolatedAnimationSheet {
  image: RgbaImage;
  metadata: {
    animationId: string;
    row: number;
    cellWidth: number;
    cellHeight: number;
    frameCount: number;
    sourceFrameCount: number;
    insertedFrameCount: number;
    strategy: "alpha-aware-blend";
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bottomGap(image: RgbaImage): number {
  for (let y = image.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (getPixel(image, x, y).a > 0) {
        return image.height - 1 - y;
      }
    }
  }

  return image.height;
}

function shiftDown(image: RgbaImage, amount: number): RgbaImage {
  if (amount <= 0) {
    return image;
  }

  const output = createImage(image.width, image.height, { a: 0 });
  for (let y = image.height - 1; y >= amount; y -= 1) {
    for (let x = 0; x < image.width; x += 1) {
      setPixel(output, x, y, getPixel(image, x, y - amount));
    }
  }

  return output;
}

function blendMidFrame(sourceA: RgbaImage, sourceB: RgbaImage, t: number): RgbaImage {
  const output = createImage(sourceA.width, sourceA.height, { a: 0 });

  for (let y = 0; y < sourceA.height; y += 1) {
    for (let x = 0; x < sourceA.width; x += 1) {
      const pixelA = getPixel(sourceA, x, y);
      const pixelB = getPixel(sourceB, x, y);
      const alphaA = pixelA.a / 255;
      const alphaB = pixelB.a / 255;

      if (alphaA <= 0.01 && alphaB <= 0.01) {
        continue;
      }

      const bothVisible = alphaA > 0.08 && alphaB > 0.08;
      const dominant = alphaA >= alphaB ? pixelA : pixelB;
      const mixedAlpha = bothVisible
        ? Math.round(lerp(pixelA.a, pixelB.a, t))
        : Math.round(Math.max(pixelA.a, pixelB.a) * 0.58);

      if (mixedAlpha <= 10) {
        continue;
      }

      const nextPixel = bothVisible
        ? {
            r: Math.round(lerp(pixelA.r, pixelB.r, t)),
            g: Math.round(lerp(pixelA.g, pixelB.g, t)),
            b: Math.round(lerp(pixelA.b, pixelB.b, t)),
            a: mixedAlpha >= 216 ? 255 : mixedAlpha
          }
        : {
            ...dominant,
            a: mixedAlpha
          };

      setPixel(output, x, y, nextPixel);
    }
  }

  const targetGap = Math.min(bottomGap(sourceA), bottomGap(sourceB));
  const currentGap = bottomGap(output);
  return shiftDown(output, Math.max(0, currentGap - targetGap));
}

export function renderInterpolatedAnimationSheet(
  animation: ProcessedAnimation,
  layout?: SheetExportLayout
): RenderedInterpolatedAnimationSheet {
  const rendered = renderAnimationSheet(animation, layout);
  const frames: RgbaImage[] = [];

  for (let frameIndex = 0; frameIndex < rendered.metadata.frameCount; frameIndex += 1) {
    frames.push(
      cropImage(rendered.image, {
        x: frameIndex * rendered.metadata.cellWidth,
        y: 0,
        width: rendered.metadata.cellWidth,
        height: rendered.metadata.cellHeight
      })
    );
  }

  const outputFrames: RgbaImage[] = [];
  frames.forEach((frame, frameIndex) => {
    outputFrames.push(frame);
    if (frameIndex < frames.length - 1) {
      outputFrames.push(blendMidFrame(frame, frames[frameIndex + 1], 0.5));
    }
  });

  const output = createImage(
    rendered.metadata.cellWidth * outputFrames.length,
    rendered.metadata.cellHeight,
    { a: 0 }
  );

  outputFrames.forEach((frame, frameIndex) => {
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        setPixel(output, frameIndex * frame.width + x, y, getPixel(frame, x, y));
      }
    }
  });

  return {
    image: output,
    metadata: {
      animationId: animation.id,
      row: animation.row,
      cellWidth: rendered.metadata.cellWidth,
      cellHeight: rendered.metadata.cellHeight,
      frameCount: outputFrames.length,
      sourceFrameCount: rendered.metadata.frameCount,
      insertedFrameCount: Math.max(0, outputFrames.length - rendered.metadata.frameCount),
      strategy: "alpha-aware-blend"
    }
  };
}
