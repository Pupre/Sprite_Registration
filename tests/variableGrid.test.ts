import { describe, expect, it } from "vitest";
import { processSpriteImage } from "../src/core/pipeline/processSpriteImage";
import type { RgbaImage } from "../src/core/types/image";

function buildSheet(rowFrames: number[]): RgbaImage {
  const width = 360;
  const rowHeight = 60;
  const height = rowHeight * rowFrames.length;
  const image = {
    width,
    height,
    data: new Uint8Array(width * height * 4)
  };

  rowFrames.forEach((frames, rowIndex) => {
    const rowY = rowIndex * rowHeight;
    const gap = 6;
    const frameWidth = Math.floor((width - gap * (frames + 1)) / frames);

    for (let index = 0; index < frames; index += 1) {
      const startX = gap + index * (frameWidth + gap);
      for (let y = rowY + 8; y < rowY + rowHeight - 8; y += 1) {
        for (let x = startX; x < startX + frameWidth; x += 1) {
          const offset = (y * width + x) * 4;
          image.data[offset] = 40 + frames * 10;
          image.data[offset + 1] = 180;
          image.data[offset + 2] = 80 + index * 5;
          image.data[offset + 3] = 255;
        }
      }
    }
  });

  return image;
}

function buildSheetWithDetachedEffect(): { image: RgbaImage; detachedEffectEndX: number } {
  const width = 540;
  const rowHeight = 80;
  const frames = 6;
  const gap = 18;
  const frameWidth = Math.floor((width - gap * (frames + 1)) / frames);
  const image = {
    width,
    height: rowHeight,
    data: new Uint8Array(width * rowHeight * 4)
  };

  let detachedEffectEndX = 0;

  for (let index = 0; index < frames; index += 1) {
    const startX = gap + index * (frameWidth + gap);
    for (let y = 12; y < rowHeight - 12; y += 1) {
      for (let x = startX; x < startX + frameWidth - 10; x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = 60;
        image.data[offset + 1] = 180;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = 255;
      }
    }

    if (index === frames - 1) {
      const effectStartX = startX + frameWidth - 2;
      for (let y = 24; y < 36; y += 1) {
        for (let x = effectStartX + 6; x < effectStartX + 10; x += 1) {
          const offset = (y * width + x) * 4;
          image.data[offset] = 255;
          image.data[offset + 1] = 80;
          image.data[offset + 2] = 120;
          image.data[offset + 3] = 255;
          detachedEffectEndX = Math.max(detachedEffectEndX, x);
        }
      }
    }
  }

  return { image, detachedEffectEndX };
}

describe("variable grid processing", () => {
  it("processes rows with different frame counts", () => {
    const image = buildSheet([4, 6, 10, 5]);
    const result = processSpriteImage(image, "variable-test", 4, 4, {
      mode: "auto-variable",
      columns: 4,
      rows: 4
    });

    expect(result.animations).toHaveLength(4);
    expect(result.animations.map((animation) => animation.frames.length)).toEqual([4, 6, 10, 5]);
  });

  it("keeps uniform sheets compatible with the old layout assumption", () => {
    const image = buildSheet([4, 4, 4, 4]);
    const result = processSpriteImage(image, "uniform-compat", 4, 4, {
      mode: "manual-uniform"
    });

    expect(result.columns).toBe(4);
    expect(result.rows).toBe(4);
    expect(result.animations.map((animation) => animation.frames.length)).toEqual([4, 4, 4, 4]);
  });

  it("keeps tiny detached effects inside the owning frame", () => {
    const { image, detachedEffectEndX } = buildSheetWithDetachedEffect();
    const result = processSpriteImage(image, "detached-effect", 6, 1, {
      mode: "auto-variable",
      columns: 6,
      rows: 1
    });

    expect(result.animations).toHaveLength(1);
    expect(result.animations[0].frames).toHaveLength(6);

    const lastFrame = result.animations[0].frames[5];
    expect(lastFrame.rect.x + lastFrame.rect.width - 1).toBeGreaterThanOrEqual(detachedEffectEndX);
  });
});
