import type { Matrix, Point } from "./sprite";

export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellSlice {
  row: number;
  column: number;
  rect: Rect;
  image: RgbaImage;
}

export interface ForegroundAnalysis {
  mask: boolean[][];
  matte: Matrix;
  weightedMask: Matrix;
  fullBounds: Rect;
  coreBounds: Rect;
  coreAnchor: Point;
  groundY: number;
  area: number;
  alphaMode: boolean;
  backgroundSaturation: number;
  backgroundCorners: [RgbaPixel, RgbaPixel, RgbaPixel, RgbaPixel];
  backgroundPalette: RgbaPixel[];
}

export interface AnimationFrame {
  id: string;
  row: number;
  column: number;
  rect: Rect;
  image: RgbaImage;
  analysis: ForegroundAnalysis;
}

export interface AlignedAnimationFrame extends AnimationFrame {
  offset: Point;
}

export interface AnimationMetrics {
  rawJitterScore: number;
  alignedJitterScore: number;
  improvementRatio: number;
}

export interface ProcessedAnimation {
  id: string;
  row: number;
  frames: AlignedAnimationFrame[];
  metrics: AnimationMetrics;
}

export interface ProcessedSpriteSheet {
  id: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  animations: ProcessedAnimation[];
}
