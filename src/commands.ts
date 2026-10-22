import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { CaidoMcpClient } from "./mcp-client.js";
import type { CaidoProxyManager } from "./proxy.js";
import { saveGlobalConfig, normalizePortOrUrl, extractPort } from "./config.js";

export function registerCaidoCommands(
  pi: ExtensionAPI,
  client: CaidoMcpClient,
  proxy: CaidoProxyManager,
  updateStatusBadge: (ctx?: { ui: { setStatus: (k: string, t: string | undefined) => void } }) => void
): void {
  pi.registerCommand("caido", {
    description: "Manage Caido web proxy attachment and MCP integration",
    async handler(args: string, ctx: ExtensionCommandContext) {
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
            "🛡️ **Caido Integration Status**",
            `- **MCP Server:** ${mcpConnected ? "🟢 Connected" : "🔴 Disconnected"}`,
            info ? `  - Name: \`${info.name}\` (v${info.version})` : "  - Server Info: None",
            `- **Discovered Tools:** ${tools.length} available`,
            `- **Web Proxy Interception:** ${proxyText}${proxyPort}`,
            `- **Configured Proxy URL:** \`${proxy.proxyUrl}\``,
            "",
            "Type `/caido help` for available subcommands.",
          ].join("\n");

          if (ctx.hasUI) {
            ctx.ui.notify(mcpConnected ? "Caido connected" : "Caido offline", mcpConnected ? "info" : "warning");
          }
          pi.sendMessage({
            customType: "caido_status",
            content: message,
            display: true,
          });
          return;
        }

        case "port": {
          const portArg = rest[0];
          if (!portArg) {
            const currentPort = proxy.port || "unknown";
            pi.sendMessage({
              customType: "caido_port",
              content: `ℹ️ **Current Caido Proxy Port:** \`${currentPort}\` (\`${proxy.proxyUrl}\`)\nUsage: \`/caido port <port>\` (e.g. \`/caido port 9080\`)`,
              display: true,
            });
            return;
          }

          const state = proxy.setPort(portArg);
          const resolvedPort = extractPort(state.url);
          saveGlobalConfig({ proxyUrl: state.url, proxyPort: resolvedPort, port: resolvedPort });
          updateStatusBadge(ctx);

          const msg = `🟢 **Caido Proxy Port Set to ${resolvedPort || portArg}**\n- Proxy URL: \`${state.url}\`\n- Interception State: ${state.enabled ? "🟢 Active (traffic routed through Caido)" : "⚪ Inactive (run `/caido proxy on` to intercept)"}`;
          if (ctx.hasUI) ctx.ui.notify(`Caido proxy port set to ${resolvedPort || portArg}`, "info");
          pi.sendMessage({
            customType: "caido_port",
            content: msg,
            display: true,
          });
          return;
        }

        case "mcp-port": {
          const portArg = rest[0];
          if (!portArg) {
            pi.sendMessage({
              customType: "caido_mcp_port",
              content: "Usage: `/caido mcp-port <port>` (e.g. `/caido mcp-port 3333`)",
              display: true,
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
              content: `✅ **Caido MCP Port Set to ${resolvedPort}**\n- Connected to \`${targetUrl}\`\n- Server: \`${result.serverInfo.name}\` (v${result.serverInfo.version})\n- Tools: **${result.toolCount}**`,
              display: true,
            });
          } catch (err: any) {
            updateStatusBadge(ctx);
            pi.sendMessage({
              customType: "caido_error",
              content: `⚠️ Port updated to ${resolvedPort} (\`${targetUrl}\`), but connection failed: ${err.message}`,
              display: true,
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

            const msg = `✅ **Connected to Caido MCP Server**\n- Server: \`${result.serverInfo.name}\` (v${result.serverInfo.version})\n- Tools Discovered: **${result.toolCount}**`;
            pi.sendMessage({
              customType: "caido_connect",
              content: msg,
              display: true,
            });
          } catch (err: any) {
            updateStatusBadge(ctx);
            const errMsg = `❌ **Failed to connect to Caido MCP**: ${err.message}\nEnsure Caido is running and MCP is enabled in Caido settings.`;
            if (ctx.hasUI) ctx.ui.notify(errMsg, "error");
            pi.sendMessage({
              customType: "caido_error",
              content: errMsg,
              display: true,
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
            content: "🔌 Disconnected from Caido MCP server.",
            display: true,
          });
          return;
        }

        case "proxy": {
          const action = rest[0]?.toLowerCase() || "status";
          const rawTarget = rest[1];

          if (action === "on") {
            const targetUrl = rawTarget ? normalizePortOrUrl(rawTarget) : undefined;
            const state = proxy.enable(targetUrl);
            const resolvedPort = extractPort(state.url);
            saveGlobalConfig({ proxyEnabled: true, proxyUrl: state.url, proxyPort: resolvedPort, port: resolvedPort });
            updateStatusBadge(ctx);
            const msg = `🟢 **Caido Web Proxy Enabled**\nTraffic routed via \`${state.url}\` (port ${resolvedPort || "default"}).\nNode TLS certificate verification bypassed for local inspection.`;
            if (ctx.hasUI) ctx.ui.notify(`Caido proxy enabled on port ${resolvedPort || "default"}`, "info");
            pi.sendMessage({
              customType: "caido_proxy",
              content: msg,
              display: true,
            });
          } else if (action === "off") {
            const state = proxy.disable();
            saveGlobalConfig({ proxyEnabled: false });
            updateStatusBadge(ctx);
            const msg = "⚪ **Caido Web Proxy Disabled**\nTraffic restored to direct network connection.";
            if (ctx.hasUI) ctx.ui.notify("Caido proxy disabled", "info");
            pi.sendMessage({
              customType: "caido_proxy",
              content: msg,
              display: true,
            });
          } else {
            const msg = `🛡️ **Caido Web Proxy Status:** ${proxy.getStatusText()}`;
            pi.sendMessage({
              customType: "caido_proxy_status",
              content: msg,
              display: true,
            });
          }
          return;
        }

        case "tools": {
          const tools = client.availableTools;
          if (tools.length === 0) {
            pi.sendMessage({
              customType: "caido_tools",
              content: "⚠️ No tools discovered yet. Make sure Caido MCP is connected (`/caido connect`).",
              display: true,
            });
            return;
          }

          const lines = [
            `🛠️ **Discovered Caido MCP Tools (${tools.length}):**`,
            "",
            ...tools.map((t) => `- **\`${t.name}\`**: ${t.description || "No description provided."}`),
          ];

          pi.sendMessage({
            customType: "caido_tools",
            content: lines.join("\n"),
            display: true,
          });
          return;
        }

        case "help":
        default: {
          const helpMessage = [
            "📖 **Caido Extension Commands**",
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
            "- `/caido help`: Show this help manual",
          ].join("\n");

          pi.sendMessage({
            customType: "caido_help",
            content: helpMessage,
            display: true,
          });
          return;
        }
      }
    },
  });
}
