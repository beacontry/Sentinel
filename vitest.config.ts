import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  // tsconfig keeps JSX as "preserve" for Next; tests that render a component
  // with react-dom/server need the transform to compile it instead.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
