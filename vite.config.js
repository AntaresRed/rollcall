import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          // Supabase is the bulk of the vendor weight and changes far less
          // often than the app, so it gets its own long-lived cache entry.
          supabase: ["@supabase/supabase-js"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
