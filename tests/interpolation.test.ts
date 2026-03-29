import { describe, expect, it } from "vitest";
import { renderInterpolatedAnimationSheet } from "../src/core/export/renderInterpolatedAnimationSheet";
import { analyzeForeground } from "../src/core/mask/foreground";
import type { ProcessedAnimation } from "../src/core/types/image";
import { createImage, getPixel, setPixel } from "../src/core/utils/image";

function makeFrame(shiftX: number) {
  const image = createImage(20, 20, { a: 0, r: 0, g: 0, b: 0 });

  for (let y = 9; y < 17; y += 1) {
    for (let x = 5 + shiftX; x < 11 + shiftX; x += 1) {
      setPixel(image, x, y, { r: 110, g: 220, b: 120, a: 255 });
    }
  }

  return {
    id: `f-${shiftX}`,
    row: 0,
    column: shiftX,
    rect: { x: 0, y: 0, width: image.width, height: image.height },
    image,
    analysis: analyzeForeground(image),
    offset: { x: 0, y: 0 }
  };
}

function bottomGap(
  image: { width: number; height: number; data: Uint8Array },
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

function visiblePixels(
  image: { width: number; height: number; data: Uint8Array },
  cellWidth: number,
  cellHeight: number,
  frameIndex: number
): number {
  let visible = 0;
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      if (getPixel(image, frameIndex * cellWidth + x, y).a > 0) {
        visible += 1;
      }
    }
  }
  return visible;
}

describe("renderInterpolatedAnimationSheet", () => {
  it("inserts midpoint frames while preserving grounded output cells", () => {
    const animation: ProcessedAnimation = {
      id: "synthetic-row-1",
      row: 0,
      frames: [makeFrame(0), makeFrame(1)],
      metrics: {
        rawJitterScore: 0,
        alignedJitterScore: 0,
        improvementRatio: 1
      }
    };

    const rendered = renderInterpolatedAnimationSheet(animation);
    const gaps = [0, 1, 2].map((frameIndex) =>
      bottomGap(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, frameIndex)
    );

    expect(rendered.metadata.sourceFrameCount).toBe(2);
    expect(rendered.metadata.frameCount).toBe(3);
    expect(rendered.metadata.insertedFrameCount).toBe(1);
    expect(rendered.image.width).toBe(rendered.metadata.cellWidth * 3);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    expect(visiblePixels(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, 1)).toBeGreaterThan(0);
  });
});
