import type { Rect, RgbaImage } from "../types/image";
import { getPixel, luminance } from "../utils/image";

function smoothProjection(values: number[], radius: number): number[] {
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sample = values[index + offset];
      if (sample === undefined) {
        continue;
      }
      total += sample;
      count += 1;
    }
    return count === 0 ? 0 : total / count;
  });
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function seedCenters(values: number[], count: number): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return Array.from({ length: count }, (_, index) => ((index + 0.5) * values.length) / count);
  }

  const centers: number[] = [];
  for (let cluster = 0; cluster < count; cluster += 1) {
    const target = (total * (cluster + 0.5)) / count;
    let cursor = 0;
    for (let index = 0; index < values.length; index += 1) {
      cursor += values[index];
      if (cursor >= target) {
        centers.push(index);
        break;
      }
    }
  }

  return centers;
}

function weightedKMeans(values: number[], count: number): number[] {
  const baseline = percentile(values, 0.2);
  const weights = values.map((value) => Math.max(0.0001, value - baseline + 0.0001));
  let centers = seedCenters(weights, count);

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const buckets = Array.from({ length: count }, () => ({ sum: 0, weight: 0 }));

    for (let index = 0; index < weights.length; index += 1) {
      let bestCluster = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let cluster = 0; cluster < centers.length; cluster += 1) {
        const distance = Math.abs(index - centers[cluster]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = cluster;
        }
      }

      buckets[bestCluster].sum += index * weights[index];
      buckets[bestCluster].weight += weights[index];
    }

    centers = buckets.map((bucket, cluster) =>
      bucket.weight === 0 ? centers[cluster] : bucket.sum / bucket.weight
    );
  }

  return centers.sort((a, b) => a - b);
}

function boundariesFromCenters(length: number, centers: number[]): number[] {
  if (centers.length === 0) {
    return [0, length];
  }

  if (centers.length === 1) {
    return [0, length];
  }

  const boundaries: number[] = [];
  const firstGap = centers[1] - centers[0];
  boundaries.push(Math.max(0, Math.round(centers[0] - firstGap / 2)));

  for (let index = 0; index < centers.length - 1; index += 1) {
    boundaries.push(Math.round((centers[index] + centers[index + 1]) / 2));
  }

  const lastGap = centers[centers.length - 1] - centers[centers.length - 2];
  boundaries.push(Math.min(length, Math.round(centers[centers.length - 1] + lastGap / 2)));

  return boundaries;
}

export function detectGridRects(image: RgbaImage, columns: number, rows: number): Rect[] {
  const projectionX = Array.from({ length: image.width }, () => 0);
  const projectionY = Array.from({ length: image.height }, () => 0);

  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const center = getPixel(image, x, y);
      const left = getPixel(image, x - 1, y);
      const right = getPixel(image, x + 1, y);
      const top = getPixel(image, x, y - 1);
      const bottom = getPixel(image, x, y + 1);

      const gx = Math.abs(luminance(right) - luminance(left));
      const gy = Math.abs(luminance(bottom) - luminance(top));
      const ax = Math.abs(right.a - left.a) * 0.5;
      const ay = Math.abs(bottom.a - top.a) * 0.5;
      const centerBoost = center.a < 12 ? 0 : 8;
      const energy = gx + gy + ax + ay + centerBoost;

      projectionX[x] += energy;
      projectionY[y] += energy;
    }
  }

  const smoothX = smoothProjection(projectionX, Math.max(4, Math.floor(image.width / 96)));
  const smoothY = smoothProjection(projectionY, Math.max(4, Math.floor(image.height / 96)));

  const xBounds = boundariesFromCenters(image.width, weightedKMeans(smoothX, columns));
  const yBounds = boundariesFromCenters(image.height, weightedKMeans(smoothY, rows));

  const rects: Rect[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      rects.push({
        x: xBounds[column],
        y: yBounds[row],
        width: Math.max(1, xBounds[column + 1] - xBounds[column]),
        height: Math.max(1, yBounds[row + 1] - yBounds[row])
      });
    }
  }

  return rects;
}
