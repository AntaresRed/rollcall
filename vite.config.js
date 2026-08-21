import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          // Supabase only — it's the bulk of the vendor weight and changes far
          // less often than the app, so it earns its own cache entry.
          //
          // React deliberately stays in the entry chunk: splitting the
          // framework out is a known source of module-initialisation ordering
          // bugs, and those present as a blank page.
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
