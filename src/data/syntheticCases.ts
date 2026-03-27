import type { Matrix, SpriteFrame } from "../core/types/sprite";
import { createMatrix } from "../core/utils/matrix";

function paintRect(matrix: Matrix, x0: number, y0: number, x1: number, y1: number, alpha = 255) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (matrix[y]?.[x] !== undefined) {
        matrix[y][x] = alpha;
      }
    }
  }
}

function buildBodyFrame(id: string, bodyX: number, bodyY: number, effect = false): SpriteFrame {
  const alpha = createMatrix(12, 12, 0);
  paintRect(alpha, bodyX, bodyY, bodyX + 4, bodyY + 4, 255);
  paintRect(alpha, bodyX + 1, bodyY - 1, bodyX + 3, bodyY - 1, 255);

  if (effect) {
    paintRect(alpha, bodyX + 5, bodyY + 2, bodyX + 7, bodyY + 3, 90);
  }

  return { id, alpha };
}

export function createIdleJitterSequence(): SpriteFrame[] {
  return [
    buildBodyFrame("idle-0", 3, 6),
    buildBodyFrame("idle-1", 4, 5),
    buildBodyFrame("idle-2", 3, 6, true),
    buildBodyFrame("idle-3", 4, 6)
  ];
}

export function createEffectHeavySequence(): SpriteFrame[] {
  return [
    buildBodyFrame("attack-0", 3, 6),
    buildBodyFrame("attack-1", 3, 6, true),
    buildBodyFrame("attack-2", 3, 6),
    buildBodyFrame("attack-3", 3, 6, true)
  ];
}

export function createAirborneSequence(): SpriteFrame[] {
  return [
    buildBodyFrame("jump-0", 3, 7),
    buildBodyFrame("jump-1", 3, 6),
    buildBodyFrame("jump-2", 3, 5),
    buildBodyFrame("jump-3", 3, 4)
  ];
}
