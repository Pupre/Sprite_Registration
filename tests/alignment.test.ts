import { describe, expect, it } from "vitest";
import { alignAnimation } from "../src/core/alignment/alignAnimation";
import { frameContactY } from "../src/core/alignment/contact";
import { analyzeForeground } from "../src/core/mask/foreground";
import type { AnimationFrame } from "../src/core/types/image";
import { createImage, setPixel } from "../src/core/utils/image";

function makeSyntheticFrame(id: string, bodyX: number, bodyY: number, effect = false): AnimationFrame {
  const image = createImage(20, 20, { a: 0, r: 0, g: 0, b: 0 });
  for (let y = bodyY; y < bodyY + 6; y += 1) {
    for (let x = bodyX; x < bodyX + 6; x += 1) {
      setPixel(image, x, y, { r: 70, g: 220, b: 110, a: 255 });
    }
  }

  if (effect) {
    for (let y = bodyY + 2; y < bodyY + 4; y += 1) {
      for (let x = bodyX + 6; x < bodyX + 9; x += 1) {
        setPixel(image, x, y, { r: 255, g: 190, b: 80, a: 180 });
      }
    }
  }

  return {
    id,
    row: 0,
    column: 0,
    rect: { x: 0, y: 0, width: image.width, height: image.height },
    image,
    analysis: analyzeForeground(image)
  };
}

describe("alignAnimation", () => {
  it("reduces synthetic idle jitter while ignoring a small transient effect", () => {
    const frames = [
      makeSyntheticFrame("f0", 6, 10),
      makeSyntheticFrame("f1", 7, 9),
      makeSyntheticFrame("f2", 6, 10, true),
      makeSyntheticFrame("f3", 7, 10)
    ].map((frame, index) => ({ ...frame, column: index }));

    const aligned = alignAnimation("synthetic-row-1", 0, frames);
    const alignedAnchorsX = aligned.frames.map((frame) => frame.analysis.coreAnchor.x + frame.offset.x);
    const alignedGroundsY = aligned.frames.map((frame) => frameContactY(frame) + frame.offset.y);

    expect(aligned.metrics.rawJitterScore).toBeGreaterThan(0);
    expect(aligned.metrics.improvementRatio).toBeLessThan(0.3);
    expect(Math.max(...alignedAnchorsX) - Math.min(...alignedAnchorsX)).toBeLessThanOrEqual(1);
    expect(Math.max(...alignedGroundsY) - Math.min(...alignedGroundsY)).toBeLessThanOrEqual(1);
  });
});
