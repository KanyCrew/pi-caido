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
 * Normalizes a port number or URL string into a complete HTTP URL.
 * Examples:
 *   9080 -> "http://127.0.0.1:9080"
 *   "9080" -> "http://127.0.0.1:9080"
 *   ":9080" -> "http://127.0.0.1:9080"
 *   "127.0.0.1:9080" -> "http://127.0.0.1:9080"
 *   "http://127.0.0.1:9080" -> "http://127.0.0.1:9080"
 */
export function normalizePortOrUrl(input: string | number, defaultPath = ""): string {
  if (typeof input === "number") {
    return `http://127.0.0.1:${input}${defaultPath}`;
  }
  const str = String(input).trim();
  if (!str) return "";
  if (/^\d+$/.test(str)) {
    return `http://127.0.0.1:${str}${defaultPath}`;
  }
  if (/^:\d+$/.test(str)) {
    return `http://127.0.0.1${str}${defaultPath}`;
  }
  if (!str.includes("://")) {
    return `http://${str}`;
  }
  return str;
}

/**
 * Extract integer port from URL or port representation.
 */
export function extractPort(input?: string | number): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input === "number") return input;
  const str = String(input).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  try {
    const url = new URL(str.includes("://") ? str : `http://${str}`);
    if (url.port) return parseInt(url.port, 10);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return undefined;
  }
}

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
  const envMcpPort = process.env.CAIDO_MCP_PORT;
  const envProxyUrl = process.env.CAIDO_PROXY_URL;
  const envProxyPort = process.env.CAIDO_PROXY_PORT || process.env.CAIDO_PORT;
  const envApiKey = process.env.CAIDO_API_KEY;
  const envProxyEnabled = process.env.CAIDO_PROXY_ENABLED;

  const rawProxy =
    envProxyUrl ||
    (envProxyPort ? normalizePortOrUrl(envProxyPort) : undefined) ||
    fileConfig.proxyUrl ||
    (fileConfig.proxyPort ? normalizePortOrUrl(fileConfig.proxyPort) : undefined) ||
    (fileConfig.port ? normalizePortOrUrl(fileConfig.port) : undefined) ||
    DEFAULT_CONFIG.proxyUrl;

  const rawMcp =
    envMcpUrl ||
    (envMcpPort ? normalizePortOrUrl(envMcpPort, "/mcp") : undefined) ||
    fileConfig.mcpUrl ||
    (fileConfig.mcpPort ? normalizePortOrUrl(fileConfig.mcpPort, "/mcp") : undefined) ||
    DEFAULT_CONFIG.mcpUrl;

  const resolvedProxyUrl = normalizePortOrUrl(rawProxy);
  const resolvedMcpUrl = normalizePortOrUrl(rawMcp, "/mcp");

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    proxyUrl: resolvedProxyUrl,
    mcpUrl: resolvedMcpUrl,
    proxyPort: extractPort(resolvedProxyUrl),
    port: extractPort(resolvedProxyUrl),
    mcpPort: extractPort(resolvedMcpUrl),
    apiKey: envApiKey || fileConfig.apiKey,
    proxyEnabled:
      envProxyEnabled !== undefined
        ? envProxyEnabled === "1" || envProxyEnabled === "true"
        : (fileConfig.proxyEnabled ?? DEFAULT_CONFIG.proxyEnabled),
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
