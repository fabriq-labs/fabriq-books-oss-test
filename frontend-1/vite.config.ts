import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

/** Injects brand config from src/config/config.json into index.html placeholders. */
function brandHtmlPlugin() {
  const configPath = path.resolve(__dirname, "src/config/config.json");
  return {
    name: "brand-html",
    transformIndexHtml(html: string) {
      if (!fs.existsSync(configPath)) return html;
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return html
        .replace(/__APP_NAME__/g, config.appName ?? "")
        .replace(/__APP_TAGLINE__/g, config.appTagline ?? "");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const API_URL = `${env.VITE_API_BASE_URL ?? 'http://localhost:4000'}`;
  return {
    server: {
      host: "::",
      port: 5173,
      proxy: {
        '/api': {
          target: API_URL,
          changeOrigin: true,
          // If your API doesn't have /api prefix, you might need to rewrite the path
          // rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    plugins: [
      brandHtmlPlugin(),
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
