import type { AnimationFrame } from "../types/image";
import type { Point } from "../types/sprite";
import { frameContactY } from "../alignment/contact";

export interface JitterBreakdown {
  anchorX: number;
  anchorY: number;
  groundY: number;
  stepAnchorX: number;
  stepGroundY: number;
  anchorXRange: number;
  groundYRange: number;
  combined: number;
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

function rmsDeviation(values: number[], target: number): number {
  if (values.length === 0) {
    return 0;
  }

  const mse = values.reduce((sum, value) => sum + (value - target) ** 2, 0) / values.length;
  return Math.sqrt(mse);
}

function rmsStep(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < values.length; index += 1) {
    total += (values[index] - values[index - 1]) ** 2;
  }

  return Math.sqrt(total / (values.length - 1));
}

function valueRange(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.max(...values) - Math.min(...values);
}

export function measureAnimationJitter(frames: AnimationFrame[], offsets?: Point[]): JitterBreakdown {
  const anchorsX = frames.map((frame, index) => frame.analysis.coreAnchor.x + (offsets?.[index]?.x ?? 0));
  const anchorsY = frames.map((frame, index) => frame.analysis.coreAnchor.y + (offsets?.[index]?.y ?? 0));
  const groundsY = frames.map((frame, index) => frameContactY(frame) + (offsets?.[index]?.y ?? 0));

  const targetAnchorX = median(anchorsX);
  const targetAnchorY = median(anchorsY);
  const targetGroundY = median(groundsY);

  const anchorX = rmsDeviation(anchorsX, targetAnchorX);
  const anchorY = rmsDeviation(anchorsY, targetAnchorY);
  const groundY = rmsDeviation(groundsY, targetGroundY);
  const stepAnchorX = rmsStep(anchorsX);
  const stepGroundY = rmsStep(groundsY);
  const anchorXRange = valueRange(anchorsX);
  const groundYRange = valueRange(groundsY);

  return {
    anchorX,
    anchorY,
    groundY,
    stepAnchorX,
    stepGroundY,
    anchorXRange,
    groundYRange,
    combined:
      anchorX * 2.4 +
      groundY * 2.8 +
      stepAnchorX * 1.9 +
      stepGroundY * 2.4 +
      anchorXRange * 1.35 +
      groundYRange * 1.8 +
      anchorY * 0.2
  };
}
