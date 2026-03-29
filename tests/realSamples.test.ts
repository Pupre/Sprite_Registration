import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { frameContactY } from "../src/core/alignment/contact";
import { renderAnimationSheet } from "../src/core/export/renderAnimationSheet";
import { renderInterpolatedAnimationSheet } from "../src/core/export/renderInterpolatedAnimationSheet";
import { processSpriteSheet } from "../src/core/pipeline/processSpriteSheet";
import type { AlignedAnimationFrame, RgbaPixel } from "../src/core/types/image";
import { getPixel } from "../src/core/utils/image";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");
const samples = ["GeneralFrog.png", "Slime.png", "Sparky.png"];
const transparentSamples = ["GeneralFrog.png", "Sparky.png"];
const opaqueSamples = ["Slime.png"];

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

function range(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function measureBottomGap(
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

function measureVisibleHeight(
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

          const rendered = renderAnimationSheet(animation, result.exportLayout);
          expect(rendered.image.width).toBeGreaterThan(0);
          expect(rendered.image.height).toBeGreaterThan(0);
          expect(rendered.metadata.frameCount).toBe(4);

          ratios.push(animation.metrics.improvementRatio);
        }
      }

      const averageRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
      const improvedAnimations = ratios.filter((ratio) => ratio < 1).length;
      const maxRatio = Math.max(...ratios);

      expect(improvedAnimations).toBe(9);
      expect(averageRatio).toBeLessThan(0.25);
      expect(maxRatio).toBeLessThan(0.65);
    },
    90000
  );

  it(
    "keeps transparent sample anchors and grounded export baselines tight",
    async () => {
      const results = await Promise.all(
        transparentSamples.map((file) => processSpriteSheet(path.join(root, "samples", file), 4, 3))
      );

      for (const result of results) {
        const sampleBottomGaps: number[] = [];

        for (const animation of result.animations) {
          const anchorXs = animation.frames.map((frame) => frame.analysis.coreAnchor.x + frame.offset.x);
          const contactYs = animation.frames.map((frame) => frameContactY(frame) + frame.offset.y);
          const rendered = renderAnimationSheet(animation, result.exportLayout);
          const bottomGaps = animation.frames.map((_, frameIndex) =>
            measureBottomGap(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, frameIndex)
          );
          const visibleHeights = animation.frames.map((_, frameIndex) =>
            measureVisibleHeight(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, frameIndex)
          );

          sampleBottomGaps.push(...bottomGaps);

          expect(range(anchorXs)).toBeLessThanOrEqual(1.25);
          expect(range(contactYs)).toBeLessThanOrEqual(1.25);
          expect(Math.max(...bottomGaps)).toBeLessThanOrEqual(1);
          expect(range(bottomGaps)).toBeLessThanOrEqual(1);
          expect(range(visibleHeights)).toBeLessThanOrEqual(4);
        }

        expect(Math.max(...sampleBottomGaps)).toBeLessThanOrEqual(1);
        expect(range(sampleBottomGaps)).toBeLessThanOrEqual(1);
      }
    },
    90000
  );

  it(
    "renders transparent interpolation strips with expanded frame counts while keeping grounded baselines",
    async () => {
      const results = await Promise.all(
        transparentSamples.map((file) => processSpriteSheet(path.join(root, "samples", file), 4, 3))
      );

      for (const result of results) {
        for (const animation of result.animations) {
          const rendered = renderInterpolatedAnimationSheet(animation, result.exportLayout);
          const bottomGaps = Array.from({ length: rendered.metadata.frameCount }, (_, frameIndex) =>
            measureBottomGap(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, frameIndex)
          );

          expect(rendered.metadata.frameCount).toBe(animation.frames.length * 2 - 1);
          expect(rendered.metadata.insertedFrameCount).toBe(animation.frames.length - 1);
          expect(rendered.metadata.sourceFrameCount).toBe(animation.frames.length);
          expect(Math.max(...bottomGaps)).toBeLessThanOrEqual(1);
          expect(range(bottomGaps)).toBeLessThanOrEqual(1);
        }
      }
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
          const rendered = renderAnimationSheet(animation, result.exportLayout);
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
