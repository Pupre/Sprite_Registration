import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inferGridLayout } from "../src/core/layout/inferGridLayout";
import { loadPng } from "../src/core/io/png";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");

describe("inferGridLayout", () => {
  it(
    "infers Sparky's transparent layout as 4 columns by 3 rows with high confidence",
    async () => {
      const image = await loadPng(path.join(root, "samples", "Sparky.png"));
      const layout = inferGridLayout(image);

      expect(layout.method).toBe("alpha");
      expect(layout.transparentInput).toBe(true);
      expect(layout.columns.count).toBe(4);
      expect(layout.rows.count).toBe(3);
      expect(layout.columns.reliable).toBe(true);
      expect(layout.rows.reliable).toBe(true);
      expect(layout.reliable).toBe(true);
      expect(layout.columns.score).toBeGreaterThan(1);
      expect(layout.rows.score).toBeGreaterThan(1);
    },
    90000
  );
});
