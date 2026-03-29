import { describe, expect, it } from "vitest";
import { alignAnimation } from "../src/core/alignment/alignAnimation";
import { renderRawAnimationSheet } from "../src/core/export/renderRawAnimationSheet";
import { analyzeForeground } from "../src/core/mask/foreground";
import type { AnimationFrame } from "../src/core/types/image";
import { createImage, setPixel } from "../src/core/utils/image";

function makeFrame(id: string, width: number, height: number, bodyX: number, bodyY: number): AnimationFrame {
  const image = createImage(width, height, { a: 0, r: 0, g: 0, b: 0 });
  for (let y = bodyY; y < bodyY + 4; y += 1) {
    for (let x = bodyX; x < bodyX + 4; x += 1) {
      setPixel(image, x, y, { r: 90, g: 210, b: 130, a: 255 });
    }
  }

  return {
    id,
    row: 0,
    column: 0,
    rect: { x: 0, y: 0, width, height },
    image,
    analysis: analyzeForeground(image)
  };
}

describe("renderRawAnimationSheet", () => {
  it("lays out original cells side by side without applying registration offsets", () => {
    const animation = alignAnimation("raw-preview-row", 0, [
      makeFrame("f0", 20, 18, 4, 8),
      makeFrame("f1", 24, 18, 8, 8),
      makeFrame("f2", 22, 21, 6, 11)
    ]);

    const rendered = renderRawAnimationSheet(animation);

    expect(rendered.metadata.frameCount).toBe(3);
    expect(rendered.metadata.cellWidth).toBe(24);
    expect(rendered.metadata.cellHeight).toBe(21);
    expect(rendered.image.width).toBe(72);
    expect(rendered.image.height).toBe(21);
  });
});
