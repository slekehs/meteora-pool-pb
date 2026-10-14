import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { type AppConfig, loadAppConfig } from "./schema.js";

export function loadConfigFromFile(path: string): AppConfig {
  const text = readFileSync(resolve(path), "utf8");
  const parsed = YAML.parse(text);
  return loadAppConfig(parsed);
}

export function loadConfigFromEnv(): AppConfig {
  const path = process.env.APP_CONFIG;
  if (!path) {
    throw new Error("APP_CONFIG is required (path to YAML config)");
  }
  return loadConfigFromFile(path);
}
