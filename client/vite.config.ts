import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { version } from "../package.json";

export default defineConfig({
  plugins: [react()],
  // Le numéro de version de Milo, celui du package.json racine, gravé dans le
  // code au build : le logo de l'entête l'affiche au survol.
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
        // Le flux d'événements ne doit pas être mis en tampon par le proxy :
        // sans cela, le client ne voit rien arriver.
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
    // Les trois gros morceaux sont séparés du code de l'application : ils ne
    // changent qu'aux montées de version, le navigateur les garde en cache
    // d'un déploiement à l'autre.
    rollupOptions: {
      output: {
        // La forme fonction plutôt que la forme objet : elle ne voit que les
        // modules réellement présents dans le graphe, et ne se fâche donc pas
        // sur un build SSR, où React et Mantine sont externes.
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
