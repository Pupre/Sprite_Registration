import type {
  AlignmentConfig,
  FrameAlignment,
  Point,
  SequenceAlignmentResult,
  SpriteFrame
} from "../types/sprite";
import { analyzeFrame } from "./coreMask";
import { shiftedSample } from "../utils/matrix";

interface PresetWeights {
  smoothing: number;
  anchorX: number;
  anchorY: number;
  groundY: number;
  searchX: number;
  searchY: number;
}

const presetWeights: Record<AlignmentConfig["motionPreset"], PresetWeights> = {
  idle: {
    smoothing: 0.86,
    anchorX: 0.85,
    anchorY: 0.4,
    groundY: 0.6,
    searchX: 0.15,
    searchY: 0.1
  },
  locomotion: {
    smoothing: 0.64,
    anchorX: 0.74,
    anchorY: 0.22,
    groundY: 0.68,
    searchX: 0.26,
    searchY: 0.1
  },
  airborne: {
    smoothing: 0.12,
    anchorX: 0.82,
    anchorY: 0.02,
    groundY: 0,
    searchX: 0.18,
    searchY: 0.04
  },
  attack: {
    smoothing: 0.44,
    anchorX: 0.74,
    anchorY: 0.25,
    groundY: 0.48,
    searchX: 0.26,
    searchY: 0.08
  },
  freeform: {
    smoothing: 0.18,
    anchorX: 0.56,
    anchorY: 0.04,
    groundY: 0,
    searchX: 0.3,
    searchY: 0.06
  }
};

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

function roundPoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function scoreShift(reference: number[][], candidate: number[][], dx: number, dy: number): number {
  let overlap = 0;
  let penalty = 0;

  reference.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value <= 0) {
        return;
      }

      const shifted = shiftedSample(candidate, x + dx, y + dy);
      overlap += Math.min(value, shifted);
      penalty += Math.max(0, value - shifted);
    });
  });

  return overlap - penalty * 0.75;
}

function searchOffset(reference: number[][], candidate: number[][], radius: number): Point {
  let best = { x: 0, y: 0 };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const score = scoreShift(reference, candidate, dx, dy);
      if (score > bestScore) {
        bestScore = score;
        best = { x: dx, y: dy };
      }
    }
  }

  return best;
}

function stabilizeOffsets(offsets: Point[], config: AlignmentConfig): Point[] {
  const preset = presetWeights[config.motionPreset];
  const smoothing = Math.min(0.96, Math.max(config.smoothingAlpha, preset.smoothing));
  const stabilized: Point[] = [];

  offsets.forEach((offset, index) => {
    if (index === 0) {
      stabilized.push(offset);
      return;
    }

    if (config.motionPreset === "airborne" || config.motionPreset === "freeform") {
      stabilized.push(offset);
      return;
    }

    const previous = stabilized[index - 1];
    const smoothed = add(scale(previous, smoothing), scale(offset, 1 - smoothing));
    stabilized.push(roundPoint(smoothed));
  });

  return stabilized;
}

export function registerSequence(
  frames: SpriteFrame[],
  config: AlignmentConfig
): SequenceAlignmentResult {
  if (frames.length === 0) {
    return { frames: [] };
  }

  const preset = presetWeights[config.motionPreset];
  const analyses = frames.map((frame) => analyzeFrame(frame, config.effectThreshold));
  const targetGround = analyses[0].groundY;
  const targetAnchor = analyses[0].coreAnchor;

  const rawOffsets = analyses.map((analysis, index) => {
    if (index === 0) {
      return { x: 0, y: 0 };
    }

    const anchorDelta = subtract(targetAnchor, analysis.coreAnchor);
    const groundDelta = targetGround - analysis.groundY;
    const searched = searchOffset(analyses[index - 1].weightedMask, analysis.weightedMask, config.searchRadius);

    return roundPoint({
      x: anchorDelta.x * preset.anchorX + searched.x * preset.searchX,
      y:
        anchorDelta.y * preset.anchorY +
        groundDelta * preset.groundY +
        searched.y * preset.searchY
    });
  });

  const stabilizedOffsets = stabilizeOffsets(rawOffsets, config);

  const alignedFrames: FrameAlignment[] = analyses.map((analysis, index) => ({
    id: analysis.id,
    analysis,
    rawOffset: rawOffsets[index],
    stabilizedOffset: stabilizedOffsets[index]
  }));

  return {
    frames: alignedFrames
  };
}
