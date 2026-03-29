import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
function resolveBasePath(value) {
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
