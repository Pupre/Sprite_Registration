import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderAnimationSheet } from "../src/core/export/renderAnimationSheet";
import { writePng } from "../src/core/io/png";
import { processSpriteSheet } from "../src/core/pipeline/processSpriteSheet";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const samplesDir = path.join(root, "samples");
const outputDir = path.join(root, "output");

async function main() {
  const files = (await fs.readdir(samplesDir))
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort();

  const summary: Array<Record<string, unknown>> = [];

  for (const file of files) {
    const fullPath = path.join(samplesDir, file);
    const processed = await processSpriteSheet(fullPath, 4, 3);
    const sheetOutputDir = path.join(outputDir, processed.id);
    await fs.mkdir(sheetOutputDir, { recursive: true });

    for (const animation of processed.animations) {
      const rendered = renderAnimationSheet(animation, processed.exportLayout);
      const baseName = `${processed.id}-row-${animation.row + 1}`;
      await writePng(path.join(sheetOutputDir, `${baseName}.png`), rendered.image);
      await fs.writeFile(
        path.join(sheetOutputDir, `${baseName}.json`),
        JSON.stringify(rendered.metadata, null, 2),
        "utf8"
      );

      summary.push({
        sheet: processed.id,
        animation: baseName,
        rawJitterScore: Number(animation.metrics.rawJitterScore.toFixed(4)),
        alignedJitterScore: Number(animation.metrics.alignedJitterScore.toFixed(4)),
        improvementRatio: Number(animation.metrics.improvementRatio.toFixed(4))
      });
    }
  }

  await fs.writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
