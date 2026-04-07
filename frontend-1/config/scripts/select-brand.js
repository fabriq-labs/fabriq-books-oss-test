#!/usr/bin/env node
/**
 * Copies config/<brand>/ into src/config/ before Vite runs.
 * - With `--interactive`: prompt to choose a brand (npm run dev).
 * - With a brand arg (e.g. fabriq): use that brand (npm run dev:fabriq).
 * - Otherwise: APP_NAME from .env / .env.local, or default zeiv.
 *
 * Production build (from frontend-1/):
 *   npm run build           — brand from APP_NAME, else zeiv
 *   npm run build:fabriq    — fabriq
 *   npm run build:zeiv      — zeiv
 * Then optionally: npm run preview  — serve dist/ locally
 */
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../..");
const configRoot = path.join(frontendRoot, "config");
const srcConfigDir = path.join(frontendRoot, "src", "config");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function listValidBrands() {
  if (!fs.existsSync(configRoot)) return [];
  return fs
    .readdirSync(configRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "scripts")
    .map((d) => d.name)
    .filter((name) =>
      fs.existsSync(path.join(configRoot, name, "config.json")),
    );
}

async function promptBrand(brands) {
  if (brands.length === 0) {
    console.error("Error: no brand folders with config.json under config/.");
    process.exit(1);
  }
  if (brands.length === 1) {
    console.log(`Using brand: ${brands[0]}`);
    return brands[0];
  }

  const envDefault = process.env.APP_NAME?.trim();
  let defaultIdx = envDefault ? brands.indexOf(envDefault) : -1;
  if (defaultIdx < 0) defaultIdx = 0;
  const defaultNum = defaultIdx + 1;
  const defaultBrand = brands[defaultIdx];

  console.log("Select app / brand:\n");
  brands.forEach((b, i) => {
    const mark = i === defaultIdx ? " (default)" : "";
    console.log(`  ${i + 1}) ${b}${mark}`);
  });

  const rl = readline.createInterface({ input, output });
  const hint = `Enter 1–${brands.length} or name [${defaultBrand}]: `;
  const answer = (await rl.question(hint)).trim();
  rl.close();

  if (!answer) return defaultBrand;

  const n = parseInt(answer, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= brands.length) {
    return brands[n - 1];
  }
  if (brands.includes(answer)) return answer;

  console.error(`Invalid choice "${answer}", using ${defaultBrand}.`);
  return defaultBrand;
}

function resolveAppName() {
  const interactive = process.argv.includes("--interactive");
  if (interactive) return null;

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const cliBrand = positional[0]?.trim();
  if (cliBrand) return cliBrand;

  return process.env.APP_NAME?.trim() || "zeiv";
}

function applyBrand(appName) {
  const brandDir = path.join(configRoot, appName);
  if (!fs.existsSync(brandDir) || !fs.statSync(brandDir).isDirectory()) {
    const dirs = listValidBrands();
    console.error(
      `Error: config/${appName} does not exist. Use one of: ${dirs.join(", ")}`,
    );
    process.exit(1);
  }

  const configJsonPath = path.join(brandDir, "config.json");
  if (!fs.existsSync(configJsonPath)) {
    console.error(`Error: config/${appName}/config.json not found.`);
    process.exit(1);
  }

  if (!fs.existsSync(srcConfigDir)) {
    fs.mkdirSync(srcConfigDir, { recursive: true });
  }

  fs.copyFileSync(configJsonPath, path.join(srcConfigDir, "config.json"));

  const brandFiles = fs.readdirSync(brandDir);
  for (const file of brandFiles) {
    if (file === "config.json") continue;
    const base = path.basename(file, path.extname(file)).toLowerCase();
    if (base === "favicon" || base === "logo") {
      fs.copyFileSync(path.join(brandDir, file), path.join(srcConfigDir, file));
    }
  }
}

async function main() {
  loadEnvFile(path.join(frontendRoot, ".env"));
  loadEnvFile(path.join(frontendRoot, ".env.local"));

  let appName = resolveAppName();
  if (appName === null) {
    appName = await promptBrand(listValidBrands());
  }

  applyBrand(appName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
