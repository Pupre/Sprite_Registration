import type { AnimationFrame } from "../types/image";

export function frameContactY(frame: AnimationFrame): number {
  return Math.max(
    frame.analysis.groundY,
    frame.analysis.coreBounds.y + frame.analysis.coreBounds.height - 1
  );
}
