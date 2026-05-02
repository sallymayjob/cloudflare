import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const configFile = resolve(scriptDir, "..", "wrangler.toml");

let config;
try {
  config = readFileSync(configFile, "utf8");
} catch {
  console.error(`Missing wrangler.toml at ${configFile}`);
  process.exit(1);
}

const placeholderPattern = /REPLACE_[A-Z0-9_]+/g;
const matches = [...config.matchAll(placeholderPattern)];
const linePlaceholderPattern = /REPLACE_[A-Z0-9_]+/;

if (matches.length > 0) {
  console.error("Placeholder values still present in wrangler.toml.");
  console.error("Replace all REPLACE_* values before deploying.");

  const lines = config.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (linePlaceholderPattern.test(line)) {
      console.error(`${index + 1}:${line}`);
    }
  }

  process.exit(1);
}

console.log("predeploy-check passed: no placeholder values found in wrangler.toml");
