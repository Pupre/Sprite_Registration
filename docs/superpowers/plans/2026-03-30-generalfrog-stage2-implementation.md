# GeneralFrog Stage 2 Sprite Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a stage-2 evolved `GeneralFrog` pet sprite sheet with transparent background, row-per-animation layout, and motion designed to minimize visible pivot jitter before and after the repo alignment pass.

**Architecture:** Use `samples/GeneralFrog.png` as the stage-1 identity reference, generate one new stage-2 source sheet with `Idle`, `Walk`, `Attack`, `Skill`, and `Emote` rows, then validate and tighten alignment with the existing sprite-registration pipeline. The primary required artifact is the raw generated PNG; processed exports are a secondary validation step if the generation succeeds.

**Tech Stack:** Codex image generation workflow, PNG sprite sheets, existing TypeScript registration pipeline, Vitest, `tsx`

---

## File Structure

- Create: `assets/generated/GeneralFrog-stage2-source.png`
- Optionally create: `assets/generated/GeneralFrog-stage2-prompt.md`
- Optionally create: `assets/generated/GeneralFrog-stage2-notes.md`
- Create: `output/GeneralFrog-stage2/`
- Optionally create: `scripts/processGeneratedSample.ts`
- Reuse: `samples/GeneralFrog.png`
- Reuse: `src/core/pipeline/processSpriteSheet.ts`
- Reuse: `src/core/export/renderAnimationSheet.ts`
- Reuse: `tests/realSamples.test.ts`

### Task 1: Freeze the generation brief

**Files:**
- Optionally create: `assets/generated/GeneralFrog-stage2-prompt.md`
- Optionally create: `assets/generated/GeneralFrog-stage2-notes.md`
- Reuse: `samples/GeneralFrog.png`
- Reuse: `docs/superpowers/specs/2026-03-30-generalfrog-stage2-design.md`

- [ ] **Step 1: Freeze the generation prompt in-session**

Use this prompt as the first generation brief:

```text
Use case: stylized-concept
Asset type: 2D pixel-art pet sprite sheet for a game
Primary request: Create a sprite sheet for the stage-2 evolution of the frog knight from the reference image. Treat the reference as the stage-1 form. Keep it clearly the same character, but one stage more mature, royal, and reliable. This is not a final-form transformation.
Input images: Image 1: reference image for identity and silhouette
Scene/backdrop: transparent background only
Subject: stage-2 evolved GeneralFrog, a cute frog knight pet with a small crown-like helm, red cape, sword, and slightly more refined armor
Style/medium: polished pixel-art sprite sheet, readable game-ready animation frames
Composition/framing: one animation per row; rows are Idle, Walk, Attack, Skill, Emote; keep a fixed camera angle and consistent ground line across frames; allow different frame counts per row
Lighting/mood: bright heroic fantasy, friendly and dependable pet energy
Color palette: keep the recognizable green/yellow frog body and red cape palette, with slightly richer regal accents
Materials/textures: soft frog skin, small metallic crown and sword highlights, cloth cape motion kept restrained
Constraints: fully transparent background; preserve core character identity; preserve frog knight readability; show moderate stage-2 growth only; reduce frame-to-frame drift; stable scale; stable torso centerline; stable foot contact; no checkerboard; no watermark
Avoid: dramatic final-form redesign, oversized magic bursts, huge body proportion changes, violent enemy energy, large camera shifts, inconsistent frame scale, noisy background remnants
```

- [ ] **Step 2: Optionally save the prompt only if reproducibility is needed**

If a persistent copy is useful, save the prompt text to `assets/generated/GeneralFrog-stage2-prompt.md`.

- [ ] **Step 3: Verify the reference sheet is available**

Run: `file samples/GeneralFrog.png`  
Expected: reports a PNG file with alpha channel dimensions

- [ ] **Step 4: Skip a docs-only commit unless prompt files were actually written**

```bash
git add assets/generated/GeneralFrog-stage2-prompt.md
git commit -m "docs: add GeneralFrog stage 2 generation brief"
```

### Task 2: Generate the raw stage-2 sheet

**Files:**
- Create: `assets/generated/GeneralFrog-stage2-source.png`
- Reuse: `assets/generated/GeneralFrog-stage2-prompt.md`
- Reuse: `samples/GeneralFrog.png`

- [ ] **Step 1: Load the reference image into the session**

Use the session image-view tool on `samples/GeneralFrog.png` so the source character is visible before generation.

- [ ] **Step 2: Generate the first source sheet**

Use the image generation workflow with the in-session prompt from Task 1. If a prompt file was written, reuse it as the source of truth.

```text
Reference image: samples/GeneralFrog.png
Output file: assets/generated/GeneralFrog-stage2-source.png
```

Expected result:
- one PNG sprite sheet
- transparent background
- five animation rows
- readable stage-2 evolution

- [ ] **Step 3: Review the raw sheet against acceptance criteria**

Check:
- same frog knight identity as stage 1
- stage-2 growth is visible but not dramatic
- no background remnants
- row-per-animation structure is clear
- motion arcs look conservative enough for later registration

- [ ] **Step 4: If needed, iterate once with a single correction**

Allowed correction targets:
- scale drift
- foot contact inconsistency
- too much redesign
- too much spectacle
- missing pet charm

Do not change multiple axes at once.

- [ ] **Step 5: Commit the raw source asset**

```bash
git add assets/generated/GeneralFrog-stage2-source.png
git commit -m "feat: add raw GeneralFrog stage 2 sprite sheet"
```

### Task 3: Run registration on the generated sheet

**Files:**
- Optionally create: `scripts/processGeneratedSample.ts`
- Reuse: `src/core/pipeline/processSpriteSheet.ts`
- Reuse: `src/core/export/renderAnimationSheet.ts`
- Create: `output/GeneralFrog-stage2/`

- [ ] **Step 1: Add a one-off processing script if no direct command exists**

Create `scripts/processGeneratedSample.ts` with this content:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { processSpriteSheet } from "../src/core/pipeline/processSpriteSheet";
import { renderAnimationSheet } from "../src/core/export/renderAnimationSheet";
import { writePng } from "../src/core/io/png";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const inputPath = path.join(root, "assets/generated/GeneralFrog-stage2-source.png");
const outputDir = path.join(root, "output", "GeneralFrog-stage2");

async function main() {
  const processed = await processSpriteSheet(inputPath, 1, 5);
  await fs.mkdir(outputDir, { recursive: true });

  for (const animation of processed.animations) {
    const rendered = renderAnimationSheet(animation, processed.exportLayout);
    const baseName = `GeneralFrog-stage2-row-${animation.row + 1}`;
    await writePng(path.join(outputDir, `${baseName}.png`), rendered.image);
    await fs.writeFile(
      path.join(outputDir, `${baseName}.json`),
      JSON.stringify(rendered.metadata, null, 2),
      "utf8"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run the processing script**

Run: `node node_modules/tsx/dist/cli.mjs scripts/processGeneratedSample.ts`  
Expected: creates `output/GeneralFrog-stage2/` with one PNG and one JSON per animation row

- [ ] **Step 3: Inspect alignment output**

Check:
- bottom contact is visually stable
- torso position does not visibly wobble
- cape and sword no longer create obvious jitter
- no row is cropped or misdetected

- [ ] **Step 4: If row detection fails, correct the grid parameters**

If the generated sheet is actually laid out as `N` columns x `5` rows, update:

```ts
const processed = await processSpriteSheet(inputPath, 1, 5);
```

to the real frame-grid dimensions, then rerun the script.

- [ ] **Step 5: Commit the processing helper if it was needed**

```bash
git add scripts/processGeneratedSample.ts output/GeneralFrog-stage2
git commit -m "feat: process GeneralFrog stage 2 through registration pipeline"
```

### Task 4: Verify the asset is usable

**Files:**
- Reuse: `assets/generated/GeneralFrog-stage2-source.png`
- Reuse: `output/GeneralFrog-stage2/`
- Reuse: `tests/realSamples.test.ts`

- [ ] **Step 1: Run the existing regression suite**

Run: `npm test`  
Expected: PASS for the existing sample alignment tests

- [ ] **Step 2: Do a visual acceptance pass**

Confirm:
- stage-2 reads as the same character
- stage-2 reads as evolved
- stage-2 still feels like a pet
- transparency is clean
- aligned outputs feel more stable than the raw source

- [ ] **Step 3: Record the final selection**

Write the final accepted artifact list into `assets/generated/GeneralFrog-stage2-notes.md` by appending:

```md
## Final Selection

- Raw source: `assets/generated/GeneralFrog-stage2-source.png`
- Registered exports: `output/GeneralFrog-stage2/`
- Accepted rows: Idle, Walk, Attack, Skill, Emote
- Status: accepted for stage-2 review
```

- [ ] **Step 4: Commit the verification notes**

```bash
git add assets/generated/GeneralFrog-stage2-notes.md
git commit -m "docs: record GeneralFrog stage 2 verification notes"
```
