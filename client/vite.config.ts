import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { version } from "../package.json";

// Each build gets its own identifier, baked into the code and written beside
// it in version.json. The client rereads that file now and then: a different
// identifier means a newer build was put in place since the page loaded
// (NewVersionBanner).
const BUILD_ID = `${version}-${Date.now().toString(36)}`;

const buildId = (): Plugin => ({
  name: "milo-build-id",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [react(), buildId()],
  // Milo's version number, from the root package.json, baked into the
  // code at build time: the header logo shows it on hover.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
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
