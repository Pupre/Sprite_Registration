import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderAnimationSheet } from "../src/core/export/renderAnimationSheet";
import { processSpriteSheet } from "../src/core/pipeline/processSpriteSheet";
import type { AlignedAnimationFrame, RgbaPixel } from "../src/core/types/image";
import { getPixel } from "../src/core/utils/image";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");
const samples = ["GeneralFrog.png", "Slime.png", "Sparky.png"];
const opaqueSamples = ["GeneralFrog.png", "Slime.png"];

function saturation(pixel: RgbaPixel): number {
  return Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
}

function backgroundDistance(pixel: RgbaPixel, palette: RgbaPixel[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const colorDistance = Math.hypot(pixel.r - candidate.r, pixel.g - candidate.g, pixel.b - candidate.b);
    const saturationDistance = Math.abs(saturation(pixel) - saturation(candidate)) * 0.9;
    best = Math.min(best, colorDistance + saturationDistance);
  }
  return best;
}

function measureOpaqueArtifactRatio(
  frame: AlignedAnimationFrame,
  renderedImage: { width: number; height: number; data: Uint8Array },
  cellWidth: number,
  cellHeight: number,
  frameIndex: number
): number {
  let visible = 0;
  let backgroundLike = 0;

  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const pixel = getPixel(renderedImage, frameIndex * cellWidth + x, y);
      if (pixel.a <= 220) {
        continue;
      }
      visible += 1;
      if (backgroundDistance(pixel, frame.analysis.backgroundPalette) < 28) {
        backgroundLike += 1;
      }
    }
  }

  return backgroundLike / Math.max(1, visible);
}

describe("real sample pipeline", () => {
  it(
    "processes the provided sample sheets into 3 aligned row animations each",
    async () => {
      const results = await Promise.all(
        samples.map((file) => processSpriteSheet(path.join(root, "samples", file), 4, 3))
      );

      expect(results).toHaveLength(3);

      const ratios: number[] = [];
      for (const result of results) {
        expect(result.animations).toHaveLength(3);

        for (const animation of result.animations) {
          expect(animation.frames).toHaveLength(4);
          expect(animation.frames.every((frame) => frame.analysis.area > 50)).toBe(true);

          const rendered = renderAnimationSheet(animation);
          expect(rendered.image.width).toBeGreaterThan(0);
          expect(rendered.image.height).toBeGreaterThan(0);
          expect(rendered.metadata.frameCount).toBe(4);

          ratios.push(animation.metrics.improvementRatio);
        }
      }

      const averageRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
      const improvedAnimations = ratios.filter((ratio) => ratio < 1).length;

      expect(improvedAnimations).toBeGreaterThanOrEqual(6);
      expect(averageRatio).toBeLessThan(0.95);
    },
    90000
  );

  it(
    "keeps opaque-background bounds and rendered artifacts under control",
    async () => {
      const results = await Promise.all(
        opaqueSamples.map((file) => processSpriteSheet(path.join(root, "samples", file), 4, 3))
      );

      const artifactRatios: number[] = [];
      for (const result of results) {
        for (const animation of result.animations) {
          const rendered = renderAnimationSheet(animation);
          for (let frameIndex = 0; frameIndex < animation.frames.length; frameIndex += 1) {
            const frame = animation.frames[frameIndex];
            const bounds = frame.analysis.fullBounds;
            const coverage = (bounds.width * bounds.height) / (frame.image.width * frame.image.height);
            const touchCount =
              Number(bounds.x <= 0) +
              Number(bounds.y <= 0) +
              Number(bounds.x + bounds.width >= frame.image.width) +
              Number(bounds.y + bounds.height >= frame.image.height);

            expect(coverage).toBeLessThan(0.8);
            expect(touchCount).toBeLessThanOrEqual(1);
            if (touchCount === 1) {
              expect(coverage).toBeLessThan(0.76);
            }

            artifactRatios.push(
              measureOpaqueArtifactRatio(
                frame,
                rendered.image,
                rendered.metadata.cellWidth,
                rendered.metadata.cellHeight,
                frameIndex
              )
            );
          }
        }
      }

      const averageArtifactRatio = artifactRatios.reduce((sum, ratio) => sum + ratio, 0) / artifactRatios.length;
      expect(averageArtifactRatio).toBeLessThan(0.01);
      expect(Math.max(...artifactRatios)).toBeLessThan(0.02);
    },
    90000
  );
});
