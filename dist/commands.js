// src/config.ts
import fs from "fs";
import path from "path";
import os from "os";
var GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "caido.json");
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

// src/commands.ts
function registerCaidoCommands(pi, client, proxy, updateStatusBadge) {
  pi.registerCommand("caido", {
    description: "Manage Caido web proxy attachment and MCP integration",
    async handler(args, ctx) {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0]?.toLowerCase() || "status";
      const rest = parts.slice(1);
      switch (subcommand) {
        case "status": {
          const mcpConnected = client.connected;
          const info = client.info;
          const tools = client.availableTools;
          const proxyText = proxy.getStatusText();
          const proxyPort = proxy.port ? ` (Port ${proxy.port})` : "";
          const message = [
            "\u{1F6E1}\uFE0F **Caido Integration Status**",
            `- **MCP Server:** ${mcpConnected ? "\u{1F7E2} Connected" : "\u{1F534} Disconnected"}`,
            info ? `  - Name: \`${info.name}\` (v${info.version})` : "  - Server Info: None",
            `- **Discovered Tools:** ${tools.length} available`,
            `- **Web Proxy Interception:** ${proxyText}${proxyPort}`,
            `- **Configured Proxy URL:** \`${proxy.proxyUrl}\``,
            "",
            "Type `/caido help` for available subcommands."
          ].join("\n");
          if (ctx.hasUI) {
            ctx.ui.notify(mcpConnected ? "Caido connected" : "Caido offline", mcpConnected ? "info" : "warning");
          }
          pi.sendMessage({
            customType: "caido_status",
            content: message,
            display: true
          });
          return;
        }
        case "port": {
          const portArg = rest[0];
          if (!portArg) {
            const currentPort = proxy.port || "unknown";
            pi.sendMessage({
              customType: "caido_port",
              content: `\u2139\uFE0F **Current Caido Proxy Port:** \`${currentPort}\` (\`${proxy.proxyUrl}\`)
Usage: \`/caido port <port>\` (e.g. \`/caido port 9080\`)`,
              display: true
            });
            return;
          }
          const state = proxy.setPort(portArg);
          const resolvedPort = extractPort(state.url);
          saveGlobalConfig({ proxyUrl: state.url, proxyPort: resolvedPort, port: resolvedPort });
          updateStatusBadge(ctx);
          const msg = `\u{1F7E2} **Caido Proxy Port Set to ${resolvedPort || portArg}**
- Proxy URL: \`${state.url}\`
- Interception State: ${state.enabled ? "\u{1F7E2} Active (traffic routed through Caido)" : "\u26AA Inactive (run `/caido proxy on` to intercept)"}`;
          if (ctx.hasUI) ctx.ui.notify(`Caido proxy port set to ${resolvedPort || portArg}`, "info");
          pi.sendMessage({
            customType: "caido_port",
            content: msg,
            display: true
          });
          return;
        }
        case "mcp-port": {
          const portArg = rest[0];
          if (!portArg) {
            pi.sendMessage({
              customType: "caido_mcp_port",
              content: "Usage: `/caido mcp-port <port>` (e.g. `/caido mcp-port 3333`)",
              display: true
            });
            return;
          }
          const targetUrl = normalizePortOrUrl(portArg, "/mcp");
          const resolvedPort = extractPort(targetUrl);
          client.updateConfig({ mcpUrl: targetUrl });
          saveGlobalConfig({ mcpUrl: targetUrl, mcpPort: resolvedPort });
          if (ctx.hasUI) ctx.ui.notify(`Reconnecting to Caido MCP on port ${resolvedPort}...`, "info");
          try {
            const result = await client.connect();
            updateStatusBadge(ctx);
            pi.sendMessage({
              customType: "caido_mcp_port",
              content: `\u2705 **Caido MCP Port Set to ${resolvedPort}**
- Connected to \`${targetUrl}\`
- Server: \`${result.serverInfo.name}\` (v${result.serverInfo.version})
- Tools: **${result.toolCount}**`,
              display: true
            });
          } catch (err) {
            updateStatusBadge(ctx);
            pi.sendMessage({
              customType: "caido_error",
              content: `\u26A0\uFE0F Port updated to ${resolvedPort} (\`${targetUrl}\`), but connection failed: ${err.message}`,
              display: true
            });
          }
          return;
        }
        case "connect": {
          const rawTarget = rest[0];
          if (rawTarget) {
            const customUrl = normalizePortOrUrl(rawTarget, "/mcp");
            const resolvedPort = extractPort(customUrl);
            client.updateConfig({ mcpUrl: customUrl });
            saveGlobalConfig({ mcpUrl: customUrl, mcpPort: resolvedPort });
          }
          try {
            if (ctx.hasUI) ctx.ui.notify("Connecting to Caido MCP server...", "info");
            const result = await client.connect();
            updateStatusBadge(ctx);
            const msg = `\u2705 **Connected to Caido MCP Server**
- Server: \`${result.serverInfo.name}\` (v${result.serverInfo.version})
- Tools Discovered: **${result.toolCount}**`;
            pi.sendMessage({
              customType: "caido_connect",
              content: msg,
              display: true
            });
          } catch (err) {
            updateStatusBadge(ctx);
            const errMsg = `\u274C **Failed to connect to Caido MCP**: ${err.message}
Ensure Caido is running and MCP is enabled in Caido settings.`;
            if (ctx.hasUI) ctx.ui.notify(errMsg, "error");
            pi.sendMessage({
              customType: "caido_error",
              content: errMsg,
              display: true
            });
          }
          return;
        }
        case "disconnect": {
          client.disconnect();
          updateStatusBadge(ctx);
          if (ctx.hasUI) ctx.ui.notify("Disconnected from Caido MCP", "info");
          pi.sendMessage({
            customType: "caido_disconnect",
            content: "\u{1F50C} Disconnected from Caido MCP server.",
            display: true
          });
          return;
        }
        case "proxy": {
          const action = rest[0]?.toLowerCase() || "status";
          const rawTarget = rest[1];
          if (action === "on") {
            const targetUrl = rawTarget ? normalizePortOrUrl(rawTarget) : void 0;
            const state = proxy.enable(targetUrl);
            const resolvedPort = extractPort(state.url);
            saveGlobalConfig({ proxyEnabled: true, proxyUrl: state.url, proxyPort: resolvedPort, port: resolvedPort });
            updateStatusBadge(ctx);
            const msg = `\u{1F7E2} **Caido Web Proxy Enabled**
Traffic routed via \`${state.url}\` (port ${resolvedPort || "default"}).
Node TLS certificate verification bypassed for local inspection.`;
            if (ctx.hasUI) ctx.ui.notify(`Caido proxy enabled on port ${resolvedPort || "default"}`, "info");
            pi.sendMessage({
              customType: "caido_proxy",
              content: msg,
              display: true
            });
          } else if (action === "off") {
            const state = proxy.disable();
            saveGlobalConfig({ proxyEnabled: false });
            updateStatusBadge(ctx);
            const msg = "\u26AA **Caido Web Proxy Disabled**\nTraffic restored to direct network connection.";
            if (ctx.hasUI) ctx.ui.notify("Caido proxy disabled", "info");
            pi.sendMessage({
              customType: "caido_proxy",
              content: msg,
              display: true
            });
          } else {
            const msg = `\u{1F6E1}\uFE0F **Caido Web Proxy Status:** ${proxy.getStatusText()}`;
            pi.sendMessage({
              customType: "caido_proxy_status",
              content: msg,
              display: true
            });
          }
          return;
        }
        case "tools": {
          const tools = client.availableTools;
          if (tools.length === 0) {
            pi.sendMessage({
              customType: "caido_tools",
              content: "\u26A0\uFE0F No tools discovered yet. Make sure Caido MCP is connected (`/caido connect`).",
              display: true
            });
            return;
          }
          const lines = [
            `\u{1F6E0}\uFE0F **Discovered Caido MCP Tools (${tools.length}):**`,
            "",
            ...tools.map((t) => `- **\`${t.name}\`**: ${t.description || "No description provided."}`)
          ];
          pi.sendMessage({
            customType: "caido_tools",
            content: lines.join("\n"),
            display: true
          });
          return;
        }
        case "help":
        default: {
          const helpMessage = [
            "\u{1F4D6} **Caido Extension Commands**",
            "",
            "- `/caido status`: Check MCP and Web Proxy connectivity and ports",
            "- `/caido port <port>`: Set Caido upstream proxy port (e.g. `/caido port 9080`)",
            "- `/caido mcp-port <port>`: Set Caido MCP server port (e.g. `/caido mcp-port 3333`)",
            "- `/caido connect [port|url]`: Connect to Caido MCP endpoint (e.g. `/caido connect 3333` or `http://127.0.0.1:3333/mcp`)",
            "- `/caido disconnect`: Disconnect from Caido MCP server",
            "- `/caido proxy on [port|url]`: Route Pi web traffic through Caido (e.g. `/caido proxy on 9080` or `/caido proxy on http://127.0.0.1:9080`)",
            "- `/caido proxy off`: Restore direct network routing",
            "- `/caido proxy status`: Check active proxy routing state and port",
            "- `/caido tools`: List all 80+ tools discovered from Caido",
            "- `/caido help`: Show this help manual"
          ].join("\n");
          pi.sendMessage({
            customType: "caido_help",
            content: helpMessage,
            display: true
          });
          return;
        }
      }
    }
  });
}
export {
  registerCaidoCommands
};
//# sourceMappingURL=commands.js.map