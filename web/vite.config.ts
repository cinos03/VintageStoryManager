import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development the frontend runs on :5173 and proxies API + WebSocket
// traffic to the manager backend on :8080. In production the backend serves
// the built files directly.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
