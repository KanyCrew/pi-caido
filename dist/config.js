// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
var GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "caido.json");
var DEFAULT_CONFIG = {
  mcpUrl: "http://127.0.0.1:3333/mcp",
  proxyUrl: "http://127.0.0.1:8080",
  proxyEnabled: false,
  timeoutMs: 15e3,
  autoRegisterTools: true,
  toolPrefix: "caido_",
  allowInsecureTls: true
};
function normalizePortOrUrl(input, defaultPath = "") {
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
function extractPort(input) {
  if (input === void 0 || input === null || input === "") return void 0;
  if (typeof input === "number") return input;
  const str = String(input).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  try {
    const url = new URL(str.includes("://") ? str : `http://${str}`);
    if (url.port) return parseInt(url.port, 10);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return void 0;
  }
}
function loadConfig(cwd = process.cwd()) {
  let fileConfig = {};
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const content = fs.readFileSync(GLOBAL_CONFIG_PATH, "utf-8");
      fileConfig = { ...fileConfig, ...JSON.parse(content) };
    }
  } catch (err) {
    console.warn(`[pi-caido] Could not read global config at ${GLOBAL_CONFIG_PATH}:`, err);
  }
  try {
    const localPath = path.join(cwd, ".caido.json");
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, "utf-8");
      fileConfig = { ...fileConfig, ...JSON.parse(content) };
    }
  } catch (err) {
    console.warn(`[pi-caido] Could not read project-local config at ${cwd}:`, err);
  }
  const envMcpUrl = process.env.CAIDO_MCP_URL;
  const envMcpPort = process.env.CAIDO_MCP_PORT;
  const envProxyUrl = process.env.CAIDO_PROXY_URL;
  const envProxyPort = process.env.CAIDO_PROXY_PORT || process.env.CAIDO_PORT;
  const envApiKey = process.env.CAIDO_API_KEY;
  const envProxyEnabled = process.env.CAIDO_PROXY_ENABLED;
  const rawProxy = envProxyUrl || (envProxyPort ? normalizePortOrUrl(envProxyPort) : void 0) || fileConfig.proxyUrl || (fileConfig.proxyPort ? normalizePortOrUrl(fileConfig.proxyPort) : void 0) || (fileConfig.port ? normalizePortOrUrl(fileConfig.port) : void 0) || DEFAULT_CONFIG.proxyUrl;
  const rawMcp = envMcpUrl || (envMcpPort ? normalizePortOrUrl(envMcpPort, "/mcp") : void 0) || fileConfig.mcpUrl || (fileConfig.mcpPort ? normalizePortOrUrl(fileConfig.mcpPort, "/mcp") : void 0) || DEFAULT_CONFIG.mcpUrl;
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
    proxyEnabled: envProxyEnabled !== void 0 ? envProxyEnabled === "1" || envProxyEnabled === "true" : fileConfig.proxyEnabled ?? DEFAULT_CONFIG.proxyEnabled
  };
}
function saveGlobalConfig(partial) {
  try {
    const dir = path.dirname(GLOBAL_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let existing = {};
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      existing = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
    }
    const updated = { ...existing, ...partial };
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error(`[pi-caido] Failed to save config to ${GLOBAL_CONFIG_PATH}:`, err);
  }
}
export {
  DEFAULT_CONFIG,
  extractPort,
  loadConfig,
  normalizePortOrUrl,
  saveGlobalConfig
};
//# sourceMappingURL=config.js.map