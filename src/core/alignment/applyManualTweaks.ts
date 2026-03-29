import { measureAnimationJitter } from "../metrics/jitter";
import type { ProcessedAnimation } from "../types/image";
import type { Point } from "../types/sprite";

export type ManualFrameTweaks = Record<string, Point>;

export function applyManualTweaks(
  animation: ProcessedAnimation,
  tweaks: ManualFrameTweaks = {}
): ProcessedAnimation {
  const frames = animation.frames.map((frame) => {
    const delta = tweaks[frame.id];
    if (!delta) {
      return frame;
    }

    return {
      ...frame,
      offset: {
        x: frame.offset.x + delta.x,
        y: frame.offset.y + delta.y
      }
    };
  });

  const adjusted = measureAnimationJitter(frames, frames.map((frame) => frame.offset));

  return {
    ...animation,
    frames,
    metrics: {
      rawJitterScore: animation.metrics.rawJitterScore,
      alignedJitterScore: adjusted.combined,
      improvementRatio:
        animation.metrics.rawJitterScore === 0
          ? 1
          : adjusted.combined / animation.metrics.rawJitterScore
    }
  };
}
