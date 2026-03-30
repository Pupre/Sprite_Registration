# Variable Frames Per Row Design

## Goal

Allow sprite sheets where each animation row has a different number of frames, while preserving the current user-facing output model of row-aligned PNG exports plus JSON metadata.

## Product Requirement

The current pipeline assumes a uniform `columns x rows` grid across the whole sheet. That blocks common cases such as:

- `Idle`: 4 frames
- `Walk`: 6 frames
- `Attack`: 10 frames
- `Eat`: 5 frames

The new behavior should support these mixed row lengths without breaking the existing workflow for uniform sheets.

## Success Criteria

- Uploading a sheet with variable frame counts per row produces usable row-level exports.
- Automatic detection is the default behavior.
- Users can manually correct the detected frame structure when auto-detection is wrong.
- Existing uniform-grid sheets still process correctly without requiring a new workflow.
- Existing tests and output contracts remain valid unless they are intentionally extended.

## Non-Goals

- Fully automatic semantic animation labeling
- Per-frame manual reposition editing
- Replacing the current alignment/export model
- Solving arbitrary overlapping layouts that do not have meaningful row structure

## Recommended Approach

Use a row-first detection pipeline.

1. Detect or accept the number of animation rows.
2. Slice the sheet into row bands.
3. Within each row, detect frame boundaries from vertical gaps or low-energy separator bands.
4. Build a per-row list of frame rects instead of a single global column count.
5. Run the existing foreground analysis, alignment, and export logic against those per-row frame lists.

This approach keeps the problem framed as boundary detection rather than character-shape detection, which is more stable for effects-heavy sprites.

## Data Model Changes

The internal model should no longer treat a sheet as requiring one global `columns` value.

Instead, the core representation should support:

- total row count for the sheet
- per-row frame rect lists
- per-frame row and column indices derived from each row's own frame order

The important compatibility rule is that downstream code should still be able to render and export each row as an ordered animation sequence, even if row lengths differ.

Uniform sheets remain a special case where every row happens to have the same frame count.

## Detection Strategy

### Automatic mode

Automatic mode should remain the default.

Recommended detection flow:

1. Determine row bands using the current row handling or inferred row segmentation.
2. For each row band, compute an x-axis projection over visible content.
3. Find separator regions where content energy falls low enough to indicate frame gaps.
4. Convert separators into frame rects for that row.
5. Reject obviously bad detections such as empty rows, zero-width frames, or implausibly dense splits.

This design intentionally prefers detecting frame boundaries over detecting character blobs.

### Manual fallback

If automatic detection is wrong, the user should be able to override it.

Minimum required fallback:

- manually specify frame count per row

Preferred fallback:

- show detected row frame counts
- allow editing the count for only the incorrect row
- re-split that row using the manual value without forcing the user to redo the whole sheet

## UI Behavior

The UI should stay familiar.

Expected flow:

1. User uploads a sprite sheet.
2. App auto-detects the layout.
3. App shows a summary such as `Row 1: 4`, `Row 2: 6`, `Row 3: 10`, `Row 4: 5`.
4. User accepts the result or fixes only the incorrect rows.
5. Processing/export continues as it does today.

The user does not need to understand the internal representation. The main requirement is that exports still appear complete and correct.

## Backward Compatibility

This is a hard requirement.

- Existing uniform-grid input must keep working.
- Existing scripts that pass a single `columns, rows` pair should keep working or be migrated with a compatibility layer.
- Existing tests for current samples must continue to pass.
- Current row export PNG and JSON outputs should remain structurally compatible unless explicitly versioned.

If there is a conflict between adding the new feature and preserving current behavior, preserve current behavior by default and gate the new logic behind auto-detection or explicit variable-row mode.

## Implementation Boundaries

Likely change areas:

- `src/core/grid/detectGrid.ts`
- `src/core/pipeline/processSpriteImage.ts`
- `src/core/pipeline/processSpriteSheet.ts`
- `src/core/types/image.ts`
- `src/app.tsx`
- relevant tests under `tests/`

The safest decomposition is:

1. introduce per-row frame-rect support in core types and pipeline
2. keep a compatibility path for uniform grids
3. add row-wise boundary detection
4. expose detection summary and manual correction in the UI
5. extend tests for mixed row-length sheets

## Testing Strategy

The new test set should cover both compatibility and the new behavior.

Required coverage:

- uniform-grid sheets still behave exactly as before
- synthetic variable-row sheets split into the expected frame counts
- mixed row lengths still produce aligned row exports
- manual override corrects a bad automatic split
- existing real sample tests remain green

## Quality Bar

The feature is successful when the user can upload a sheet with mixed frame counts per row and still get the same practical result they get today: row-level aligned outputs that are complete, readable, and stable.
