import type { RgbaImage } from "../core/types/image";

function canvasFromImage(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is not available in this browser.");
  }

  const imageData = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

export async function decodeBrowserImage(file: File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Canvas 2D context is not available in this browser.");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  return {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8Array(imageData.data)
  };
}

export function rgbaImageToObjectUrl(image: RgbaImage): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = canvasFromImage(image);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode preview PNG."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

export function jsonToObjectUrl(payload: unknown): string {
  return URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    })
  );
}
