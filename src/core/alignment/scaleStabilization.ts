import type { ProcessedAnimation } from "../types/image";

const MIN_SCALE = 0.96;
const MAX_SCALE = 1.06;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 1;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeFrameScaleFactors(animation: ProcessedAnimation): number[] {
  if (!animation.frames.every((frame) => frame.analysis.alphaMode)) {
    return animation.frames.map(() => 1);
  }

  const coreHeights = animation.frames.map((frame) => Math.max(1, frame.analysis.coreBounds.height));
  const referenceHeight = median(coreHeights);

  return animation.frames.map((frame) => {
    const heightRatio = referenceHeight / Math.max(1, frame.analysis.coreBounds.height);
    const stabilized = clamp(heightRatio, MIN_SCALE, MAX_SCALE);
    return Math.abs(stabilized - 1) < 0.015 ? 1 : Number(stabilized.toFixed(4));
  });
}
