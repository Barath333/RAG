import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The browser calls /api/*; in dev Vite forwards that to the Express server and strips the prefix.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
});
