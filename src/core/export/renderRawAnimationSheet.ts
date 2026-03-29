import type { ProcessedAnimation, RgbaImage } from "../types/image";
import { createImage, getPixel, setPixel } from "../utils/image";

export interface RenderedRawAnimationSheet {
  image: RgbaImage;
  metadata: {
    animationId: string;
    row: number;
    cellWidth: number;
    cellHeight: number;
    frameCount: number;
  };
}

export function renderRawAnimationSheet(animation: ProcessedAnimation): RenderedRawAnimationSheet {
  const cellWidth = Math.max(...animation.frames.map((frame) => frame.image.width));
  const cellHeight = Math.max(...animation.frames.map((frame) => frame.image.height));
  const output = createImage(cellWidth * animation.frames.length, cellHeight, { a: 0 });

  animation.frames.forEach((frame, frameIndex) => {
    for (let y = 0; y < frame.image.height; y += 1) {
      for (let x = 0; x < frame.image.width; x += 1) {
        setPixel(output, frameIndex * cellWidth + x, y, getPixel(frame.image, x, y));
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
      frameCount: animation.frames.length
    }
  };
}
