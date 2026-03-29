import type {
  AlignedAnimationFrame,
  AnimationFrame,
  AnimationMetrics,
  ProcessedAnimation
} from "../types/image";
import type { Point } from "../types/sprite";
import { frameContactY } from "./contact";
import { measureAnimationJitter } from "../metrics/jitter";

interface AlignmentTarget {
  anchorX: number;
  contactY: number;
}

interface ConsensusMask {
  originX: number;
  originY: number;
  matrix: number[][];
}

const SEARCH_RADIUS_X = 6;
const SEARCH_RADIUS_Y = 5;
const OPTIMIZATION_PASSES = 3;

function roundPoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function sampleWeight(mask: number[][], x: number, y: number): number {
  if (y < 0 || x < 0 || y >= mask.length || x >= mask[0].length) {
    return 0;
  }
  return mask[y][x];
}

function weightedMass(mask: number[][]): number {
  return mask.reduce(
    (sum, row) => sum + row.reduce((rowSum, value) => rowSum + value, 0),
    0
  );
}

function buildConsensusMask(
  frames: AnimationFrame[],
  offsets: Point[],
  skipIndex: number
): ConsensusMask | null {
  const contributors = frames
    .map((frame, index) => ({ frame, offset: offsets[index], index }))
    .filter((entry) => entry.index !== skipIndex);

  if (contributors.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const { frame, offset } of contributors) {
    minX = Math.min(minX, offset.x);
    minY = Math.min(minY, offset.y);
    maxX = Math.max(maxX, offset.x + frame.image.width);
    maxY = Math.max(maxY, offset.y + frame.image.height);
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const matrix = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));

  for (const { frame, offset } of contributors) {
    for (let y = 0; y < frame.analysis.weightedMask.length; y += 1) {
      for (let x = 0; x < frame.analysis.weightedMask[0].length; x += 1) {
        const value = frame.analysis.weightedMask[y][x];
        if (value <= 0) {
          continue;
        }

        matrix[y + offset.y - minY][x + offset.x - minX] += value;
      }
    }
  }

  return {
    originX: minX,
    originY: minY,
    matrix
  };
}

function scoreAgainstConsensus(
  candidateMask: number[][],
  candidateOffset: Point,
  consensus: ConsensusMask
): number {
  let overlap = 0;
  let penalty = 0;

  for (let y = 0; y < candidateMask.length; y += 1) {
    for (let x = 0; x < candidateMask[0].length; x += 1) {
      const value = candidateMask[y][x];
      if (value <= 0) {
        continue;
      }

      const matched = sampleWeight(
        consensus.matrix,
        x + candidateOffset.x - consensus.originX,
        y + candidateOffset.y - consensus.originY
      );

      overlap += Math.min(value, matched);
      penalty += Math.max(0, value - matched);
    }
  }

  return overlap - penalty * 0.82;
}

function scoreCandidate(
  frame: AnimationFrame,
  candidate: Point,
  baseOffset: Point,
  target: AlignmentTarget,
  consensus: ConsensusMask | null
): number {
  const mass = Math.max(1, weightedMass(frame.analysis.weightedMask));
  const alignedAnchorX = frame.analysis.coreAnchor.x + candidate.x;
  const alignedContactY = frameContactY(frame) + candidate.y;
  const anchorError = Math.abs(alignedAnchorX - target.anchorX);
  const groundError = Math.abs(alignedContactY - target.contactY);
  const regularization = Math.hypot(candidate.x - baseOffset.x, candidate.y - baseOffset.y);

  let score = 0;
  if (consensus) {
    score += scoreAgainstConsensus(frame.analysis.weightedMask, candidate, consensus);
  }

  score -= anchorError * mass * 0.28;
  score -= groundError * mass * 0.42;
  score -= regularization * mass * 0.08;
  return score;
}

function refineOffset(
  frame: AnimationFrame,
  currentOffset: Point,
  baseOffset: Point,
  target: AlignmentTarget,
  consensus: ConsensusMask | null
): Point {
  let bestOffset = roundPoint(currentOffset);
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let dy = -SEARCH_RADIUS_Y; dy <= SEARCH_RADIUS_Y; dy += 1) {
    for (let dx = -SEARCH_RADIUS_X; dx <= SEARCH_RADIUS_X; dx += 1) {
      const candidate = {
        x: Math.round(currentOffset.x + dx),
        y: Math.round(currentOffset.y + dy)
      };
      const score = scoreCandidate(frame, candidate, baseOffset, target, consensus);
      if (score > bestScore) {
        bestScore = score;
        bestOffset = candidate;
      }
    }
  }

  return bestOffset;
}

export function alignAnimation(animationId: string, row: number, frames: AnimationFrame[]): ProcessedAnimation {
  const target: AlignmentTarget = {
    anchorX: median(frames.map((frame) => frame.analysis.coreAnchor.x)),
    contactY: median(frames.map((frame) => frameContactY(frame)))
  };

  const baseOffsets = frames.map((frame) => ({
    x: target.anchorX - frame.analysis.coreAnchor.x,
    y: target.contactY - frameContactY(frame)
  }));

  let alignedOffsets = baseOffsets.map(roundPoint);

  for (let pass = 0; pass < OPTIMIZATION_PASSES; pass += 1) {
    alignedOffsets = alignedOffsets.map((offset, index) => {
      const consensus = buildConsensusMask(frames, alignedOffsets, index);
      const searchStart =
        pass === 0
          ? roundPoint(baseOffsets[index])
          : roundPoint({
              x: (alignedOffsets[index].x + baseOffsets[index].x) / 2,
              y: (alignedOffsets[index].y + baseOffsets[index].y) / 2
            });

      return refineOffset(frames[index], searchStart, baseOffsets[index], target, consensus);
    });
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
