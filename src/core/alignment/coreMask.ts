import type { FrameAnalysis, SpriteFrame } from "../types/sprite";
import { cloneMatrix, sumMatrix, weightedCentroid } from "../utils/matrix";

function computeGroundY(alpha: number[][]): number {
  for (let y = alpha.length - 1; y >= 0; y -= 1) {
    if (alpha[y].some((value) => value > 0)) {
      return y;
    }
  }

  return 0;
}

function applyCoreWeighting(alpha: number[][], effectThreshold: number): number[][] {
  const weighted = cloneMatrix(alpha);

  weighted.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value <= 0) {
        return;
      }

      const verticalBias = 1 - y / Math.max(1, alpha.length - 1);
      const normalized = value / 255;
      const suppressTransient = normalized < effectThreshold ? 0.25 : 1;
      const suppressExtremes = x === 0 || x === row.length - 1 ? 0.7 : 1;

      row[x] = normalized * suppressTransient * suppressExtremes * (0.65 + verticalBias * 0.35);
    });
  });

  return weighted;
}

export function analyzeFrame(frame: SpriteFrame, effectThreshold: number): FrameAnalysis {
  const weightedMask = applyCoreWeighting(frame.alpha, effectThreshold);

  return {
    id: frame.id,
    groundY: computeGroundY(frame.alpha),
    coreAnchor: weightedCentroid(weightedMask),
    weightedMask,
    activePixels: sumMatrix(weightedMask)
  };
}
