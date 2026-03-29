import { describe, expect, it } from "vitest";
import { renderAnimationSheet } from "../src/core/export/renderAnimationSheet";
import type { ProcessedAnimation } from "../src/core/types/image";
import { analyzeForeground } from "../src/core/mask/foreground";
import { createImage, getPixel, setPixel } from "../src/core/utils/image";

function makeFrame(id: string, bodyWidth: number, bodyHeight: number) {
  const image = createImage(24, 24, { a: 0, r: 0, g: 0, b: 0 });
  const startX = Math.floor((24 - bodyWidth) / 2);
  const startY = 24 - bodyHeight - 1;

  for (let y = startY; y < startY + bodyHeight; y += 1) {
    for (let x = startX; x < startX + bodyWidth; x += 1) {
      setPixel(image, x, y, { r: 110, g: 220, b: 120, a: 255 });
    }
  }

  return {
    id,
    row: 0,
    column: 0,
    rect: { x: 0, y: 0, width: image.width, height: image.height },
    image,
    analysis: analyzeForeground(image),
    offset: { x: 0, y: 0 }
  };
}

function visibleHeight(
  image: { width: number; height: number; data: Uint8Array },
  cellWidth: number,
  cellHeight: number,
  frameIndex: number
): number {
  let top = cellHeight;
  let bottom = -1;

  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      if (getPixel(image, frameIndex * cellWidth + x, y).a > 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return bottom < top ? 0 : bottom - top + 1;
}

describe("scale stabilization", () => {
  it("reduces small core-body size differences in rendered output", () => {
    const animation: ProcessedAnimation = {
      id: "scale-row-1",
      row: 0,
      frames: [
        makeFrame("f1", 8, 12),
        makeFrame("f2", 8, 13),
        makeFrame("f3", 8, 11),
        makeFrame("f4", 8, 12)
      ],
      metrics: {
        rawJitterScore: 0,
        alignedJitterScore: 0,
        improvementRatio: 1
      }
    };

    const rendered = renderAnimationSheet(animation);
    const heights = animation.frames.map((_, frameIndex) =>
      visibleHeight(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, frameIndex)
    );

    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  });
});
