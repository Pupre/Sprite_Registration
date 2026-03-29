import type { Matrix } from "../types/sprite";
import type { Rect, ForegroundAnalysis, RgbaImage, RgbaPixel } from "../types/image";
import { weightedCentroid } from "../utils/matrix";
import { clamp, expandRect, getPixel, luminance, rectContainsPoint, rectUnion } from "../utils/image";
import {
  collectConnectedComponents,
  createBooleanMask,
  dilateMask,
  majorityFilter,
  renderComponents
} from "./components";

const BACKGROUND_PALETTE_LIMIT = 8;
const QUANTIZATION_STEP = 16;

function averagePatch(image: RgbaImage, startX: number, startY: number, width: number, height: number): RgbaPixel {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      const pixel = getPixel(image, clamp(x, 0, image.width - 1), clamp(y, 0, image.height - 1));
      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
      a += pixel.a;
      count += 1;
    }
  }

  return {
    r: Math.round(r / Math.max(1, count)),
    g: Math.round(g / Math.max(1, count)),
    b: Math.round(b / Math.max(1, count)),
    a: Math.round(a / Math.max(1, count))
  };
}

function bilinearBackground(corners: [RgbaPixel, RgbaPixel, RgbaPixel, RgbaPixel], x: number, y: number, width: number, height: number): RgbaPixel {
  const u = width <= 1 ? 0 : x / (width - 1);
  const v = height <= 1 ? 0 : y / (height - 1);
  const [topLeft, topRight, bottomLeft, bottomRight] = corners;

  const interpolate = (a: number, b: number, c: number, d: number) =>
    a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;

  return {
    r: interpolate(topLeft.r, topRight.r, bottomLeft.r, bottomRight.r),
    g: interpolate(topLeft.g, topRight.g, bottomLeft.g, bottomRight.g),
    b: interpolate(topLeft.b, topRight.b, bottomLeft.b, bottomRight.b),
    a: interpolate(topLeft.a, topRight.a, bottomLeft.a, bottomRight.a)
  };
}

function saturation(pixel: RgbaPixel): number {
  return Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
}

function basePixelDifference(pixel: RgbaPixel, expected: RgbaPixel): number {
  const colorDistance = Math.hypot(pixel.r - expected.r, pixel.g - expected.g, pixel.b - expected.b);
  const alphaDistance = Math.abs(pixel.a - expected.a) * 0.4;
  const saturationDistance = Math.abs(saturation(pixel) - saturation(expected)) * 0.9;
  return colorDistance + alphaDistance + saturationDistance;
}

function scorePixel(pixel: RgbaPixel, expected: RgbaPixel, edge: number): number {
  return basePixelDifference(pixel, expected) + edge * 0.35;
}

function borderStatistics(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  const sorted = [...values].sort((a, b) => a - b);
  const percentile95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? mean;
  return { mean, stddev: Math.sqrt(variance), percentile95 };
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index] ?? 0;
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function robustGround(mask: boolean[][]): number {
  const bottoms: number[] = [];

  for (let x = 0; x < (mask[0]?.length ?? 0); x += 1) {
    for (let y = mask.length - 1; y >= 0; y -= 1) {
      if (mask[y][x]) {
        bottoms.push(y);
        break;
      }
    }
  }

  if (bottoms.length === 0) {
    return mask.length - 1;
  }

  bottoms.sort((a, b) => a - b);
  return bottoms[Math.floor((bottoms.length - 1) * 0.85)] ?? bottoms[bottoms.length - 1];
}

function buildAlphaMask(image: RgbaImage, threshold: number): boolean[][] {
  const mask = createBooleanMask(image.width, image.height, false);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      mask[y][x] = getPixel(image, x, y).a > threshold;
    }
  }
  return mask;
}

function buildBorderPalette(image: RgbaImage): RgbaPixel[] {
  const bins = new Map<string, { count: number; r: number; g: number; b: number; a: number }>();
  const add = (pixel: RgbaPixel) => {
    const key = [pixel.r, pixel.g, pixel.b, pixel.a]
      .map((value) => Math.round(value / QUANTIZATION_STEP))
      .join(":");
    const current = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0, a: 0 };
    current.count += 1;
    current.r += pixel.r;
    current.g += pixel.g;
    current.b += pixel.b;
    current.a += pixel.a;
    bins.set(key, current);
  };

  for (let x = 0; x < image.width; x += 1) {
    add(getPixel(image, x, 0));
    add(getPixel(image, x, image.height - 1));
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    add(getPixel(image, 0, y));
    add(getPixel(image, image.width - 1, y));
  }

  return [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, BACKGROUND_PALETTE_LIMIT)
    .map((entry) => ({
      r: Math.round(entry.r / entry.count),
      g: Math.round(entry.g / entry.count),
      b: Math.round(entry.b / entry.count),
      a: Math.round(entry.a / entry.count)
    }));
}

function nearestPalettePixel(pixel: RgbaPixel, palette: RgbaPixel[]): RgbaPixel | null {
  let best: RgbaPixel | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of palette) {
    const score = scorePixel(pixel, candidate, 0);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function backgroundScore(pixel: RgbaPixel, expected: RgbaPixel, palette: RgbaPixel[], edge: number): number {
  const bilinearScore = basePixelDifference(pixel, expected) + edge * 0.18;
  const palettePixel = nearestPalettePixel(pixel, palette);
  const paletteScore = palettePixel ? basePixelDifference(pixel, palettePixel) : Number.POSITIVE_INFINITY;
  return Math.min(bilinearScore, paletteScore);
}

function floodFillBackground(scores: number[][], threshold: number): boolean[][] {
  const height = scores.length;
  const width = scores[0]?.length ?? 0;
  const background = createBooleanMask(width, height, false);
  const queue: Array<{ x: number; y: number }> = [];

  function tryPush(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    if (background[y][x]) {
      return;
    }
    if (scores[y][x] > threshold) {
      return;
    }
    background[y][x] = true;
    queue.push({ x, y });
  }

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],            [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of neighbors) {
      tryPush(current.x + dx, current.y + dy);
    }
  }

  return background;
}

function invertMask(mask: boolean[][]): boolean[][] {
  return mask.map((row) => row.map((value) => !value));
}

function fillMaskHoles(mask: boolean[][]): boolean[][] {
  const height = mask.length;
  const width = mask[0]?.length ?? 0;
  const exterior = createBooleanMask(width, height, false);
  const queue: Array<{ x: number; y: number }> = [];

  function tryPush(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    if (exterior[y][x]) {
      return;
    }
    if (mask[y][x]) {
      return;
    }
    exterior[y][x] = true;
    queue.push({ x, y });
  }

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],            [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of neighbors) {
      tryPush(current.x + dx, current.y + dy);
    }
  }

  return mask.map((row, y) => row.map((value, x) => value || !exterior[y][x]));
}

function buildOpaqueMask(scores: number[][], threshold: number, relaxed: boolean): boolean[][] {
  const background = floodFillBackground(scores, threshold);
  const foreground = invertMask(background);
  const filtered = relaxed
    ? dilateMask(majorityFilter(foreground, 1), 1)
    : majorityFilter(dilateMask(majorityFilter(foreground, 2), 1), 2);
  return fillMaskHoles(filtered);
}

function buildSoftMatte(scores: number[][], softThreshold: number, hardThreshold: number): Matrix {
  const range = Math.max(1, hardThreshold - softThreshold);
  return scores.map((row) =>
    row.map((score) => clamp((score - softThreshold) / range, 0, 1))
  );
}

function touchesBorder(bounds: Rect, width: number, height: number): boolean {
  return (
    bounds.x <= 0 ||
    bounds.y <= 0 ||
    bounds.x + bounds.width >= width ||
    bounds.y + bounds.height >= height
  );
}

function refineOpaqueComponents(
  width: number,
  height: number,
  components: ReturnType<typeof collectConnectedComponents>,
  matte: Matrix
) {
  if (components.length === 0) {
    return components;
  }

  const support = renderComponents(width, height, components);
  const confidentMask = createBooleanMask(width, height, false);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      confidentMask[y][x] = support[y][x] && matte[y][x] >= 0.5;
    }
  }

  let refined = collectConnectedComponents(dilateMask(confidentMask, 1));
  const nonBorder = refined.filter((component) => !touchesBorder(component.bounds, width, height));
  if (nonBorder.length > 0) {
    refined = nonBorder;
  }

  refined = refined.filter((component) => component.area >= Math.max(24, components[0].area * 0.03));
  if (refined.length === 0) {
    return components;
  }

  const refinedArea = refined.reduce((sum, component) => sum + component.area, 0);
  return refinedArea >= components[0].area * 0.45 ? refined : components;
}

function buildAnalysisFromComponents(
  width: number,
  height: number,
  componentsInput: ReturnType<typeof collectConnectedComponents>,
  alphaMode: boolean,
  backgroundSaturation: number,
  backgroundCorners: [RgbaPixel, RgbaPixel, RgbaPixel, RgbaPixel],
  backgroundPalette: RgbaPixel[],
  matteInput?: Matrix
): ForegroundAnalysis {
  const emptyMatte = matteInput ?? Array.from({ length: height }, () => Array.from({ length: width }, () => 0));

  if (componentsInput.length === 0) {
    const fallbackMask = createBooleanMask(width, height, false);
    const weightedMask = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));
    return {
      mask: fallbackMask,
      matte: emptyMatte,
      weightedMask,
      fullBounds: { x: 0, y: 0, width, height },
      coreBounds: { x: 0, y: 0, width, height },
      coreAnchor: { x: width / 2, y: height / 2 },
      groundY: height - 1,
      area: 0,
      alphaMode,
      backgroundSaturation,
      backgroundCorners,
      backgroundPalette
    };
  }

  const largest = componentsInput[0];
  const significanceRatio = alphaMode ? 0.003 : 0.015;
  const minimumArea = alphaMode ? 4 : 12;
  const significant = componentsInput.filter(
    (component) => component.area >= Math.max(minimumArea, largest.area * significanceRatio)
  );
  const fullMask = renderComponents(width, height, significant);
  const expandedCore = expandRect(largest.bounds, Math.max(2, Math.floor(Math.min(width, height) * 0.06)), width, height);
  const coreComponents = significant.filter(
    (component) => overlaps(expandedCore, component.bounds) || component.area >= largest.area * 0.1
  );
  const coreMask = renderComponents(width, height, coreComponents.length > 0 ? coreComponents : [largest]);

  const fullBounds = rectUnion(significant.map((component) => component.bounds));
  const coreBounds = rectUnion((coreComponents.length > 0 ? coreComponents : [largest]).map((component) => component.bounds));
  const matteSupport = alphaMode ? fullMask : dilateMask(fullMask, 2);
  const matte = emptyMatte.map((row, y) =>
    row.map((value, x) => (matteSupport[y][x] ? value : 0))
  );

  const weightedMask = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (!fullMask[y][x]) {
        return 0;
      }
      const inCore = coreMask[y][x] || rectContainsPoint(coreBounds, { x, y });
      const relativeY = (y - coreBounds.y) / Math.max(1, coreBounds.height - 1);
      const coreCenterX = coreBounds.x + coreBounds.width / 2;
      const distanceToCenterX = Math.abs(x - coreCenterX) / Math.max(1, coreBounds.width / 2);
      const verticalWeight = 0.72 + Math.max(0, Math.min(1, relativeY)) * 0.48;
      const horizontalWeight = 1 - Math.min(1, distanceToCenterX) * 0.22;
      const matteWeight = alphaMode ? Math.max(0.15, matte[y][x]) : 0.35 + matte[y][x] * 0.65;
      return (inCore ? 1 : 0.18) * verticalWeight * horizontalWeight * matteWeight;
    })
  );

  return {
    mask: fullMask,
    matte,
    weightedMask,
    fullBounds,
    coreBounds,
    coreAnchor: weightedCentroid(weightedMask),
    groundY: robustGround(coreMask),
    area: significant.reduce((sum, component) => sum + component.area, 0),
    alphaMode,
    backgroundSaturation,
    backgroundCorners,
    backgroundPalette
  };
}

export function analyzeForeground(image: RgbaImage): ForegroundAnalysis {
  const width = image.width;
  const height = image.height;
  const patch = Math.max(2, Math.floor(Math.min(width, height) * 0.08));
  const corners = [
    averagePatch(image, 0, 0, patch, patch),
    averagePatch(image, width - patch, 0, patch, patch),
    averagePatch(image, 0, height - patch, patch, patch),
    averagePatch(image, width - patch, height - patch, patch, patch)
  ] as [RgbaPixel, RgbaPixel, RgbaPixel, RgbaPixel];
  const backgroundPalette = buildBorderPalette(image);

  let transparentPixels = 0;
  const scores = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));
  const borderScores: number[] = [];
  const allScores: number[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = getPixel(image, x, y);
      if (pixel.a < 12) {
        transparentPixels += 1;
      }

      const left = getPixel(image, Math.max(0, x - 1), y);
      const right = getPixel(image, x + 1 < width ? x + 1 : width - 1, y);
      const top = getPixel(image, x, Math.max(0, y - 1));
      const bottom = getPixel(image, x, y + 1 < height ? y + 1 : height - 1);
      const edge = Math.abs(luminance(right) - luminance(left)) + Math.abs(luminance(bottom) - luminance(top));
      const expected = bilinearBackground(corners, x, y, width, height);
      const score = backgroundScore(pixel, expected, backgroundPalette, edge);
      scores[y][x] = score;
      allScores.push(score);

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        borderScores.push(score);
      }
    }
  }

  const alphaMode = transparentPixels > 0;
  const backgroundSaturation = corners.reduce((sum, pixel) => sum + saturation(pixel), 0) / corners.length;
  if (alphaMode) {
    const matte = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => getPixel(image, x, y).a / 255)
    );
    return buildAnalysisFromComponents(
      width,
      height,
      collectConnectedComponents(buildAlphaMask(image, 4)),
      true,
      backgroundSaturation,
      corners,
      backgroundPalette,
      matte
    );
  }

  const stats = borderStatistics(borderScores);
  const primaryThreshold = Math.max(
    stats.percentile95 + Math.max(6, stats.stddev * 0.35),
    stats.mean + stats.stddev * 2.4
  );
  const fallbackThreshold = Math.max(primaryThreshold + 6, percentile(allScores, 0.9));
  const softThreshold = Math.max(stats.percentile95 + 2, stats.mean + stats.stddev * 1.15);

  let components = collectConnectedComponents(buildOpaqueMask(scores, primaryThreshold, false));
  let hardThreshold = Math.max(softThreshold + 12, primaryThreshold + 16, percentile(allScores, 0.93));
  const largestArea = components[0]?.area ?? 0;
  if (largestArea < width * height * 0.1) {
    components = collectConnectedComponents(buildOpaqueMask(scores, fallbackThreshold, true));
    hardThreshold = Math.max(softThreshold + 12, fallbackThreshold + 12, percentile(allScores, 0.95));
  }

  const matte = buildSoftMatte(scores, softThreshold, hardThreshold);
  const refinedComponents = refineOpaqueComponents(width, height, components, matte);
  return buildAnalysisFromComponents(
    width,
    height,
    refinedComponents,
    false,
    backgroundSaturation,
    corners,
    backgroundPalette,
    matte
  );
}
