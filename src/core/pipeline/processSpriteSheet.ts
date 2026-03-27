import path from "node:path";
import type { AnimationFrame, ProcessedSpriteSheet } from "../types/image";
import { alignAnimation } from "../alignment/alignAnimation";
import { detectGridRects } from "../grid/detectGrid";
import { loadPng } from "../io/png";
import { analyzeForeground } from "../mask/foreground";
import { cropImage } from "../utils/image";

export async function processSpriteSheet(
  filePath: string,
  columns = 4,
  rows = 3
): Promise<ProcessedSpriteSheet> {
  const image = await loadPng(filePath);
  const rects = detectGridRects(image, columns, rows);
  const sheetId = path.basename(filePath, path.extname(filePath));

  const frames: AnimationFrame[] = rects.map((rect, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const cellImage = cropImage(image, rect);
    const analysis = analyzeForeground(cellImage);

    return {
      id: `${sheetId}-r${row + 1}c${column + 1}`,
      row,
      column,
      rect,
      image: cellImage,
      analysis
    };
  });

  const animations = Array.from({ length: rows }, (_, row) => {
    const rowFrames = frames.filter((frame) => frame.row === row).sort((a, b) => a.column - b.column);
    return alignAnimation(`${sheetId}-row-${row + 1}`, row, rowFrames);
  });

  return {
    id: sheetId,
    width: image.width,
    height: image.height,
    columns,
    rows,
    animations
  };
}
