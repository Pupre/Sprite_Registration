export type Matrix = number[][];

export interface Point {
  x: number;
  y: number;
}

export interface SpriteFrame {
  id: string;
  alpha: Matrix;
}

export type MotionPreset = "idle" | "locomotion" | "airborne" | "attack" | "freeform";

export interface AlignmentConfig {
  searchRadius: number;
  effectThreshold: number;
  smoothingAlpha: number;
  motionPreset: MotionPreset;
}

export interface FrameAnalysis {
  id: string;
  groundY: number;
  coreAnchor: Point;
  weightedMask: Matrix;
  activePixels: number;
}

export interface FrameAlignment {
  id: string;
  analysis: FrameAnalysis;
  rawOffset: Point;
  stabilizedOffset: Point;
}

export interface SequenceAlignmentResult {
  frames: FrameAlignment[];
}
