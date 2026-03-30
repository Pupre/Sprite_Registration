import { startTransition, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { decodeBrowserImage, jsonToObjectUrl, rgbaImageToObjectUrl } from "./browser/imageCodecs";
import { createZipBlob } from "./browser/zip";
import type { ZipEntry } from "./browser/zip";
import { applyManualTweaks } from "./core/alignment/applyManualTweaks";
import { renderAnimationSheet } from "./core/export/renderAnimationSheet";
import { renderInterpolatedAnimationSheet } from "./core/export/renderInterpolatedAnimationSheet";
import { renderRawAnimationSheet } from "./core/export/renderRawAnimationSheet";
import { inferGridLayout } from "./core/layout/inferGridLayout";
import { resolveAutoLayout } from "./core/layout/resolveLayout";
import { processSpriteImage } from "./core/pipeline/processSpriteImage";
import type { AnimationMetrics, ProcessedSpriteSheet, Rect } from "./core/types/image";
import type { Point } from "./core/types/sprite";

interface RawCellPreview {
  id: string;
  row: number;
  column: number;
  rect: Rect;
  imageUrl: string;
  width: number;
  height: number;
}

interface AlignedRowPreview {
  id: string;
  row: number;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  pngName: string;
  metadataUrl: string;
  metadataName: string;
  metrics: AnimationMetrics;
  frameCount: number;
  cellWidth: number;
  cellHeight: number;
}

interface InterpolatedRowPreview {
  id: string;
  row: number;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  pngName: string;
  metadataUrl: string;
  metadataName: string;
  frameCount: number;
  cellWidth: number;
  cellHeight: number;
  sourceFrameCount: number;
  insertedFrameCount: number;
}

interface RawRowPreview {
  id: string;
  row: number;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  frameCount: number;
  cellWidth: number;
  cellHeight: number;
}

interface BrowserPreview {
  originalUrl: string;
  originalName: string;
  sheet: ProcessedSpriteSheet;
  rawCells: RawCellPreview[];
  rawRows: RawRowPreview[];
  alignedRows: AlignedRowPreview[];
  interpolatedRows: InterpolatedRowPreview[];
  summaryUrl: string;
  summaryName: string;
  layout: LayoutResolution;
  detectedRowFrameCounts: number[];
  layoutModeUsed: "auto-uniform" | "auto-variable" | "manual-uniform" | "manual-variable";
}

type LayoutMode = "auto" | "manual";

interface LayoutResolution {
  mode: LayoutMode;
  source: "auto" | "manual" | "manual-fallback" | "mixed";
  columns: number;
  rows: number;
  note: string;
  method: "alpha" | "energy" | "manual";
  reliable: boolean;
}

type ManualTweakState = Record<string, Record<string, Point>>;

const ENABLE_INTERPOLATION_EXPERIMENT = false;

function fileStem(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "") || "sprite-sheet";
}

function pickFirstPngFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) {
    return null;
  }

  return (
    Array.from(files).find(
      (file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
    ) ?? null
  );
}

function clampGridCount(value: number): number {
  return Math.max(1, Math.min(64, Math.round(value || 1)));
}

function formatJitterDelta(ratio: number): string {
  const delta = (1 - ratio) * 100;
  if (delta >= 0) {
    return `흔들림 ${delta.toFixed(1)}% 감소`;
  }
  return `흔들림 ${Math.abs(delta).toFixed(1)}% 증가`;
}

function FrameStripViewport(props: {
  imageUrl: string;
  label: string;
  frameCount: number;
  cellWidth: number;
  cellHeight: number;
  frameIndex: number;
}) {
  const { imageUrl, label, frameCount, cellWidth, cellHeight, frameIndex } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      const normalizedFrame = Math.max(0, Math.min(frameCount - 1, frameIndex));
      canvas.width = cellWidth;
      canvas.height = cellHeight;
      context.clearRect(0, 0, cellWidth, cellHeight);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        normalizedFrame * cellWidth,
        0,
        cellWidth,
        cellHeight,
        0,
        0,
        cellWidth,
        cellHeight
      );
    };

    image.src = imageUrl;

    return () => {
      cancelled = true;
      image.src = "";
    };
  }, [cellHeight, cellWidth, frameCount, frameIndex, imageUrl]);

  return (
    <div className="comparison-stage">
      <span className="compare-label">{label}</span>
      <div
        className="sprite-window checkerboard"
        style={{
          aspectRatio: `${cellWidth} / ${Math.max(1, cellHeight)}`,
          maxWidth: `${Math.min(360, cellWidth)}px`
        }}
      >
        <canvas ref={canvasRef} className="sprite-frame-canvas" aria-label={label} role="img" />
      </div>
    </div>
  );
}

function RowComparisonPlayer(props: {
  raw: RawRowPreview;
  aligned: AlignedRowPreview;
}) {
  const { raw, aligned } = props;
  const frameCount = Math.max(1, Math.min(raw.frameCount, aligned.frameCount));
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
  }, [raw.imageUrl, aligned.imageUrl, frameCount]);

  useEffect(() => {
    if (!playing || frameCount <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frameCount);
    }, 180);

    return () => {
      window.clearInterval(timer);
    };
  }, [frameCount, playing]);

  return (
    <div className="comparison-player">
      <div className="comparison-stage-grid">
        <FrameStripViewport
          imageUrl={raw.imageUrl}
          label="보정 전 프레임 재생"
          frameCount={frameCount}
          cellWidth={raw.cellWidth}
          cellHeight={raw.cellHeight}
          frameIndex={frameIndex}
        />
        <FrameStripViewport
          imageUrl={aligned.imageUrl}
          label="보정 후 프레임 재생"
          frameCount={frameCount}
          cellWidth={aligned.cellWidth}
          cellHeight={aligned.cellHeight}
          frameIndex={frameIndex}
        />
      </div>
      <div className="player-controls">
        <button
          type="button"
          className="tiny-button"
          disabled={frameCount <= 1}
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? "일시정지" : "재생"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, frameCount - 1)}
          value={frameIndex}
          onChange={(event) => {
            setPlaying(false);
            setFrameIndex(Number(event.target.value));
          }}
        />
        <span className="player-frame">
          F{frameIndex + 1}/{frameCount}
        </span>
      </div>
    </div>
  );
}

function AnimationStripPlayer(props: {
  imageUrl: string;
  frameCount: number;
  cellWidth: number;
  cellHeight: number;
  label: string;
}) {
  const { imageUrl, frameCount, cellWidth, cellHeight, label } = props;
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
  }, [cellHeight, cellWidth, frameCount, imageUrl]);

  useEffect(() => {
    if (!playing || frameCount <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frameCount);
    }, 150);

    return () => {
      window.clearInterval(timer);
    };
  }, [frameCount, playing]);

  return (
    <div className="comparison-player single">
      <FrameStripViewport
        imageUrl={imageUrl}
        label={label}
        frameCount={frameCount}
        cellWidth={cellWidth}
        cellHeight={cellHeight}
        frameIndex={frameIndex}
      />
      <div className="player-controls">
        <button
          type="button"
          className="tiny-button"
          disabled={frameCount <= 1}
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? "일시정지" : "재생"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, frameCount - 1)}
          value={frameIndex}
          onChange={(event) => {
            setPlaying(false);
            setFrameIndex(Number(event.target.value));
          }}
        />
        <span className="player-frame">
          F{frameIndex + 1}/{frameCount}
        </span>
      </div>
    </div>
  );
}

function disposeExportRows(rows: Array<{ imageUrl: string; metadataUrl: string }>) {
  for (const row of rows) {
    URL.revokeObjectURL(row.imageUrl);
    URL.revokeObjectURL(row.metadataUrl);
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

async function objectUrlToBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  return Uint8Array.from(new Uint8Array(await response.arrayBuffer()));
}

function buildSummaryPayload(
  preview: BrowserPreview,
  alignedRows: AlignedRowPreview[],
  interpolatedRows: InterpolatedRowPreview[]
) {
  return {
    sheetId: preview.sheet.id,
    originalFile: preview.originalName,
    width: preview.sheet.width,
    height: preview.sheet.height,
    columns: preview.sheet.columns,
    rows: preview.sheet.rows,
    layout: preview.layout,
    detectedRowFrameCounts: preview.detectedRowFrameCounts,
    layoutModeUsed: preview.layoutModeUsed,
    gridRects: preview.rawCells.map((cell) => ({
      id: cell.id,
      row: cell.row,
      column: cell.column,
      ...cell.rect
    })),
    animations: alignedRows.map((row) => ({
      id: row.id,
      row: row.row,
      frameCount: row.frameCount,
      metrics: row.metrics
    })),
    interpolation: interpolatedRows.map((row) => ({
      id: row.id,
      row: row.row,
      frameCount: row.frameCount,
      sourceFrameCount: row.sourceFrameCount,
      insertedFrameCount: row.insertedFrameCount
    }))
  };
}

function disposePreview(preview: BrowserPreview | null) {
  if (!preview) {
    return;
  }

  URL.revokeObjectURL(preview.originalUrl);
  URL.revokeObjectURL(preview.summaryUrl);

  for (const cell of preview.rawCells) {
    URL.revokeObjectURL(cell.imageUrl);
  }

  for (const row of preview.rawRows) {
    URL.revokeObjectURL(row.imageUrl);
  }

  for (const row of preview.alignedRows) {
    URL.revokeObjectURL(row.imageUrl);
    URL.revokeObjectURL(row.metadataUrl);
  }

  for (const row of preview.interpolatedRows) {
    URL.revokeObjectURL(row.imageUrl);
    URL.revokeObjectURL(row.metadataUrl);
  }
}

async function buildPreview(
  file: File,
  layoutMode: LayoutMode,
  manualColumns: number,
  manualRows: number,
  rowFrameCounts?: number[]
): Promise<BrowserPreview> {
  const image = await decodeBrowserImage(file);
  const sheetId = fileStem(file.name);
  const normalizedColumns = clampGridCount(manualColumns);
  const normalizedRows = clampGridCount(manualRows);
  let resolvedLayout: LayoutResolution;

  if (layoutMode === "auto") {
    const inferred = inferGridLayout(image);
    const resolvedAuto = resolveAutoLayout(inferred, normalizedColumns, normalizedRows);
    resolvedLayout = {
      mode: "auto",
      source: resolvedAuto.source,
      columns: resolvedAuto.columns,
      rows: resolvedAuto.rows,
      note: resolvedAuto.note,
      method: inferred.method,
      reliable: resolvedAuto.reliable
    };
  } else {
    resolvedLayout = {
      mode: "manual",
      source: "manual",
      columns: normalizedColumns,
      rows: normalizedRows,
      note: "수동으로 입력한 행/열 수를 사용했습니다.",
      method: "manual",
      reliable: true
    };
  }

  const layoutModeUsed =
    layoutMode === "auto"
      ? rowFrameCounts && rowFrameCounts.length > 0
        ? "manual-variable"
        : "auto-variable"
      : "manual-uniform";
  const sheet = processSpriteImage(image, sheetId, resolvedLayout.columns, resolvedLayout.rows, {
    columns: resolvedLayout.columns,
    rows: resolvedLayout.rows,
    rowFrameCounts,
    mode: layoutModeUsed
  });
  const originalUrl = URL.createObjectURL(file);
  const detectedRowFrameCounts = sheet.animations.map((animation) => animation.frames.length);

  const rawCells = await Promise.all(
    sheet.animations.flatMap((animation) =>
      animation.frames.map(async (frame) => ({
        id: frame.id,
        row: frame.row,
        column: frame.column,
        rect: frame.rect,
        imageUrl: await rgbaImageToObjectUrl(frame.image),
        width: frame.image.width,
        height: frame.image.height
      }))
    )
  );

  const rawRows = await Promise.all(
    sheet.animations.map(async (animation) => {
      const rendered = renderRawAnimationSheet(animation);

      return {
        id: animation.id,
        row: animation.row,
        imageUrl: await rgbaImageToObjectUrl(rendered.image),
        imageWidth: rendered.image.width,
        imageHeight: rendered.image.height,
        frameCount: rendered.metadata.frameCount,
        cellWidth: rendered.metadata.cellWidth,
        cellHeight: rendered.metadata.cellHeight
      };
    })
  );

  const alignedRows = await Promise.all(
    sheet.animations.map(async (animation) => {
      const rendered = renderAnimationSheet(animation, sheet.exportLayout);
      const rowLabel = animation.row + 1;

      return {
        id: animation.id,
        row: animation.row,
        imageUrl: await rgbaImageToObjectUrl(rendered.image),
        imageWidth: rendered.image.width,
        imageHeight: rendered.image.height,
        pngName: `${sheetId}-row-${rowLabel}.png`,
        metadataUrl: jsonToObjectUrl(rendered.metadata),
        metadataName: `${sheetId}-row-${rowLabel}.json`,
        metrics: animation.metrics,
        frameCount: rendered.metadata.frameCount,
        cellWidth: rendered.metadata.cellWidth,
        cellHeight: rendered.metadata.cellHeight
      };
    })
  );

  const interpolatedRows = ENABLE_INTERPOLATION_EXPERIMENT
    ? await Promise.all(
        sheet.animations.map(async (animation) => {
          const rendered = renderInterpolatedAnimationSheet(animation, sheet.exportLayout);
          const rowLabel = animation.row + 1;

          return {
            id: animation.id,
            row: animation.row,
            imageUrl: await rgbaImageToObjectUrl(rendered.image),
            imageWidth: rendered.image.width,
            imageHeight: rendered.image.height,
            pngName: `${sheetId}-row-${rowLabel}-interpolated.png`,
            metadataUrl: jsonToObjectUrl(rendered.metadata),
            metadataName: `${sheetId}-row-${rowLabel}-interpolated.json`,
            frameCount: rendered.metadata.frameCount,
            cellWidth: rendered.metadata.cellWidth,
            cellHeight: rendered.metadata.cellHeight,
            sourceFrameCount: rendered.metadata.sourceFrameCount,
            insertedFrameCount: rendered.metadata.insertedFrameCount
          };
        })
      )
    : [];

  const summaryPayload = buildSummaryPayload(
    {
      originalUrl,
      originalName: file.name,
      sheet,
      rawCells,
      rawRows,
      alignedRows,
      interpolatedRows,
      summaryUrl: "",
      summaryName: `${sheetId}-summary.json`,
      layout: resolvedLayout,
      detectedRowFrameCounts,
      layoutModeUsed
    },
    alignedRows,
    interpolatedRows
  );

  return {
    originalUrl,
    originalName: file.name,
    sheet,
    rawCells,
    rawRows,
    alignedRows,
    interpolatedRows,
    summaryUrl: jsonToObjectUrl(summaryPayload),
    summaryName: `${sheetId}-summary.json`,
    layout: resolvedLayout,
    detectedRowFrameCounts,
    layoutModeUsed
  };
}

async function buildAdjustedRowPreviews(
  sheet: ProcessedSpriteSheet,
  tweaks: ManualTweakState
): Promise<{
  alignedRows: AlignedRowPreview[];
  interpolatedRows: InterpolatedRowPreview[];
}> {
  const adjustedAnimations = sheet.animations.map((animation) =>
    applyManualTweaks(animation, tweaks[animation.id] ?? {})
  );

  const alignedRows = await Promise.all(
    adjustedAnimations.map(async (animation) => {
      const rendered = renderAnimationSheet(animation, sheet.exportLayout);
      const rowLabel = animation.row + 1;

      return {
        id: animation.id,
        row: animation.row,
        imageUrl: await rgbaImageToObjectUrl(rendered.image),
        imageWidth: rendered.image.width,
        imageHeight: rendered.image.height,
        pngName: `${sheet.id}-row-${rowLabel}.png`,
        metadataUrl: jsonToObjectUrl(rendered.metadata),
        metadataName: `${sheet.id}-row-${rowLabel}.json`,
        metrics: animation.metrics,
        frameCount: rendered.metadata.frameCount,
        cellWidth: rendered.metadata.cellWidth,
        cellHeight: rendered.metadata.cellHeight
      };
    })
  );

  const interpolatedRows = ENABLE_INTERPOLATION_EXPERIMENT
    ? await Promise.all(
        adjustedAnimations.map(async (animation) => {
          const rendered = renderInterpolatedAnimationSheet(animation, sheet.exportLayout);
          const rowLabel = animation.row + 1;

          return {
            id: animation.id,
            row: animation.row,
            imageUrl: await rgbaImageToObjectUrl(rendered.image),
            imageWidth: rendered.image.width,
            imageHeight: rendered.image.height,
            pngName: `${sheet.id}-row-${rowLabel}-interpolated.png`,
            metadataUrl: jsonToObjectUrl(rendered.metadata),
            metadataName: `${sheet.id}-row-${rowLabel}-interpolated.json`,
            frameCount: rendered.metadata.frameCount,
            cellWidth: rendered.metadata.cellWidth,
            cellHeight: rendered.metadata.cellHeight,
            sourceFrameCount: rendered.metadata.sourceFrameCount,
            insertedFrameCount: rendered.metadata.insertedFrameCount
          };
        })
      )
    : [];

  return {
    alignedRows,
    interpolatedRows
  };
}

export function App() {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto");
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(3);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BrowserPreview | null>(null);
  const [manualTweaks, setManualTweaks] = useState<ManualTweakState>({});
  const [rowFrameOverrides, setRowFrameOverrides] = useState<Record<number, number>>({});
  const [adjustedAlignedRows, setAdjustedAlignedRows] = useState<AlignedRowPreview[]>([]);
  const [adjustedInterpolatedRows, setAdjustedInterpolatedRows] = useState<InterpolatedRowPreview[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPackaging, setIsPackaging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [status, setStatus] = useState("스프라이트 시트 PNG를 업로드하면 현재 registration 엔진을 바로 실행합니다.");
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef(0);
  const previewRef = useRef<BrowserPreview | null>(null);
  const adjustedRowsRef = useRef<AlignedRowPreview[]>([]);
  const adjustedInterpolatedRowsRef = useRef<InterpolatedRowPreview[]>([]);
  const hasManualTweaks = Object.values(manualTweaks).some((rowTweaks) => Object.keys(rowTweaks).length > 0);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    adjustedRowsRef.current = adjustedAlignedRows;
  }, [adjustedAlignedRows]);

  useEffect(() => {
    adjustedInterpolatedRowsRef.current = adjustedInterpolatedRows;
  }, [adjustedInterpolatedRows]);

  useEffect(() => {
    return () => {
      disposeExportRows(adjustedRowsRef.current);
      disposeExportRows(adjustedInterpolatedRowsRef.current);
      disposePreview(previewRef.current);
    };
  }, []);

  useEffect(() => {
    setRowFrameOverrides(
      preview ? Object.fromEntries(preview.detectedRowFrameCounts.map((count, rowIndex) => [rowIndex, count])) : {}
    );
    setManualTweaks({});
    setAdjustedAlignedRows((current) => {
      disposeExportRows(current);
      return [];
    });
    setAdjustedInterpolatedRows((current) => {
      disposeExportRows(current);
      return [];
    });
  }, [preview]);

  useEffect(() => {
    if (!preview || !hasManualTweaks) {
      setAdjustedAlignedRows((current) => {
        if (current.length === 0) {
          return current;
        }
        disposeExportRows(current);
        return [];
      });
      setAdjustedInterpolatedRows((current) => {
        if (current.length === 0) {
          return current;
        }
        disposeExportRows(current);
        return [];
      });
      return;
    }

    let cancelled = false;

    void buildAdjustedRowPreviews(preview.sheet, manualTweaks)
      .then(({ alignedRows: nextAlignedRows, interpolatedRows: nextInterpolatedRows }) => {
        if (cancelled) {
          disposeExportRows(nextAlignedRows);
          disposeExportRows(nextInterpolatedRows);
          return;
        }

        setAdjustedAlignedRows((current) => {
          disposeExportRows(current);
          return nextAlignedRows;
        });
        setAdjustedInterpolatedRows((current) => {
          disposeExportRows(current);
          return nextInterpolatedRows;
        });
      })
      .catch((caughtError) => {
        if (!cancelled) {
          const message =
            caughtError instanceof Error ? caughtError.message : "수동 보정 결과를 다시 렌더링하지 못했습니다.";
          setError(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasManualTweaks, manualTweaks, preview]);

  async function processFile(
    file: File,
    nextLayoutMode = layoutMode,
    nextColumns = columns,
    nextRows = rows,
    nextRowFrameCounts?: number[]
  ) {
    const normalizedColumns = clampGridCount(nextColumns);
    const normalizedRows = clampGridCount(nextRows);
    const jobId = jobRef.current + 1;
    jobRef.current = jobId;

    setLayoutMode(nextLayoutMode);
    setColumns(normalizedColumns);
    setRows(normalizedRows);
    setSelectedFile(file);
    setIsProcessing(true);
    setError(null);
    setStatus(
      nextLayoutMode === "auto"
        ? nextRowFrameCounts?.length
          ? `${file.name}의 row별 frame 수 override를 적용해 다시 처리하는 중입니다...`
          : `${file.name}의 행/열 수를 자동으로 추론한 뒤 처리하는 중입니다...`
        : `${file.name}을(를) ${normalizedColumns} x ${normalizedRows} 레이아웃으로 처리하는 중입니다...`
    );

    try {
      const rowFrameCounts = nextRowFrameCounts?.length ? nextRowFrameCounts : undefined;
      const nextPreview = await buildPreview(
        file,
        nextLayoutMode,
        normalizedColumns,
        normalizedRows,
        rowFrameCounts
      );
      if (jobId !== jobRef.current) {
        disposePreview(nextPreview);
        return;
      }

      startTransition(() => {
        setColumns(nextPreview.layout.columns);
        setRows(nextPreview.layout.rows);
        setPreview((current) => {
          disposePreview(current);
          return nextPreview;
        });
        setStatus(
          `${file.name} 처리가 끝났습니다. ${nextPreview.layout.note}`
        );
      });
    } catch (caughtError) {
      if (jobId !== jobRef.current) {
        return;
      }

      const message =
        caughtError instanceof Error ? caughtError.message : "스프라이트 시트를 처리하지 못했습니다.";
      setError(message);
      setStatus("처리에 실패했습니다. 행/열 값을 조정하거나 다른 PNG로 다시 시도해보세요.");
    } finally {
      if (jobId === jobRef.current) {
        setIsProcessing(false);
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = pickFirstPngFile(event.target.files);
    if (!file) {
      return;
    }

    void processFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!isDragOver) {
      setIsDragOver(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragOver(false);

    const file = pickFirstPngFile(event.dataTransfer?.files);
    if (!file) {
      setError("PNG 파일만 업로드할 수 있습니다.");
      setStatus("드롭한 항목에서 처리 가능한 PNG를 찾지 못했습니다.");
      return;
    }

    void processFile(file);
  }

  async function rerunCurrentFile() {
    if (!selectedFile) {
      return;
    }
    await processFile(selectedFile, layoutMode, columns, rows);
  }

  async function rerunWithRowOverrides() {
    if (!selectedFile || !preview) {
      return;
    }

    const counts = Array.from({ length: preview.sheet.rows }, (_, rowIndex) =>
      clampGridCount(rowFrameOverrides[rowIndex] ?? preview.detectedRowFrameCounts[rowIndex] ?? 1)
    );

    await processFile(selectedFile, "auto", columns, rows, counts);
  }

  async function downloadCurrentSummary() {
    if (!preview) {
      return;
    }

    const summary = buildSummaryPayload(preview, alignedRows, interpolatedRows);
    downloadBlob(
      new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" }),
      `${preview.sheet.id}-summary.json`
    );
  }

  async function downloadZipBundle() {
    if (!preview) {
      return;
    }

    setIsPackaging(true);
    setError(null);

    try {
      const summaryBytes = Uint8Array.from(
        new TextEncoder().encode(
        JSON.stringify(buildSummaryPayload(preview, alignedRows, interpolatedRows), null, 2)
        )
      );
      const entries: ZipEntry[] = [
        {
          name: "summary.json",
          data: summaryBytes
        }
      ];

      for (const row of alignedRows) {
        entries.push({
          name: `aligned/${row.pngName}`,
          data: await objectUrlToBytes(row.imageUrl)
        });
        entries.push({
          name: `aligned/${row.metadataName}`,
          data: await objectUrlToBytes(row.metadataUrl)
        });
      }

      for (const row of interpolatedRows) {
        entries.push({
          name: `interpolated/${row.pngName}`,
          data: await objectUrlToBytes(row.imageUrl)
        });
        entries.push({
          name: `interpolated/${row.metadataName}`,
          data: await objectUrlToBytes(row.metadataUrl)
        });
      }

      const zipBlob = createZipBlob(entries);
      downloadBlob(zipBlob, `${preview.sheet.id}-exports.zip`);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "ZIP 패키지를 만들지 못했습니다.";
      setError(message);
    } finally {
      setIsPackaging(false);
    }
  }

  function updateFrameTweak(animationId: string, frameId: string, axis: keyof Point, value: number) {
    const normalizedValue = Math.max(-64, Math.min(64, Math.round(value || 0)));

    setManualTweaks((current) => {
      const rowTweaks = { ...(current[animationId] ?? {}) };
      const nextPoint = {
        x: rowTweaks[frameId]?.x ?? 0,
        y: rowTweaks[frameId]?.y ?? 0,
        [axis]: normalizedValue
      };

      if (nextPoint.x === 0 && nextPoint.y === 0) {
        delete rowTweaks[frameId];
      } else {
        rowTweaks[frameId] = nextPoint;
      }

      if (Object.keys(rowTweaks).length === 0) {
        const next = { ...current };
        delete next[animationId];
        return next;
      }

      return {
        ...current,
        [animationId]: rowTweaks
      };
    });
  }

  function nudgeFrame(animationId: string, frameId: string, deltaX: number, deltaY: number) {
    setManualTweaks((current) => {
      const rowTweaks = { ...(current[animationId] ?? {}) };
      const currentPoint = rowTweaks[frameId] ?? { x: 0, y: 0 };
      const nextPoint = {
        x: Math.max(-64, Math.min(64, currentPoint.x + deltaX)),
        y: Math.max(-64, Math.min(64, currentPoint.y + deltaY))
      };

      if (nextPoint.x === 0 && nextPoint.y === 0) {
        delete rowTweaks[frameId];
      } else {
        rowTweaks[frameId] = nextPoint;
      }

      if (Object.keys(rowTweaks).length === 0) {
        const next = { ...current };
        delete next[animationId];
        return next;
      }

      return {
        ...current,
        [animationId]: rowTweaks
      };
    });
  }

  function resetRowTweaks(animationId: string) {
    setManualTweaks((current) => {
      if (!(animationId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[animationId];
      return next;
    });
  }

  const averageImprovement =
    preview && (hasManualTweaks ? adjustedAlignedRows : preview.alignedRows).length > 0
      ? (hasManualTweaks ? adjustedAlignedRows : preview.alignedRows).reduce(
          (sum, row) => sum + row.metrics.improvementRatio,
          0
        ) /
        (hasManualTweaks ? adjustedAlignedRows : preview.alignedRows).length
      : null;

  const alignedRows = preview ? (hasManualTweaks ? adjustedAlignedRows : preview.alignedRows) : [];
  const interpolatedRows = preview
    ? (hasManualTweaks ? adjustedInterpolatedRows : preview.interpolatedRows)
    : [];

  const rowGroups = preview
    ? Array.from({ length: preview.sheet.rows }, (_, rowIndex) => ({
        rowIndex,
        animation: preview.sheet.animations[rowIndex],
        cells: preview.rawCells
          .filter((cell) => cell.row === rowIndex)
          .sort((a, b) => a.column - b.column),
        raw: preview.rawRows.find((row) => row.row === rowIndex) ?? null,
        aligned: alignedRows.find((row) => row.row === rowIndex) ?? null,
        interpolated: interpolatedRows.find((row) => row.row === rowIndex) ?? null
      }))
    : [];

  return (
    <main className="studio-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Sprite Registration Studio</p>
          <h1>시트를 올리고, 격자를 확인하고, 보정된 애니메이션 행을 바로 내보내세요.</h1>
          <p className="lede">
            이 브라우저 MVP는 업로드한 PNG에 현재 registration 엔진을 직접 실행한 뒤, 분할된 셀,
            정렬된 행 단위 결과, 그리고 row별 메타데이터를 바로 돌려줍니다.
          </p>
        </div>

        <div className="hero-stats">
          <article className="stat-card">
            <span className="stat-label">레이아웃</span>
            <strong>{preview ? `${preview.sheet.columns} x ${preview.sheet.rows}` : `${columns} x ${rows}`}</strong>
            <span className="stat-note">
              {preview
                ? preview.layout.note
                : "자동 감지는 투명 알파 PNG 기준으로 우선 지원합니다. 필요하면 아래 수동 값을 사용하세요."}
            </span>
          </article>
          <article className="stat-card">
            <span className="stat-label">평균 결과</span>
            <strong>{averageImprovement === null ? "대기 중" : formatJitterDelta(averageImprovement)}</strong>
            <span className="stat-note">body anchor와 ground jitter residual 기준으로 계산합니다.</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">산출물</span>
            <strong>{preview ? `row PNG ${preview.alignedRows.length}개` : "아직 없음"}</strong>
            <span className="stat-note">각 row마다 내려받을 수 있는 JSON 메타데이터가 함께 생성됩니다.</span>
          </article>
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="control-panel">
          <div className="panel-head">
            <p className="section-kicker">엔진 실행</p>
            <h2>업로드하고 처리하기</h2>
          </div>

          <label
            className={`upload-dropzone${isDragOver ? " drag-over" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span className="upload-title">스프라이트 시트 PNG</span>
            <span className="upload-copy">
              시트 하나를 선택하거나, PNG를 이 영역에 드롭하세요. 자동 모드에서는 행 수를 기준으로 각 row의
              frame 경계를 따로 감지하고, 수동 모드에서는 기존처럼 입력한 행/열 수를 사용합니다.
            </span>
            <input type="file" accept="image/png" onChange={handleFileChange} />
          </label>

          <div className="mode-switch" role="group" aria-label="레이아웃 감지 모드">
            <button
              type="button"
              className={layoutMode === "auto" ? "mode-button active" : "mode-button"}
              onClick={() => setLayoutMode("auto")}
            >
              자동 감지
            </button>
            <button
              type="button"
              className={layoutMode === "manual" ? "mode-button active" : "mode-button"}
              onClick={() => setLayoutMode("manual")}
            >
              수동 입력
            </button>
          </div>

          <p className="helper-copy">
            자동 감지는 현재 투명 알파가 있는 시트에서 가장 잘 동작합니다. opaque 입력은 수동 행/열 값으로
            fallback 하는 경우가 있습니다.
          </p>

          <div className="field-row">
            <label className="field">
              <span>열 수</span>
              <input
                type="number"
                min={1}
                max={64}
                value={columns}
                onChange={(event) => setColumns(clampGridCount(Number(event.target.value)))}
              />
            </label>
            <label className="field">
              <span>행 수</span>
              <input
                type="number"
                min={1}
                max={64}
                value={rows}
                onChange={(event) => setRows(clampGridCount(Number(event.target.value)))}
              />
            </label>
          </div>

          <button className="primary-button" type="button" disabled={!selectedFile || isProcessing} onClick={() => void rerunCurrentFile()}>
            {isProcessing
              ? "엔진 실행 중..."
              : layoutMode === "auto"
                ? "자동 감지로 다시 실행"
                : "현재 레이아웃으로 다시 실행"}
          </button>

          <div className="status-card">
            <span className="status-label">상태</span>
            <p>{status}</p>
            {selectedFile ? <span className="status-pill">{selectedFile.name}</span> : null}
            {error ? <p className="error-copy">{error}</p> : null}
          </div>

          {preview ? (
            <div className="download-block">
              <div className="panel-head compact">
                <p className="section-kicker">감지 결과</p>
                <h3>Row별 프레임 수</h3>
              </div>
              <ul className="metric-list">
                {preview.detectedRowFrameCounts.map((count, rowIndex) => (
                  <li key={rowIndex}>
                    <span>{`Row ${rowIndex + 1}`}</span>
                    <strong>{`${count} frames`}</strong>
                  </li>
                ))}
              </ul>

              <div className="panel-head compact">
                <p className="section-kicker">수동 보정</p>
                <h3>Row별 프레임 수 override</h3>
              </div>
              <div className="tweak-grid">
                {preview.detectedRowFrameCounts.map((count, rowIndex) => (
                  <label className="field" key={rowIndex}>
                    <span>{`Row ${rowIndex + 1}`}</span>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={rowFrameOverrides[rowIndex] ?? count}
                      onChange={(event) =>
                        setRowFrameOverrides((current) => ({
                          ...current,
                          [rowIndex]: clampGridCount(Number(event.target.value))
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="secondary-link action-link"
                type="button"
                disabled={!selectedFile || isProcessing}
                onClick={() => void rerunWithRowOverrides()}
              >
                row별 프레임 수로 다시 처리
              </button>

              <div className="panel-head compact">
                <p className="section-kicker">다운로드</p>
                <h3>세션 요약</h3>
              </div>
              <button className="secondary-link action-link" type="button" onClick={() => void downloadCurrentSummary()}>
                현재 summary JSON 다운로드
              </button>
              <button
                className="secondary-link action-link"
                type="button"
                disabled={isPackaging}
                onClick={() => void downloadZipBundle()}
              >
                {isPackaging ? "ZIP 패키징 중..." : "현재 결과 ZIP 다운로드"}
              </button>
            </div>
          ) : null}
        </aside>

        <div className="preview-stack">
          <section className="panel">
            <div className="panel-head compact">
              <p className="section-kicker">격자 확인</p>
              <h2>감지된 시트 레이아웃</h2>
            </div>

            {preview ? (
              <div className="sheet-review">
                <div className="sheet-stage">
                  <img
                    className="sheet-image"
                    src={preview.originalUrl}
                    alt={`${preview.originalName} grid preview`}
                  />
                  <div className="sheet-overlay">
                    {preview.rawCells.map((cell) => (
                      <div
                        key={cell.id}
                        className="grid-cell"
                        style={{
                          left: `${(cell.rect.x / preview.sheet.width) * 100}%`,
                          top: `${(cell.rect.y / preview.sheet.height) * 100}%`,
                          width: `${(cell.rect.width / preview.sheet.width) * 100}%`,
                          height: `${(cell.rect.height / preview.sheet.height) * 100}%`
                        }}
                      >
                        <span>
                          R{cell.row + 1}C{cell.column + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sheet-meta">
                  <div>
                    <span className="meta-label">원본 크기</span>
                    <strong>
                      {preview.sheet.width} x {preview.sheet.height}
                    </strong>
                  </div>
                  <div>
                    <span className="meta-label">감지된 셀</span>
                    <strong>{preview.rawCells.length}</strong>
                  </div>
                  <div>
                    <span className="meta-label">애니메이션 행</span>
                    <strong>{preview.sheet.rows}</strong>
                  </div>
                  <div>
                    <span className="meta-label">감지 방식</span>
                    <strong>
                      {preview.layout.method === "alpha"
                        ? "자동(alpha)"
                        : preview.layout.method === "energy"
                          ? "fallback(energy)"
                          : "수동"}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-panel">
                PNG를 업로드하면 감지된 격자 오버레이를 보고 현재 레이아웃 가정이 맞는지 바로 확인할 수 있습니다.
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head compact">
              <p className="section-kicker">전 / 후 비교</p>
              <h2>행 단위 결과 확인</h2>
            </div>

            {preview ? (
              <div className="row-list">
                {rowGroups.map(({ rowIndex, animation, cells, raw, aligned, interpolated }) => (
                  <article className="row-card" key={`row-${rowIndex}`}>
                    <div className="row-summary">
                      <div>
                        <span className="meta-label">행 {rowIndex + 1}</span>
                        <h3>프레임 {aligned?.frameCount ?? cells.length}개</h3>
                      </div>
                      {aligned ? (
                        <div className="metric-cluster">
                          <span>{formatJitterDelta(aligned.metrics.improvementRatio)}</span>
                          <small>
                            보정 전 {aligned.metrics.rawJitterScore.toFixed(2)} → 보정 후{" "}
                            {aligned.metrics.alignedJitterScore.toFixed(2)}
                          </small>
                        </div>
                      ) : null}
                    </div>

                    <div className="compare-grid">
                      <div className="compare-pane full-width">
                        {raw && aligned ? (
                          <div className="aligned-preview">
                            <RowComparisonPlayer raw={raw} aligned={aligned} />
                            <div className="download-row">
                              <a className="secondary-link" href={aligned.imageUrl} download={aligned.pngName}>
                                PNG 다운로드
                              </a>
                              <a
                                className="secondary-link"
                                href={aligned.metadataUrl}
                                download={aligned.metadataName}
                              >
                                메타데이터 다운로드
                              </a>
                            </div>

                            {interpolated ? (
                              <div className="interpolation-panel">
                                <div className="interpolation-summary">
                                  <div>
                                    <span className="compare-label">보간 실험</span>
                                    <h4>
                                      {interpolated.sourceFrameCount} → {interpolated.frameCount} 프레임
                                    </h4>
                                  </div>
                                  <small>
                                    인접 프레임 사이에 {interpolated.insertedFrameCount}장의 중간 프레임을
                                    생성했습니다.
                                  </small>
                                </div>
                                <AnimationStripPlayer
                                  imageUrl={interpolated.imageUrl}
                                  frameCount={interpolated.frameCount}
                                  cellWidth={interpolated.cellWidth}
                                  cellHeight={interpolated.cellHeight}
                                  label={`행 ${rowIndex + 1} 보간 재생`}
                                />
                                <div className="download-row">
                                  <a className="secondary-link" href={interpolated.imageUrl} download={interpolated.pngName}>
                                    보간 PNG 다운로드
                                  </a>
                                  <a
                                    className="secondary-link"
                                    href={interpolated.metadataUrl}
                                    download={interpolated.metadataName}
                                  >
                                    보간 메타데이터 다운로드
                                  </a>
                                </div>
                              </div>
                            ) : null}

                            <div className="tweak-panel">
                              <div className="tweak-header">
                                <span className="compare-label">수동 미세 보정</span>
                                <button
                                  type="button"
                                  className="tiny-button"
                                  onClick={() => resetRowTweaks(animation.id)}
                                >
                                  이 행 초기화
                                </button>
                              </div>
                              <div className="tweak-grid">
                                {animation.frames.map((frame, frameIndex) => {
                                  const tweak = manualTweaks[animation.id]?.[frame.id] ?? { x: 0, y: 0 };

                                  return (
                                    <div className="tweak-card" key={frame.id}>
                                      <strong>프레임 {frameIndex + 1}</strong>
                                      <label className="mini-field">
                                        <span>X</span>
                                        <input
                                          type="number"
                                          min={-64}
                                          max={64}
                                          value={tweak.x}
                                          onChange={(event) =>
                                            updateFrameTweak(
                                              animation.id,
                                              frame.id,
                                              "x",
                                              Number(event.target.value)
                                            )
                                          }
                                        />
                                      </label>
                                      <label className="mini-field">
                                        <span>Y</span>
                                        <input
                                          type="number"
                                          min={-64}
                                          max={64}
                                          value={tweak.y}
                                          onChange={(event) =>
                                            updateFrameTweak(
                                              animation.id,
                                              frame.id,
                                              "y",
                                              Number(event.target.value)
                                            )
                                          }
                                        />
                                      </label>
                                      <div className="nudge-row">
                                        <button
                                          type="button"
                                          className="tiny-button"
                                          onClick={() => nudgeFrame(animation.id, frame.id, -1, 0)}
                                        >
                                          X-1
                                        </button>
                                        <button
                                          type="button"
                                          className="tiny-button"
                                          onClick={() => nudgeFrame(animation.id, frame.id, 1, 0)}
                                        >
                                          X+1
                                        </button>
                                        <button
                                          type="button"
                                          className="tiny-button"
                                          onClick={() => nudgeFrame(animation.id, frame.id, 0, -1)}
                                        >
                                          Y-1
                                        </button>
                                        <button
                                          type="button"
                                          className="tiny-button"
                                          onClick={() => nudgeFrame(animation.id, frame.id, 0, 1)}
                                        >
                                          Y+1
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="empty-inline">
                            이 행은 비교용 재생 결과를 만들지 못했습니다.
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-panel">
                시트를 처리하면 이 영역에 행별 원본 프레임, 보정 결과, 그리고 다운로드 가능한 PNG/JSON 산출물이 표시됩니다.
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
