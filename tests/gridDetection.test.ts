import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectGridRects } from "../src/core/grid/detectGrid";
import { loadPng } from "../src/core/io/png";
import type { Rect, RgbaImage } from "../src/core/types/image";
import { rectUnion } from "../src/core/utils/image";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");

function alphaBounds(image: RgbaImage, threshold = 8): Rect {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha <= threshold) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: image.width, height: image.height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

describe("detectGridRects", () => {
  it(
    "keeps transparent Sparky grid bounds tight even when the sheet has large outer padding",
    async () => {
      const image = await loadPng(path.join(root, "samples", "Sparky.png"));
      const rects = detectGridRects(image, 4, 3);

      expect(rects).toHaveLength(12);

      const widths = rects.slice(0, 4).map((rect) => rect.width);
      const heights = [0, 4, 8].map((index) => rects[index].height);

      expect(Math.max(...widths) / Math.max(1, Math.min(...widths))).toBeLessThan(1.25);
      expect(Math.max(...heights) / Math.max(1, Math.min(...heights))).toBeLessThan(1.25);

      const contentBounds = alphaBounds(image);
      const gridBounds = rectUnion(rects);

      const leftSlack = contentBounds.x - gridBounds.x;
      const topSlack = contentBounds.y - gridBounds.y;
      const rightSlack =
        gridBounds.x + gridBounds.width - (contentBounds.x + contentBounds.width);
      const bottomSlack =
        gridBounds.y + gridBounds.height - (contentBounds.y + contentBounds.height);

      expect(gridBounds.x).toBeLessThanOrEqual(contentBounds.x);
      expect(gridBounds.y).toBeLessThanOrEqual(contentBounds.y);
      expect(gridBounds.x + gridBounds.width).toBeGreaterThanOrEqual(contentBounds.x + contentBounds.width);
      expect(gridBounds.y + gridBounds.height).toBeGreaterThanOrEqual(contentBounds.y + contentBounds.height);

      expect(leftSlack).toBeLessThanOrEqual(96);
      expect(topSlack).toBeLessThanOrEqual(96);
      expect(rightSlack).toBeLessThanOrEqual(96);
      expect(bottomSlack).toBeLessThanOrEqual(96);
    },
    90000
  );
});
