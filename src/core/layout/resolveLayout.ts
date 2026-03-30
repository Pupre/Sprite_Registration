import type { GridLayoutInference } from "./inferGridLayout";

export interface ResolvedAutoLayout {
  columns: number;
  rows: number;
  note: string;
  reliable: boolean;
  source: "auto" | "manual-fallback" | "mixed";
}

export function resolveAutoLayout(
  inferred: GridLayoutInference,
  manualColumns: number,
  manualRows: number
): ResolvedAutoLayout {
  if (inferred.rows.reliable && inferred.columns.reliable) {
    return {
      columns: inferred.columns.count,
      rows: inferred.rows.count,
      note: `투명 알파 projection 기반 자동 감지 결과를 사용했습니다. 열 ${inferred.columns.count}, 행 ${inferred.rows.count}으로 처리했습니다.`,
      reliable: true,
      source: "auto"
    };
  }

  if (inferred.rows.reliable) {
    return {
      columns: manualColumns,
      rows: inferred.rows.count,
      note: `행 수는 자동 감지(${inferred.rows.count})를 사용했고, 열 수는 수동값 ${manualColumns}으로 보완했습니다. variable-row 시트에서 열 추론이 흔들릴 때 사용하는 fallback입니다.`,
      reliable: true,
      source: "mixed"
    };
  }

  return {
    columns: manualColumns,
    rows: manualRows,
    note: "자동 감지 신뢰도가 낮아서 현재 수동 입력값으로 fallback 했습니다. 투명 알파 PNG에서 가장 잘 동작합니다.",
    reliable: false,
    source: "manual-fallback"
  };
}
