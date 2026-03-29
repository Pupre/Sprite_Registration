import type { RgbaImage } from "../types/image";
import { getPixel, luminance } from "../utils/image";

export interface AxisInference {
  count: number;
  score: number;
  margin: number;
  reliable: boolean;
}

export interface GridLayoutInference {
  columns: AxisInference;
  rows: AxisInference;
  method: "alpha" | "energy";
  transparentInput: boolean;
  reliable: boolean;
}

interface AxisCandidate {
  count: number;
  score: number;
}

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
  if (centers.length <= 1) {
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

function meanRange(values: number[], start: number, end: number): number {
  let total = 0;
  let count = 0;

  for (let index = Math.max(0, start); index <= Math.min(values.length - 1, end); index += 1) {
    total += values[index];
    count += 1;
  }

  return count === 0 ? 0 : total / count;
}

function scoreCandidate(values: number[], count: number): AxisCandidate {
  const smoothed = smoothProjection(values, Math.max(2, Math.floor(values.length / 160)));
  const centers = weightedKMeans(smoothed, count);
  const boundaries = boundariesFromCenters(values.length, centers);

  const interiors: number[] = [];
  const gutters: number[] = [];
  const widths: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const left = boundaries[index];
    const right = boundaries[index + 1] - 1;
    const center = Math.round((left + right) / 2);
    const halfWindow = Math.max(2, Math.floor((right - left + 1) / 8));

    interiors.push(meanRange(smoothed, center - halfWindow, center + halfWindow));
    widths.push(boundaries[index + 1] - boundaries[index]);
  }

  for (let index = 1; index < boundaries.length - 1; index += 1) {
    gutters.push(meanRange(smoothed, boundaries[index] - 2, boundaries[index] + 2));
  }

  const avgInterior = interiors.reduce((sum, value) => sum + value, 0) / Math.max(1, interiors.length);
  const avgGutter = gutters.reduce((sum, value) => sum + value, 0) / Math.max(1, gutters.length);
  const meanWidth = widths.reduce((sum, value) => sum + value, 0) / Math.max(1, widths.length);
  const variance =
    widths.reduce((sum, value) => sum + (value - meanWidth) ** 2, 0) / Math.max(1, widths.length);
  const uniformity = 1 / (1 + Math.sqrt(variance) / Math.max(1, meanWidth));
  const occupancy = interiors.filter((value) => value > avgInterior * 0.28).length / Math.max(1, count);
  const contrast = (avgInterior - avgGutter) / Math.max(1e-6, avgInterior);

  return {
    count,
    score: contrast * Math.log2(count + 1) * uniformity * occupancy
  };
}

function inferAxisCount(values: number[], maxCount: number): AxisInference {
  const candidates = Array.from({ length: maxCount }, (_, index) => scoreCandidate(values, index + 1)).sort(
    (a, b) => b.score - a.score
  );

  const best = candidates[0] ?? { count: 1, score: 0 };
  const runnerUp = candidates.find((candidate) => candidate.count !== best.count) ?? { count: 1, score: 0 };
  const margin = best.score - runnerUp.score;

  return {
    count: best.count,
    score: best.score,
    margin,
    reliable: best.count > 1 && best.score >= 1 && margin >= 0.2
  };
}

function buildAlphaProjections(image: RgbaImage) {
  const projectionX = Array.from({ length: image.width }, () => 0);
  const projectionY = Array.from({ length: image.height }, () => 0);
  let transparentPixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = getPixel(image, x, y).a;
      if (alpha < 12) {
        transparentPixels += 1;
        continue;
      }

      const weight = alpha / 255;
      projectionX[x] += weight;
      projectionY[y] += weight;
    }
  }

  return {
    projectionX,
    projectionY,
    transparentInput: transparentPixels / Math.max(1, image.width * image.height) > 0.08
  };
}

function buildEnergyProjections(image: RgbaImage) {
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

  return { projectionX, projectionY };
}

export function inferGridLayout(
  image: RgbaImage,
  options?: { maxColumns?: number; maxRows?: number }
): GridLayoutInference {
  const alpha = buildAlphaProjections(image);
  const method = alpha.transparentInput ? "alpha" : "energy";
  const { projectionX, projectionY } =
    method === "alpha" ? alpha : buildEnergyProjections(image);

  const maxColumns = Math.max(1, Math.min(options?.maxColumns ?? 12, Math.floor(image.width / 48) || 1));
  const maxRows = Math.max(1, Math.min(options?.maxRows ?? 12, Math.floor(image.height / 48) || 1));

  const columns = inferAxisCount(projectionX, maxColumns);
  const rows = inferAxisCount(projectionY, maxRows);

  return {
    columns,
    rows,
    method,
    transparentInput: alpha.transparentInput,
    reliable: method === "alpha" && columns.reliable && rows.reliable
  };
}
