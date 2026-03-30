import type { AnimationFrame, ProcessedSpriteSheet, RgbaImage } from "../types/image";
import { alignAnimation } from "../alignment/alignAnimation";
import { computeSheetExportLayout } from "../export/computeSheetExportLayout";
import { detectVariableGridLayout } from "../grid/detectVariableGrid";
import { analyzeForeground } from "../mask/foreground";
import { cropImage } from "../utils/image";

export interface ProcessSpriteImageOptions {
  columns?: number;
  rows?: number;
  rowFrameCounts?: number[];
  mode?: "manual-uniform" | "manual-variable" | "auto-uniform" | "auto-variable";
}

export function processSpriteImage(
  image: RgbaImage,
  sheetId: string,
  columns = 4,
  rows = 3,
  options: ProcessSpriteImageOptions = {}
): ProcessedSpriteSheet {
  const layout = detectVariableGridLayout(image, {
    rows: options.rows ?? rows,
    columns: options.columns ?? columns,
    rowFrameCounts: options.rowFrameCounts,
    mode: options.mode ?? "manual-uniform"
  });

  const frames: AnimationFrame[] = layout.rows.flatMap((rowLayout) =>
    rowLayout.frameRects.map((rect, column) => {
      const cellImage = cropImage(image, rect);
      const analysis = analyzeForeground(cellImage);

      return {
        id: `${sheetId}-r${rowLayout.row + 1}c${column + 1}`,
        row: rowLayout.row,
        column,
        rect,
        image: cellImage,
        analysis
      };
    })
  );

  const animations = Array.from({ length: layout.rows.length }, (_, row) => {
    const rowFrames = frames.filter((frame) => frame.row === row).sort((a, b) => a.column - b.column);
    return alignAnimation(`${sheetId}-row-${row + 1}`, row, rowFrames);
  });

  const exportLayout = computeSheetExportLayout(animations);
  const maxColumns = Math.max(0, ...layout.rows.map((rowLayout) => rowLayout.frameRects.length));

  return {
    id: sheetId,
    width: image.width,
    height: image.height,
    columns: layout.uniformColumns ?? maxColumns,
    rows: layout.rows.length,
    layout,
    animations,
    exportLayout
  };
}
