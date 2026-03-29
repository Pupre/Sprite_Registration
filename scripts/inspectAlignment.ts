import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameContactY } from "../src/core/alignment/contact";
import { computeFrameScaleFactors } from "../src/core/alignment/scaleStabilization";
import { computeAnimationExportProfile } from "../src/core/export/computeSheetExportLayout";
import { renderAnimationSheet } from "../src/core/export/renderAnimationSheet";
import { processSpriteSheet } from "../src/core/pipeline/processSpriteSheet";
import { getPixel } from "../src/core/utils/image";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const files = ["Sparky.png", "GeneralFrog.png", "Slime.png"];

function range(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function bottomGap(
  image: { width: number; height: number; data: Uint8Array },
  cellWidth: number,
  cellHeight: number,
  frameIndex: number
): number {
  for (let y = cellHeight - 1; y >= 0; y -= 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      if (getPixel(image, frameIndex * cellWidth + x, y).a > 0) {
        return cellHeight - 1 - y;
      }
    }
  }

  return cellHeight;
}

function visibleHeight(
  image: { width: number; height: number; data: Uint8Array },
  cellWidth: number,
  cellHeight: number,
  frameIndex: number
): number {
  let top = cellHeight;
  let bottom = -1;

  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      if (getPixel(image, frameIndex * cellWidth + x, y).a > 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return bottom < top ? 0 : bottom - top + 1;
}

async function main() {
  for (const file of files) {
    const result = await processSpriteSheet(path.join(root, "samples", file), 4, 3);
    console.log(`FILE ${file}`);
    console.log(` export layout cell=${result.exportLayout?.cellWidth}x${result.exportLayout?.cellHeight} pivotX=${result.exportLayout?.pivotX} baselineY=${result.exportLayout?.baselineY}`);

    for (const animation of result.animations) {
      const worldAnchorXs = animation.frames.map((frame) => Number((frame.analysis.coreAnchor.x + frame.offset.x).toFixed(2)));
      const worldGroundYs = animation.frames.map((frame) => Number((frameContactY(frame) + frame.offset.y).toFixed(2)));
      const frameScales = computeFrameScaleFactors(animation);
      const rawCoreHeights = animation.frames.map((frame) => frame.analysis.coreBounds.height);
      const scaledCoreHeights = animation.frames.map((frame, index) =>
        Number((frame.analysis.coreBounds.height * frameScales[index]).toFixed(2))
      );
      const profile = computeAnimationExportProfile(animation);
      const rendered = renderAnimationSheet(animation, result.exportLayout);
      const bottomGaps = animation.frames.map((_, frameIndex) =>
        bottomGap(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, frameIndex)
      );
      const visibleHeights = animation.frames.map((_, frameIndex) =>
        visibleHeight(rendered.image, rendered.metadata.cellWidth, rendered.metadata.cellHeight, frameIndex)
      );

      console.log(
        ` row ${animation.row + 1}` +
          ` ratio=${animation.metrics.improvementRatio.toFixed(3)}` +
          ` raw=${animation.metrics.rawJitterScore.toFixed(2)}` +
          ` aligned=${animation.metrics.alignedJitterScore.toFixed(2)}` +
          ` anchorRange=${range(worldAnchorXs).toFixed(2)}` +
          ` groundRange=${range(worldGroundYs).toFixed(2)}` +
          ` scale=[${frameScales.join(", ")}]` +
          ` rawCoreHeight=[${rawCoreHeights.join(", ")}]` +
          ` scaledCoreHeight=[${scaledCoreHeights.join(", ")}]` +
          ` bottomGap=[${bottomGaps.join(", ")}]` +
          ` visibleHeight=[${visibleHeights.join(", ")}]` +
          ` anchor=[${worldAnchorXs.join(", ")}]` +
          ` ground=[${worldGroundYs.join(", ")}]` +
          ` exportAnchor=${profile.anchorX}` +
          ` exportGround=${profile.groundY}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
