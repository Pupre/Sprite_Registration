import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function resolveBasePath(value: string | undefined): string {
  if (!value || value === "/") {
    return "/";
  }

  const trimmed = value.trim().replace(/\/+$/u, "");

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  return trimmed.startsWith("/") ? `${trimmed}/` : `/${trimmed}/`;
}

export default defineConfig({
  base: resolveBasePath(process.env.VITE_BASE_PATH),
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
