import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { CaidoMcpClient } from "./mcp-client.js";
import type { CaidoProxyManager } from "./proxy.js";
import { saveGlobalConfig } from "./config.js";

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

          const message = [
            "🛡️ **Caido Integration Status**",
            `- **MCP Server:** ${mcpConnected ? "🟢 Connected" : "🔴 Disconnected"}`,
            info ? `  - Name: \`${info.name}\` (v${info.version})` : "  - Server Info: None",
            `- **Discovered Tools:** ${tools.length} available`,
            `- **Web Proxy Interception:** ${proxyText}`,
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

        case "connect": {
          const customUrl = rest[0];
          if (customUrl) {
            client.updateConfig({ mcpUrl: customUrl });
            saveGlobalConfig({ mcpUrl: customUrl });
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
          const proxyUrl = rest[1];

          if (action === "on") {
            const state = proxy.enable(proxyUrl);
            saveGlobalConfig({ proxyEnabled: true, proxyUrl: state.url });
            updateStatusBadge(ctx);
            const msg = `🟢 **Caido Web Proxy Enabled**\nTraffic routed via \`${state.url}\`.\nNode TLS certificate verification bypassed for local inspection.`;
            if (ctx.hasUI) ctx.ui.notify("Caido proxy enabled", "info");
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
            "- `/caido status`: Check MCP and Web Proxy connectivity",
            "- `/caido connect [url]`: Connect to Caido MCP Streamable HTTP endpoint (default: `http://127.0.0.1:3333/mcp`)",
            "- `/caido disconnect`: Disconnect from Caido MCP server",
            "- `/caido proxy on [url]`: Route Pi web traffic through Caido proxy (default: `http://127.0.0.1:8080`)",
            "- `/caido proxy off`: Restore direct network routing",
            "- `/caido proxy status`: Check active proxy routing state",
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
