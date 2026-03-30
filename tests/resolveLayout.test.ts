import { describe, expect, it } from "vitest";
import { resolveAutoLayout } from "../src/core/layout/resolveLayout";
import type { GridLayoutInference } from "../src/core/layout/inferGridLayout";

function buildInference(columns: number, rows: number, columnReliable: boolean, rowReliable: boolean): GridLayoutInference {
  return {
    columns: {
      count: columns,
      score: 1,
      margin: 0.3,
      reliable: columnReliable
    },
    rows: {
      count: rows,
      score: 1,
      margin: 0.3,
      reliable: rowReliable
    },
    method: "alpha",
    transparentInput: true,
    reliable: columnReliable && rowReliable
  };
}

describe("resolveAutoLayout", () => {
  it("keeps auto row detection even when column inference is unreliable", () => {
    const resolved = resolveAutoLayout(buildInference(1, 4, false, true), 4, 3);

    expect(resolved.rows).toBe(4);
    expect(resolved.columns).toBe(4);
    expect(resolved.source).toBe("mixed");
    expect(resolved.reliable).toBe(true);
  });

  it("falls back completely when row inference is unreliable", () => {
    const resolved = resolveAutoLayout(buildInference(1, 1, false, false), 4, 3);

    expect(resolved.rows).toBe(3);
    expect(resolved.columns).toBe(4);
    expect(resolved.source).toBe("manual-fallback");
    expect(resolved.reliable).toBe(false);
  });
});
