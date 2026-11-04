/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the app from /<repo>/, so the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? "/";

// The About dialog shows the app's version and when it was built (docs/design/library/spec.md, 8a).
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        id: base,
        name: "Sentinel Comics RPG Aid",
        short_name: "SCRPG Aid",
        description: "Create heroes and run games for the Sentinel Comics RPG.",
        // --ui-surface and --ui-bg from src/theme/tokens.css (light, the default when the system has no preference).
        theme_color: "#ffffff",
        background_color: "#f6f7fb",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,json,woff2}"],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/PwaUpdater.tsx",
      ],
    },
  },
  server: {
    // Polling, since the file watcher misses edits on /mnt/c under WSL. Skip folders that never
    // change while developing, and poll less often, so it doesn't swamp the CPU.
    // watch: {
    //   usePolling: true,
    //   interval: 1000,
    //   binaryInterval: 3000,
    //   ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/coverage/**", "**/sources/**"],
    // },
  },
});
