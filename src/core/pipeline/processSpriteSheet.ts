import path from "node:path";
import type { ProcessedSpriteSheet } from "../types/image";
import { loadPng } from "../io/png";
import { processSpriteImage, type ProcessSpriteImageOptions } from "./processSpriteImage";

export async function processSpriteSheet(
  filePath: string,
  columns = 4,
  rows = 3,
  options: ProcessSpriteImageOptions = {}
): Promise<ProcessedSpriteSheet> {
  const image = await loadPng(filePath);
  const sheetId = path.basename(filePath, path.extname(filePath));
  return processSpriteImage(image, sheetId, columns, rows, options);
}
