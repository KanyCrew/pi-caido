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
  const envProxyUrl = process.env.CAIDO_PROXY_URL;
  const envApiKey = process.env.CAIDO_API_KEY;
  const envProxyEnabled = process.env.CAIDO_PROXY_ENABLED;
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    mcpUrl: envMcpUrl || fileConfig.mcpUrl || DEFAULT_CONFIG.mcpUrl,
    proxyUrl: envProxyUrl || fileConfig.proxyUrl || DEFAULT_CONFIG.proxyUrl,
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
  loadConfig,
  saveGlobalConfig
};
//# sourceMappingURL=config.js.map