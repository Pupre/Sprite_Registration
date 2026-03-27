import type {
  AlignedAnimationFrame,
  AnimationFrame,
  AnimationMetrics,
  ProcessedAnimation
} from "../types/image";
import type { Point } from "../types/sprite";
import { fitLinearTrend } from "../math/regression";
import { measureAnimationJitter } from "../metrics/jitter";

function roundPoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function sampleWeight(mask: number[][], x: number, y: number): number {
  if (y < 0 || x < 0 || y >= mask.length || x >= mask[0].length) {
    return 0;
  }
  return mask[y][x];
}

function scoreRelativeAlignment(
  referenceMask: number[][],
  referenceOffset: Point,
  candidateMask: number[][],
  candidateOffset: Point
): number {
  let overlap = 0;
  let penalty = 0;

  for (let y = 0; y < candidateMask.length; y += 1) {
    for (let x = 0; x < candidateMask[0].length; x += 1) {
      const value = candidateMask[y][x];
      if (value <= 0) {
        continue;
      }

      const worldX = x + candidateOffset.x;
      const worldY = y + candidateOffset.y;
      const referenceX = worldX - referenceOffset.x;
      const referenceY = worldY - referenceOffset.y;
      const matched = sampleWeight(referenceMask, referenceX, referenceY);
      overlap += Math.min(value, matched);
      penalty += Math.max(0, value - matched);
    }
  }

  return overlap - penalty * 0.65;
}

function refineOffset(previous: AnimationFrame, previousOffset: Point, current: AnimationFrame, baseOffset: Point): Point {
  let bestOffset = roundPoint(baseOffset);
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const candidate = { x: Math.round(baseOffset.x + dx), y: Math.round(baseOffset.y + dy) };
      const score = scoreRelativeAlignment(
        previous.analysis.weightedMask,
        previousOffset,
        current.analysis.weightedMask,
        candidate
      );
      if (score > bestScore) {
        bestScore = score;
        bestOffset = candidate;
      }
    }
  }

  return bestOffset;
}

export function alignAnimation(animationId: string, row: number, frames: AnimationFrame[]): ProcessedAnimation {
  const anchorXs = frames.map((frame) => frame.analysis.coreAnchor.x);
  const anchorYs = frames.map((frame) => frame.analysis.coreAnchor.y);
  const grounds = frames.map((frame) => frame.analysis.groundY);

  const trendX = fitLinearTrend(anchorXs);
  const trendY = fitLinearTrend(anchorYs);
  const trendGround = fitLinearTrend(grounds);

  const baseOffsets = frames.map((frame, index) => ({
    x: trendX.predicted[index] - frame.analysis.coreAnchor.x,
    y:
      (trendGround.predicted[index] - frame.analysis.groundY) * 0.72 +
      (trendY.predicted[index] - frame.analysis.coreAnchor.y) * 0.28
  }));

  const alignedOffsets: Point[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    if (index === 0) {
      alignedOffsets.push(roundPoint(baseOffsets[index]));
      continue;
    }

    alignedOffsets.push(
      refineOffset(frames[index - 1], alignedOffsets[index - 1], frames[index], baseOffsets[index])
    );
  }

  const alignedFrames: AlignedAnimationFrame[] = frames.map((frame, index) => ({
    ...frame,
    offset: alignedOffsets[index]
  }));

  const raw = measureAnimationJitter(frames);
  const aligned = measureAnimationJitter(frames, alignedOffsets);
  const metrics: AnimationMetrics = {
    rawJitterScore: raw.combined,
    alignedJitterScore: aligned.combined,
    improvementRatio: raw.combined === 0 ? 1 : aligned.combined / raw.combined
  };

  return {
    id: animationId,
    row,
    frames: alignedFrames,
    metrics
  };
}
