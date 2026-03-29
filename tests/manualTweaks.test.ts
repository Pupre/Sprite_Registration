import { describe, expect, it } from "vitest";
import { alignAnimation } from "../src/core/alignment/alignAnimation";
import { applyManualTweaks } from "../src/core/alignment/applyManualTweaks";
import { analyzeForeground } from "../src/core/mask/foreground";
import type { AnimationFrame } from "../src/core/types/image";
import { createImage, setPixel } from "../src/core/utils/image";

function makeFrame(id: string, bodyX: number, bodyY: number): AnimationFrame {
  const image = createImage(20, 20, { a: 0, r: 0, g: 0, b: 0 });
  for (let y = bodyY; y < bodyY + 6; y += 1) {
    for (let x = bodyX; x < bodyX + 6; x += 1) {
      setPixel(image, x, y, { r: 70, g: 220, b: 110, a: 255 });
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

describe("applyManualTweaks", () => {
  it("applies per-frame offset deltas and recalculates aligned jitter metrics", () => {
    const animation = alignAnimation("manual-row", 0, [
      makeFrame("f0", 6, 10),
      makeFrame("f1", 7, 9),
      makeFrame("f2", 6, 10),
      makeFrame("f3", 7, 10)
    ]);

    const tweaked = applyManualTweaks(animation, {
      f1: { x: 2, y: -1 },
      f3: { x: -1, y: 1 }
    });

    expect(tweaked.frames[1].offset.x).toBe(animation.frames[1].offset.x + 2);
    expect(tweaked.frames[1].offset.y).toBe(animation.frames[1].offset.y - 1);
    expect(tweaked.frames[3].offset.x).toBe(animation.frames[3].offset.x - 1);
    expect(tweaked.frames[3].offset.y).toBe(animation.frames[3].offset.y + 1);
    expect(tweaked.metrics.rawJitterScore).toBe(animation.metrics.rawJitterScore);
    expect(tweaked.metrics.alignedJitterScore).not.toBe(animation.metrics.alignedJitterScore);
  });
});
