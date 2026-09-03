import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/config.ts",
    "src/proxy.ts",
    "src/mcp-client.ts",
    "src/tools.ts",
    "src/commands.ts",
    "src/types.ts"
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  splitting: false,
  shims: true,
  external: [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-ai",
    "@mariozechner/pi-coding-agent",
    "typebox"
  ]
});
