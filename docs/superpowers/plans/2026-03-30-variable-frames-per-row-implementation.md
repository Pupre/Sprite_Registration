# Variable Frames Per Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support sprite sheets where each animation row can have a different frame count, while keeping existing uniform-grid processing and exports working.

**Architecture:** Keep the existing row-based alignment/export pipeline, but replace the global `columns x rows` assumption with a row-first layout model. Detect row bands first, detect frame rects independently inside each row, and preserve a compatibility path where uniform-grid input still behaves exactly like today.

**Tech Stack:** TypeScript, React, Vitest, existing PNG/grid/alignment pipeline

---

## File Structure

- Create: `src/core/grid/detectVariableGrid.ts`
- Modify: `src/core/types/image.ts`
- Modify: `src/core/pipeline/processSpriteImage.ts`
- Modify: `src/core/pipeline/processSpriteSheet.ts`
- Modify: `src/app.tsx`
- Modify: `tests/realSamples.test.ts`
- Create: `tests/variableGrid.test.ts`
- Optionally create: `samples/VariableRowsSynthetic.png`

### Task 1: Add failing tests for variable-row layouts

**Files:**
- Create: `tests/variableGrid.test.ts`
- Reuse: `src/core/pipeline/processSpriteImage.ts`
- Reuse: `src/core/types/image.ts`

- [ ] **Step 1: Write a synthetic helper that builds a variable-row sheet in memory**

Add this helper to `tests/variableGrid.test.ts`:

```ts
function buildSyntheticVariableRowSheet(): RgbaImage {
  const width = 360;
  const height = 240;
  const image = {
    width,
    height,
    data: new Uint8Array(width * height * 4)
  };

  const rows = [
    { y: 0, height: 60, frames: 4 },
    { y: 60, height: 60, frames: 6 },
    { y: 120, height: 60, frames: 10 },
    { y: 180, height: 60, frames: 5 }
  ];

  for (const row of rows) {
    const gap = 6;
    const frameWidth = Math.floor((width - gap * (row.frames + 1)) / row.frames);
    for (let index = 0; index < row.frames; index += 1) {
      const startX = gap + index * (frameWidth + gap);
      for (let y = row.y + 8; y < row.y + row.height - 8; y += 1) {
        for (let x = startX; x < startX + frameWidth; x += 1) {
          const offset = (y * width + x) * 4;
          image.data[offset] = 40 + row.frames * 10;
          image.data[offset + 1] = 180;
          image.data[offset + 2] = 80 + index * 5;
          image.data[offset + 3] = 255;
        }
      }
    }
  }

  return image;
}
```

- [ ] **Step 2: Write the failing mixed-row test**

Add this test to `tests/variableGrid.test.ts`:

```ts
it("processes rows with different frame counts", () => {
  const image = buildSyntheticVariableRowSheet();
  const result = processSpriteImage(image, "variable-test", 4, 4);

  expect(result.animations).toHaveLength(4);
  expect(result.animations.map((animation) => animation.frames.length)).toEqual([4, 6, 10, 5]);
});
```

- [ ] **Step 3: Write the failing compatibility test**

Add this test to `tests/variableGrid.test.ts`:

```ts
it("keeps uniform sheets compatible with the old layout assumption", () => {
  const image = buildSyntheticVariableRowSheet();
  const result = processSpriteImage(image, "uniform-compat", 4, 4, {
    mode: "manual-uniform"
  });

  expect(result.columns).toBe(4);
  expect(result.rows).toBe(4);
});
```

- [ ] **Step 4: Run the new test file and confirm failure**

Run: `npm test -- tests/variableGrid.test.ts`
Expected: FAIL because `processSpriteImage` does not yet support per-row frame detection or the new options shape

### Task 2: Introduce a row-first layout model in core types

**Files:**
- Modify: `src/core/types/image.ts`
- Reuse: `src/core/pipeline/processSpriteImage.ts`

- [ ] **Step 1: Add row-level layout types**

Extend `src/core/types/image.ts` with the new layout types:

```ts
export interface DetectedRowLayout {
  row: number;
  rect: Rect;
  frameRects: Rect[];
}

export interface SpriteSheetLayout {
  rows: DetectedRowLayout[];
  mode: "manual-uniform" | "auto-uniform" | "auto-variable";
  uniformColumns?: number;
}
```

- [ ] **Step 2: Add optional layout metadata to `ProcessedSpriteSheet`**

Update the processed sheet contract:

```ts
export interface ProcessedSpriteSheet {
  id: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  layout?: SpriteSheetLayout;
  animations: ProcessedAnimation[];
  exportLayout?: SheetExportLayout;
}
```

- [ ] **Step 3: Run the focused test file and confirm it still fails only on missing behavior**

Run: `npm test -- tests/variableGrid.test.ts`
Expected: FAIL in runtime assertions, not type errors

### Task 3: Add variable row boundary detection

**Files:**
- Create: `src/core/grid/detectVariableGrid.ts`
- Reuse: `src/core/grid/detectGrid.ts`
- Reuse: `src/core/types/image.ts`

- [ ] **Step 1: Add a row-band detector that preserves uniform-grid compatibility**

Create `src/core/grid/detectVariableGrid.ts` with:

```ts
import type { Rect, RgbaImage, SpriteSheetLayout } from "../types/image";
import { detectGridRects } from "./detectGrid";

export interface DetectVariableGridOptions {
  rows: number;
  columns?: number;
  mode: "manual-uniform" | "auto-uniform" | "auto-variable";
}

export function detectVariableGridLayout(
  image: RgbaImage,
  options: DetectVariableGridOptions
): SpriteSheetLayout {
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

  return detectAutoVariableRows(image, options.rows);
}
```

- [ ] **Step 2: Implement per-row frame boundary splitting**

Inside `src/core/grid/detectVariableGrid.ts`, add a per-row split function:

```ts
function splitRowIntoFrames(image: RgbaImage, rowRect: Rect): Rect[] {
  const separators = detectLowEnergyColumns(image, rowRect);
  return rectsFromSeparators(rowRect, separators);
}
```

Implement `detectLowEnergyColumns` so it scans the row band x-projection and picks separator runs where alpha/luminance energy stays below a threshold.

- [ ] **Step 3: Build `auto-variable` row layouts**

Add:

```ts
function detectAutoVariableRows(image: RgbaImage, rowCount: number): SpriteSheetLayout {
  const rowRects = detectRowBands(image, rowCount);
  return {
    mode: "auto-variable",
    rows: rowRects.map((rect, row) => ({
      row,
      rect,
      frameRects: splitRowIntoFrames(image, rect)
    }))
  };
}
```

- [ ] **Step 4: Run the focused variable-grid test**

Run: `npm test -- tests/variableGrid.test.ts`
Expected: still FAIL, but now closer to expected counts or failing inside `processSpriteImage`

### Task 4: Move `processSpriteImage` to row-first processing

**Files:**
- Modify: `src/core/pipeline/processSpriteImage.ts`
- Modify: `src/core/pipeline/processSpriteSheet.ts`
- Reuse: `src/core/grid/detectVariableGrid.ts`

- [ ] **Step 1: Expand `processSpriteImage` to accept layout options**

Update the signature in `src/core/pipeline/processSpriteImage.ts`:

```ts
export interface ProcessSpriteImageOptions {
  columns?: number;
  rows?: number;
  mode?: "manual-uniform" | "auto-uniform" | "auto-variable";
}

export function processSpriteImage(
  image: RgbaImage,
  sheetId: string,
  columns = 4,
  rows = 3,
  options: ProcessSpriteImageOptions = {}
): ProcessedSpriteSheet {
```

- [ ] **Step 2: Replace uniform rect mapping with per-row frame mapping**

Refactor the frame-building logic to:

```ts
const layout = detectVariableGridLayout(image, {
  rows: options.rows ?? rows,
  columns: options.columns ?? columns,
  mode: options.mode ?? "manual-uniform"
});

const frames = layout.rows.flatMap((rowLayout) =>
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
```

- [ ] **Step 3: Keep `columns` backward compatible on the returned sheet**

Set the returned metadata like this:

```ts
const maxColumns = Math.max(...layout.rows.map((row) => row.frameRects.length));

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
```

- [ ] **Step 4: Update `processSpriteSheet` to accept the same options**

Change `src/core/pipeline/processSpriteSheet.ts` to:

```ts
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
```

- [ ] **Step 5: Run the focused variable-grid test again**

Run: `npm test -- tests/variableGrid.test.ts`
Expected: PASS for mixed row counts and compatibility assertions

### Task 5: Expose auto-variable detection and row-level fallback in the app

**Files:**
- Modify: `src/app.tsx`
- Reuse: `src/core/pipeline/processSpriteImage.ts`

- [ ] **Step 1: Expand preview layout metadata**

Add row count summaries to the browser preview shape in `src/app.tsx`:

```ts
interface BrowserPreview {
  // existing fields...
  detectedRowFrameCounts: number[];
  layoutModeUsed: "auto-uniform" | "auto-variable" | "manual-uniform";
}
```

- [ ] **Step 2: Use auto-variable mode during upload auto-processing**

In `buildPreview`, switch auto mode to call:

```ts
const sheet = processSpriteImage(image, sheetId, resolvedLayout.columns, resolvedLayout.rows, {
  columns: resolvedLayout.columns,
  rows: resolvedLayout.rows,
  mode: layoutMode === "auto" ? "auto-variable" : "manual-uniform"
});
```

- [ ] **Step 3: Surface detected row frame counts in the UI**

Render a summary block near the current layout summary:

```tsx
{preview && (
  <ul>
    {preview.detectedRowFrameCounts.map((count, rowIndex) => (
      <li key={rowIndex}>{`Row ${rowIndex + 1}: ${count} frames`}</li>
    ))}
  </ul>
)}
```

- [ ] **Step 4: Add row-level manual override state**

Add a minimal manual override model:

```ts
const [rowFrameOverrides, setRowFrameOverrides] = useState<Record<number, number>>({});
```

Apply it only when a row override is present by re-splitting that row with the requested frame count instead of recomputing the whole sheet.

- [ ] **Step 5: Run the app build**

Run: `npm run build`
Expected: PASS

### Task 6: Extend regression coverage to current samples

**Files:**
- Modify: `tests/realSamples.test.ts`
- Reuse: `samples/GeneralFrog.png`
- Reuse: `samples/Slime.png`
- Reuse: `samples/Sparky.png`

- [ ] **Step 1: Add an auto-variable compatibility test for the current sample folder**

Append this test to `tests/realSamples.test.ts`:

```ts
it(
  "keeps the current sample folder stable in auto-variable mode",
  async () => {
    const results = await Promise.all(
      samples.map((file) =>
        processSpriteSheet(path.join(root, "samples", file), 4, 3, {
          mode: "auto-variable",
          columns: 4,
          rows: 3
        })
      )
    );

    for (const result of results) {
      expect(result.animations).toHaveLength(3);
      expect(result.animations.every((animation) => animation.frames.length >= 3)).toBe(true);
    }
  },
  90000
);
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run the sample processing script**

Run: `npm run process:samples`
Expected: PASS and `output/` refreshed successfully

- [ ] **Step 4: Commit the feature**

```bash
git add src/core/grid/detectVariableGrid.ts src/core/types/image.ts src/core/pipeline/processSpriteImage.ts src/core/pipeline/processSpriteSheet.ts src/app.tsx tests/variableGrid.test.ts tests/realSamples.test.ts
git commit -m "feat: support variable frame counts per animation row"
```
