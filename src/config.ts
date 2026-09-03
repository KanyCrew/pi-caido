import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CaidoConfig } from "./types.js";

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "caido.json");

export const DEFAULT_CONFIG: CaidoConfig = {
  mcpUrl: "http://127.0.0.1:3333/mcp",
  proxyUrl: "http://127.0.0.1:8080",
  proxyEnabled: false,
  timeoutMs: 15000,
  autoRegisterTools: true,
  toolPrefix: "caido_",
  allowInsecureTls: true,
};

/**
 * Load configuration merged from global file, local directory file, and env vars.
 */
export function loadConfig(cwd: string = process.cwd()): CaidoConfig {
  let fileConfig: Partial<CaidoConfig> = {};

  // 1. Try global ~/.pi/agent/caido.json
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const content = fs.readFileSync(GLOBAL_CONFIG_PATH, "utf-8");
      fileConfig = { ...fileConfig, ...JSON.parse(content) };
    }
  } catch (err) {
    console.warn(`[pi-caido] Could not read global config at ${GLOBAL_CONFIG_PATH}:`, err);
  }

  // 2. Try project-local .caido.json
  try {
    const localPath = path.join(cwd, ".caido.json");
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, "utf-8");
      fileConfig = { ...fileConfig, ...JSON.parse(content) };
    }
  } catch (err) {
    console.warn(`[pi-caido] Could not read project-local config at ${cwd}:`, err);
  }

  // 3. Environment variables take precedence
  const envMcpUrl = process.env.CAIDO_MCP_URL;
  const envProxyUrl = process.env.CAIDO_PROXY_URL;
  const envApiKey = process.env.CAIDO_API_KEY;
  const envProxyEnabled = process.env.CAIDO_PROXY_ENABLED;

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    mcpUrl: envMcpUrl || fileConfig.mcpUrl || DEFAULT_CONFIG.mcpUrl,
    proxyUrl: envProxyUrl || fileConfig.proxyUrl || DEFAULT_CONFIG.proxyUrl,
    apiKey: envApiKey || fileConfig.apiKey,
    proxyEnabled: envProxyEnabled !== undefined ? envProxyEnabled === "1" || envProxyEnabled === "true" : (fileConfig.proxyEnabled ?? DEFAULT_CONFIG.proxyEnabled),
  };
}

/**
 * Persist configuration changes to global ~/.pi/agent/caido.json.
 */
export function saveGlobalConfig(partial: Partial<CaidoConfig>): void {
  try {
    const dir = path.dirname(GLOBAL_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let existing: Partial<CaidoConfig> = {};
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      existing = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
    }
    const updated = { ...existing, ...partial };
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error(`[pi-caido] Failed to save config to ${GLOBAL_CONFIG_PATH}:`, err);
  }
}
