import type { ProcessedAnimation, Rect, SheetExportLayout } from "../types/image";
import { frameContactY } from "../alignment/contact";

export interface AnimationExportProfile {
  anchorX: number;
  groundY: number;
  leftExtent: number;
  rightExtent: number;
  topExtent: number;
  bottomExtent: number;
  sourceRects: Rect[];
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

export function computeAnimationExportProfile(animation: ProcessedAnimation): AnimationExportProfile {
  const sourceRects = animation.frames.map((frame) => frame.analysis.fullBounds);
  const worldAnchorXs = animation.frames.map((frame) => frame.analysis.coreAnchor.x + frame.offset.x);
  const worldGroundYs = animation.frames.map((frame) => frameContactY(frame) + frame.offset.y);
  const anchorX = Math.round(median(worldAnchorXs));
  const groundY = Math.round(median(worldGroundYs));

  let leftExtent = 1;
  let rightExtent = 1;
  let topExtent = 1;
  let bottomExtent = 1;

  sourceRects.forEach((rect, index) => {
    const frame = animation.frames[index];
    const worldRect = {
      x: rect.x + frame.offset.x,
      y: rect.y + frame.offset.y,
      width: rect.width,
      height: rect.height
    };

    leftExtent = Math.max(leftExtent, anchorX - worldRect.x);
    rightExtent = Math.max(rightExtent, worldRect.x + worldRect.width - anchorX);
    topExtent = Math.max(topExtent, groundY - worldRect.y);
    bottomExtent = Math.max(bottomExtent, worldRect.y + worldRect.height - groundY);
  });

  return {
    anchorX,
    groundY,
    leftExtent: Math.max(1, Math.ceil(leftExtent)),
    rightExtent: Math.max(1, Math.ceil(rightExtent)),
    topExtent: Math.max(1, Math.ceil(topExtent)),
    bottomExtent: Math.max(1, Math.ceil(bottomExtent)),
    sourceRects
  };
}

export function computeSheetExportLayout(
  animations: ProcessedAnimation[],
  padding = 0
): SheetExportLayout {
  const profiles = animations.map((animation) => computeAnimationExportProfile(animation));
  const leftExtent = Math.max(...profiles.map((profile) => profile.leftExtent), 1);
  const rightExtent = Math.max(...profiles.map((profile) => profile.rightExtent), 1);
  const topExtent = Math.max(...profiles.map((profile) => profile.topExtent), 1);
  const bottomExtent = Math.max(...profiles.map((profile) => profile.bottomExtent), 1);

  return {
    cellWidth: leftExtent + rightExtent + padding * 2,
    cellHeight: topExtent + bottomExtent + padding * 2,
    pivotX: padding + leftExtent,
    baselineY: padding + topExtent
  };
}
