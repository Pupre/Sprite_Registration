import type { Matrix, Point } from "../types/sprite";

export function createMatrix(width: number, height: number, fill = 0): Matrix {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

export function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

export function sumMatrix(matrix: Matrix): number {
  let total = 0;
  for (const row of matrix) {
    for (const value of row) {
      total += value;
    }
  }
  return total;
}

export function weightedCentroid(matrix: Matrix): Point {
  let sumWeight = 0;
  let sumX = 0;
  let sumY = 0;

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value <= 0) {
        return;
      }
      sumWeight += value;
      sumX += x * value;
      sumY += y * value;
    });
  });

  if (sumWeight === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: sumX / sumWeight,
    y: sumY / sumWeight
  };
}

export function shiftedSample(matrix: Matrix, x: number, y: number): number {
  if (y < 0 || y >= matrix.length) {
    return 0;
  }

  if (x < 0 || x >= matrix[0].length) {
    return 0;
  }

  return matrix[y][x];
}
