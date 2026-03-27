import type { Rect } from "../types/image";

export interface ConnectedComponent {
  area: number;
  pixels: Array<{ x: number; y: number }>;
  bounds: Rect;
}

function boundsFromPixels(pixels: Array<{ x: number; y: number }>): Rect {
  let minX = pixels[0].x;
  let minY = pixels[0].y;
  let maxX = pixels[0].x;
  let maxY = pixels[0].y;

  for (const pixel of pixels.slice(1)) {
    minX = Math.min(minX, pixel.x);
    minY = Math.min(minY, pixel.y);
    maxX = Math.max(maxX, pixel.x);
    maxY = Math.max(maxY, pixel.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

export function createBooleanMask(width: number, height: number, value = false): boolean[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => value));
}

export function collectConnectedComponents(mask: boolean[][]): ConnectedComponent[] {
  const height = mask.length;
  const width = mask[0]?.length ?? 0;
  const visited = createBooleanMask(width, height, false);
  const components: ConnectedComponent[] = [];

  const offsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y][x] || visited[y][x]) {
        continue;
      }

      const stack = [{ x, y }];
      const pixels: Array<{ x: number; y: number }> = [];
      visited[y][x] = true;

      while (stack.length > 0) {
        const current = stack.pop()!;
        pixels.push(current);

        for (const [dx, dy] of offsets) {
          const nextX = current.x + dx;
          const nextY = current.y + dy;
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= width ||
            nextY >= height ||
            visited[nextY][nextX] ||
            !mask[nextY][nextX]
          ) {
            continue;
          }

          visited[nextY][nextX] = true;
          stack.push({ x: nextX, y: nextY });
        }
      }

      components.push({
        area: pixels.length,
        pixels,
        bounds: boundsFromPixels(pixels)
      });
    }
  }

  return components.sort((a, b) => b.area - a.area);
}

export function renderComponents(
  width: number,
  height: number,
  components: ConnectedComponent[]
): boolean[][] {
  const mask = createBooleanMask(width, height, false);
  for (const component of components) {
    for (const pixel of component.pixels) {
      mask[pixel.y][pixel.x] = true;
    }
  }
  return mask;
}

export function dilateMask(mask: boolean[][], radius: number): boolean[][] {
  const height = mask.length;
  const width = mask[0]?.length ?? 0;
  const dilated = createBooleanMask(width, height, false);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y][x]) {
        continue;
      }

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX >= 0 && nextY >= 0 && nextX < width && nextY < height) {
            dilated[nextY][nextX] = true;
          }
        }
      }
    }
  }

  return dilated;
}

export function majorityFilter(mask: boolean[][], minimumNeighbors: number): boolean[][] {
  const height = mask.length;
  const width = mask[0]?.length ?? 0;
  const filtered = createBooleanMask(width, height, false);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }
          if (mask[nextY][nextX]) {
            neighbors += 1;
          }
        }
      }

      filtered[y][x] = mask[y][x] && neighbors >= minimumNeighbors;
    }
  }

  return filtered;
}
