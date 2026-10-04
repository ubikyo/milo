import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { version } from "../package.json";

export default defineConfig({
  plugins: [react()],
  // Milo's version number, from the root package.json, baked into the
  // code at build time: the header logo shows it on hover.
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    host: true,
    port: 5273,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        // The event stream must not be buffered by the proxy:
        // otherwise the client sees nothing arrive.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache, no-transform";
            }
          });
        },
      },
    },
  },
  build: {
    // The three big chunks are split from the application code: they only
    // change on version bumps, so the browser keeps them cached
    // from one deployment to the next.
    rollupOptions: {
      output: {
        // The function form rather than the object form: it only sees
        // modules actually present in the graph, and so does not complain
        // on an SSR build, where React and Mantine are external.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/@tiptap/") || id.includes("/@mantine/tiptap/")) return "editeur";
          if (id.includes("/@mantine/")) return "mantine";
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
});
