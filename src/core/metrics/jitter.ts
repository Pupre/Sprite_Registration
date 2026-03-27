import type { AnimationFrame } from "../types/image";
import type { Point } from "../types/sprite";
import { fitLinearTrend, residualMse } from "../math/regression";

export interface JitterBreakdown {
  anchorX: number;
  anchorY: number;
  groundY: number;
  combined: number;
}

export function measureAnimationJitter(frames: AnimationFrame[], offsets?: Point[]): JitterBreakdown {
  const anchorsX = frames.map((frame, index) => frame.analysis.coreAnchor.x + (offsets?.[index]?.x ?? 0));
  const anchorsY = frames.map((frame, index) => frame.analysis.coreAnchor.y + (offsets?.[index]?.y ?? 0));
  const groundsY = frames.map((frame, index) => frame.analysis.groundY + (offsets?.[index]?.y ?? 0));

  const trendX = fitLinearTrend(anchorsX);
  const trendY = fitLinearTrend(anchorsY);
  const trendGround = fitLinearTrend(groundsY);

  const anchorX = residualMse(anchorsX, trendX.predicted);
  const anchorY = residualMse(anchorsY, trendY.predicted);
  const groundY = residualMse(groundsY, trendGround.predicted);

  return {
    anchorX,
    anchorY,
    groundY,
    combined: anchorX + anchorY * 0.8 + groundY * 1.2
  };
}
