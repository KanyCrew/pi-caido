import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import { CaidoMcpClient } from "./mcp-client.js";
import { CaidoProxyManager } from "./proxy.js";
import { registerCaidoTools } from "./tools.js";
import { registerCaidoCommands } from "./commands.js";

const STATUS_KEY = "caido";

/**
 * Pi Extension entry point for Caido integration.
 */
export default async function (pi: ExtensionAPI): Promise<void> {
  const config = loadConfig();
  const client = new CaidoMcpClient(config);
  const proxy = new CaidoProxyManager(config);

  /**
   * Update TUI footer status indicator.
   */
  const updateStatusBadge = (ctx?: { ui?: { setStatus: (k: string, t: string | undefined) => void } }) => {
    if (!ctx?.ui) return;
    if (client.connected) {
      const toolCount = client.availableTools.length;
      const proxyIndicator = proxy.isEnabled ? " ⇄ Proxy" : "";
      ctx.ui.setStatus(STATUS_KEY, `Caido: 🟢 ${toolCount} tools${proxyIndicator}`);
    } else {
      const proxyIndicator = proxy.isEnabled ? " ⇄ Proxy" : "";
      ctx.ui.setStatus(STATUS_KEY, `Caido: ⚪ Offline${proxyIndicator}`);
    }
  };

  // Register tools into Pi
  registerCaidoTools(pi, client, proxy);

  // Register /caido slash commands
  registerCaidoCommands(pi, client, proxy, updateStatusBadge);

  // Attempt initial background connection to Caido MCP
  try {
    await client.connect();
  } catch {
    // Non-fatal if Caido is not yet started at launch
  }

  // Hook into session start to refresh status and re-apply proxy if configured
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    if (!client.connected) {
      try {
        await client.connect();
      } catch {
        // Silently ignore startup connection error; user can /caido connect later
      }
    }
    updateStatusBadge(ctx);
  });

  // Cleanly restore network environment on shutdown
  pi.on("session_shutdown", async () => {
    proxy.disable();
    client.disconnect();
  });
}
