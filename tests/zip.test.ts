import { describe, expect, it } from "vitest";
import { createZipBlob } from "../src/browser/zip";

function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => (value >= 32 && value <= 126 ? String.fromCharCode(value) : "."))
    .join("");
}

describe("createZipBlob", () => {
  it("creates a valid store-only zip with file headers, central directory, and names", async () => {
    const blob = createZipBlob([
      { name: "aligned/row-1.json", data: new TextEncoder().encode("{\"ok\":true}") },
      { name: "aligned/row-1.png", data: new Uint8Array([137, 80, 78, 71]) }
    ]);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ascii = bytesToAscii(bytes);

    expect(blob.type).toBe("application/zip");
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(ascii).toContain("aligned/row-1.json");
    expect(ascii).toContain("aligned/row-1.png");
    expect(bytes.includes(0x06)).toBe(true);
  });
});
