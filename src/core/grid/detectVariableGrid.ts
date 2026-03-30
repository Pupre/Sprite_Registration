import type { Rect, RgbaImage, SpriteSheetLayout } from "../types/image";
import { getPixel, luminance } from "../utils/image";
import { detectGridRects } from "./detectGrid";

export interface DetectVariableGridOptions {
  rows: number;
  columns?: number;
  rowFrameCounts?: number[];
  mode: "manual-uniform" | "manual-variable" | "auto-uniform" | "auto-variable";
}

function rowBandFromUniformRects(rects: Rect[], row: number, columns: number): Rect {
  const rowRects = rects.slice(row * columns, (row + 1) * columns);
  const first = rowRects[0];
  const last = rowRects[rowRects.length - 1];
  return {
    x: first.x,
    y: first.y,
    width: last.x + last.width - first.x,
    height: first.height
  };
}

function buildColumnEnergyProjection(image: RgbaImage, rowRect: Rect): number[] {
  const values = Array.from({ length: rowRect.width }, () => 0);

  for (let localX = 0; localX < rowRect.width; localX += 1) {
    const x = rowRect.x + localX;
    let total = 0;
    for (let localY = 0; localY < rowRect.height; localY += 1) {
      const y = rowRect.y + localY;
      const center = getPixel(image, x, y);
      const left = getPixel(image, Math.max(rowRect.x, x - 1), y);
      const right = getPixel(image, Math.min(rowRect.x + rowRect.width - 1, x + 1), y);

      const alphaEnergy = center.a > 12 ? center.a : 0;
      const edgeEnergy = Math.abs(luminance(right) - luminance(left)) + Math.abs(right.a - left.a);
      total += alphaEnergy + edgeEnergy * 2;
    }
    values[localX] = total;
  }

  return values;
}

function buildColumnOccupancyProjection(image: RgbaImage, rowRect: Rect): number[] {
  const values = Array.from({ length: rowRect.width }, () => 0);

  for (let localX = 0; localX < rowRect.width; localX += 1) {
    const x = rowRect.x + localX;
    let occupied = 0;
    for (let localY = 0; localY < rowRect.height; localY += 1) {
      const y = rowRect.y + localY;
      const center = getPixel(image, x, y);
      const left = getPixel(image, Math.max(rowRect.x, x - 1), y);
      const right = getPixel(image, Math.min(rowRect.x + rowRect.width - 1, x + 1), y);
      const top = getPixel(image, x, Math.max(rowRect.y, y - 1));
      const bottom = getPixel(image, x, Math.min(rowRect.y + rowRect.height - 1, y + 1));

      const alphaSignal = center.a > 24 ? 1 : 0;
      const edgeSignal =
        Math.abs(luminance(right) - luminance(left)) + Math.abs(luminance(bottom) - luminance(top)) > 18
          ? 1
          : 0;

      occupied += alphaSignal || edgeSignal ? 1 : 0;
    }
    values[localX] = occupied;
  }

  return values;
}

function buildAlphaCoverageProjection(image: RgbaImage, rowRect: Rect): number[] {
  const values = Array.from({ length: rowRect.width }, () => 0);

  for (let localX = 0; localX < rowRect.width; localX += 1) {
    const x = rowRect.x + localX;
    let occupied = 0;
    for (let localY = 0; localY < rowRect.height; localY += 1) {
      const y = rowRect.y + localY;
      if (getPixel(image, x, y).a > 24) {
        occupied += 1;
      }
    }
    values[localX] = occupied;
  }

  return values;
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

function detectSeparatorRuns(values: number[], threshold: number): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] <= threshold) {
      if (start < 0) {
        start = index;
      }
      continue;
    }

    if (start >= 0) {
      runs.push({ start, end: index - 1 });
      start = -1;
    }
  }

  if (start >= 0) {
    runs.push({ start, end: values.length - 1 });
  }

  return runs;
}

function detectContentRuns(values: number[], threshold: number): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] > threshold) {
      if (start < 0) {
        start = index;
      }
      continue;
    }

    if (start >= 0) {
      runs.push({ start, end: index - 1 });
      start = -1;
    }
  }

  if (start >= 0) {
    runs.push({ start, end: values.length - 1 });
  }

  return runs;
}

function mergeOverlappingRuns(runs: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (runs.length === 0) {
    return [];
  }

  const sorted = [...runs].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [{ ...sorted[0] }];

  for (const run of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (run.start <= current.end + 1) {
      current.end = Math.max(current.end, run.end);
      continue;
    }
    merged.push({ ...run });
  }

  return merged;
}

function mergeTinyRunsIntoNeighbors(
  runs: Array<{ start: number; end: number }>,
  minWidth: number,
  maxGap: number
): Array<{ start: number; end: number }> {
  if (runs.length <= 1) {
    return runs;
  }

  const majorRuns = runs
    .filter((run) => run.end - run.start + 1 >= minWidth)
    .map((run) => ({ ...run }));
  const tinyRuns = runs.filter((run) => run.end - run.start + 1 < minWidth);

  if (majorRuns.length === 0) {
    return runs;
  }

  for (const tiny of tinyRuns) {
    let bestIndex = -1;
    let bestGap = Number.POSITIVE_INFINITY;

    for (let index = 0; index < majorRuns.length; index += 1) {
      const major = majorRuns[index];
      const gap =
        tiny.end < major.start
          ? major.start - tiny.end - 1
          : tiny.start > major.end
            ? tiny.start - major.end - 1
            : 0;

      if (gap <= maxGap && gap < bestGap) {
        bestGap = gap;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0) {
      majorRuns[bestIndex].start = Math.min(majorRuns[bestIndex].start, tiny.start);
      majorRuns[bestIndex].end = Math.max(majorRuns[bestIndex].end, tiny.end);
    }
  }

  return mergeOverlappingRuns(majorRuns);
}

function splitRowIntoFrames(image: RgbaImage, rowRect: Rect): Rect[] {
  const minimumFrameWidth = Math.max(2, Math.floor(rowRect.width / 90));
  const detachedMergeGap = Math.max(4, minimumFrameWidth * 3, Math.floor(rowRect.height * 0.2));
  const alphaCoverage = buildAlphaCoverageProjection(image, rowRect);
  const occupancy = smoothProjection(
    buildColumnOccupancyProjection(image, rowRect),
    Math.max(1, Math.floor(rowRect.width / 160))
  );
  const alphaRuns = mergeTinyRunsIntoNeighbors(
    detectContentRuns(alphaCoverage, Math.max(1, Math.floor(rowRect.height * 0.08))),
    minimumFrameWidth,
    detachedMergeGap
  ).filter((run) => run.end - run.start + 1 >= minimumFrameWidth);
  if (alphaRuns.length > 1) {
    return alphaRuns.map((run) => ({
      x: rowRect.x + run.start,
      y: rowRect.y,
      width: run.end - run.start + 1,
      height: rowRect.height
    }));
  }

  const occupancyThreshold = Math.max(1, Math.floor(rowRect.height * 0.12));
  const contentRuns = mergeTinyRunsIntoNeighbors(
    detectContentRuns(occupancy, occupancyThreshold),
    minimumFrameWidth,
    detachedMergeGap
  ).filter((run) => run.end - run.start + 1 >= minimumFrameWidth);

  const frameRects: Rect[] = contentRuns.map((run) => ({
    x: rowRect.x + run.start,
    y: rowRect.y,
    width: run.end - run.start + 1,
    height: rowRect.height
  }));

  const trimmed = frameRects
    .map((rect) => {
      let startX = rect.x;
      let endX = rect.x + rect.width - 1;

      while (startX <= endX) {
        const local = startX - rowRect.x;
        if (occupancy[local] > occupancyThreshold) {
          break;
        }
        startX += 1;
      }

      while (endX >= startX) {
        const local = endX - rowRect.x;
        if (occupancy[local] > occupancyThreshold) {
          break;
        }
        endX -= 1;
      }

      return {
        x: startX,
        y: rect.y,
        width: endX - startX + 1,
        height: rect.height
      };
    })
    .filter((rect) => rect.width > 1);

  if (trimmed.length > 0) {
    return trimmed;
  }

  const energy = smoothProjection(
    buildColumnEnergyProjection(image, rowRect),
    Math.max(1, Math.floor(rowRect.width / 128))
  );
  const energyThreshold = percentile(energy, 0.2) + (percentile(energy, 0.75) - percentile(energy, 0.2)) * 0.2;
  const energyRuns = mergeTinyRunsIntoNeighbors(
    detectContentRuns(energy, energyThreshold),
    minimumFrameWidth,
    detachedMergeGap
  ).filter((run) => run.end - run.start + 1 >= minimumFrameWidth);

  const fallbackRects: Rect[] = energyRuns.map((run) => ({
    x: rowRect.x + run.start,
    y: rowRect.y,
    width: run.end - run.start + 1,
    height: rowRect.height
  }));

  return fallbackRects.filter((rect) => rect.width > 1).length > 0 ? fallbackRects.filter((rect) => rect.width > 1) : [rowRect];
}

function detectUniformRowBands(image: RgbaImage, rowCount: number): Rect[] {
  return Array.from({ length: rowCount }, (_, row) => {
    const startY = Math.round((row * image.height) / rowCount);
    const endY = Math.round(((row + 1) * image.height) / rowCount);
    return {
      x: 0,
      y: startY,
      width: image.width,
      height: Math.max(1, endY - startY)
    };
  });
}

function splitUniformly(rect: Rect, count: number): Rect[] {
  return Array.from({ length: count }, (_, index) => {
    const startX = rect.x + Math.round((index * rect.width) / count);
    const endX = rect.x + Math.round(((index + 1) * rect.width) / count);
    return {
      x: startX,
      y: rect.y,
      width: Math.max(1, endX - startX),
      height: rect.height
    };
  });
}

function detectAutoVariableRows(
  image: RgbaImage,
  rowCount: number,
  uniformColumns?: number
): SpriteSheetLayout {
  const rowRects = detectUniformRowBands(image, rowCount);
  const fallbackColumns = uniformColumns && uniformColumns > 0 ? uniformColumns : null;
  const uniformRects = fallbackColumns ? detectGridRects(image, fallbackColumns, rowCount) : null;
  return {
    mode: "auto-variable",
    uniformColumns,
    rows: rowRects.map((rect, row) => {
      const detected = splitRowIntoFrames(image, rect);
      const fallback =
        uniformRects && fallbackColumns && detected.length <= 1
          ? uniformRects.slice(row * fallbackColumns, (row + 1) * fallbackColumns)
          : detected;

      return {
        row,
        rect,
        frameRects: fallback
      };
    })
  };
}

export function detectVariableGridLayout(
  image: RgbaImage,
  options: DetectVariableGridOptions
): SpriteSheetLayout {
  if (options.mode === "manual-variable") {
    const rowRects = detectUniformRowBands(image, options.rows);
    return {
      mode: options.mode,
      rows: rowRects.map((rect, row) => ({
        row,
        rect,
        frameRects: splitUniformly(rect, Math.max(1, options.rowFrameCounts?.[row] ?? options.columns ?? 1))
      }))
    };
  }

  if (options.mode !== "auto-variable") {
    const uniformColumns = options.columns ?? 4;
    const rects = detectGridRects(image, uniformColumns, options.rows);
    return {
      mode: options.mode,
      uniformColumns,
      rows: Array.from({ length: options.rows }, (_, row) => ({
        row,
        rect: rowBandFromUniformRects(rects, row, uniformColumns),
        frameRects: rects.slice(row * uniformColumns, (row + 1) * uniformColumns)
      }))
    };
  }

  return detectAutoVariableRows(image, options.rows, options.columns);
}
