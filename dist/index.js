// src/index.ts
import path2 from "path";
import { fileURLToPath } from "url";

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

// src/mcp-client.ts
var CaidoMcpClient = class {
  config;
  messageId = 1;
  serverInfo;
  isConnected = false;
  tools = [];
  constructor(config) {
    this.config = config;
  }
  get connected() {
    return this.isConnected;
  }
  get info() {
    return this.serverInfo;
  }
  get availableTools() {
    return this.tools;
  }
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
  /**
   * Execute JSON-RPC 2.0 request over Streamable HTTP (SSE or JSON).
   */
  async postRequest(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    try {
      const response = await fetch(this.config.mcpUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Caido MCP HTTP ${response.status} ${response.statusText}: ${errorText}`);
      }
      if (!("id" in request)) {
        return void 0;
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await response.json();
        if (json.error) {
          throw new Error(`MCP Error [${json.error.code}]: ${json.error.message}`);
        }
        return json.result;
      }
      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        const text = await response.text();
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr) {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                throw new Error(`MCP Error [${parsed.error.code}]: ${parsed.error.message}`);
              }
              return parsed.result;
            }
          }
        }
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) {
            throw new Error(`MCP Error [${parsed.error.code}]: ${parsed.error.message}`);
          }
          return parsed.result;
        } catch {
          throw new Error(`Unexpected SSE response from Caido: ${text.slice(0, 200)}`);
        }
      }
      const body = await response.text();
      return JSON.parse(body).result;
    } finally {
      clearTimeout(timeout);
    }
  }
  /**
   * Connect to Caido MCP server and initialize session.
   */
  async connect() {
    try {
      const initReq = {
        jsonrpc: "2.0",
        id: this.messageId++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "pi-caido",
            version: "1.0.0"
          }
        }
      };
      const initResult = await this.postRequest(initReq);
      if (!initResult) {
        throw new Error("Empty initialization response from Caido MCP");
      }
      this.serverInfo = initResult.serverInfo;
      const initNotif = {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      };
      await this.postRequest(initNotif).catch((err) => {
        console.warn("[pi-caido] notifications/initialized warning:", err);
      });
      const toolsResult = await this.listTools();
      this.tools = toolsResult.tools || [];
      this.isConnected = true;
      return {
        serverInfo: this.serverInfo,
        toolCount: this.tools.length
      };
    } catch (err) {
      this.isConnected = false;
      throw err;
    }
  }
  /**
   * List tools from Caido MCP server.
   */
  async listTools(cursor) {
    const req = {
      jsonrpc: "2.0",
      id: this.messageId++,
      method: "tools/list",
      params: cursor ? { cursor } : {}
    };
    const result = await this.postRequest(req);
    return result || { tools: [] };
  }
  /**
   * Call a tool on the Caido MCP server.
   */
  async callTool(name, args = {}) {
    const req = {
      jsonrpc: "2.0",
      id: this.messageId++,
      method: "tools/call",
      params: {
        name,
        arguments: args
      }
    };
    const result = await this.postRequest(req);
    return result || { content: [{ type: "text", text: "Tool call finished with empty result" }] };
  }
  /**
   * Disconnect client.
   */
  disconnect() {
    this.isConnected = false;
    this.tools = [];
  }
};

// src/proxy.ts
var CaidoProxyManager = class {
  state = {
    enabled: false,
    url: "http://127.0.0.1:8080",
    previousEnv: {}
  };
  constructor(config) {
    this.state.url = config.proxyUrl;
    if (config.proxyEnabled) {
      this.enable(config.proxyUrl, config.allowInsecureTls);
    }
  }
  get isEnabled() {
    return this.state.enabled;
  }
  get proxyUrl() {
    return this.state.url;
  }
  /**
   * Route outgoing requests from Pi and tools through Caido proxy.
   */
  enable(url, allowInsecureTls = true) {
    const targetUrl = url || this.state.url;
    this.state.url = targetUrl;
    if (!this.state.enabled) {
      this.state.previousEnv = {
        HTTP_PROXY: process.env.HTTP_PROXY,
        HTTPS_PROXY: process.env.HTTPS_PROXY,
        http_proxy: process.env.http_proxy,
        https_proxy: process.env.https_proxy,
        ALL_PROXY: process.env.ALL_PROXY,
        all_proxy: process.env.all_proxy,
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED
      };
    }
    process.env.HTTP_PROXY = targetUrl;
    process.env.HTTPS_PROXY = targetUrl;
    process.env.http_proxy = targetUrl;
    process.env.https_proxy = targetUrl;
    process.env.ALL_PROXY = targetUrl;
    process.env.all_proxy = targetUrl;
    if (allowInsecureTls) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    this.state.enabled = true;
    return this.state;
  }
  /**
   * Restore previous proxy settings.
   */
  disable() {
    if (!this.state.enabled) {
      return this.state;
    }
    const prev = this.state.previousEnv;
    const restoreOrDelete = (key, val) => {
      if (val !== void 0) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    };
    restoreOrDelete("HTTP_PROXY", prev.HTTP_PROXY);
    restoreOrDelete("HTTPS_PROXY", prev.HTTPS_PROXY);
    restoreOrDelete("http_proxy", prev.http_proxy);
    restoreOrDelete("https_proxy", prev.https_proxy);
    restoreOrDelete("ALL_PROXY", prev.ALL_PROXY);
    restoreOrDelete("all_proxy", prev.all_proxy);
    restoreOrDelete("NODE_TLS_REJECT_UNAUTHORIZED", prev.NODE_TLS_REJECT_UNAUTHORIZED);
    this.state.enabled = false;
    return this.state;
  }
  /**
   * Get formatted status report.
   */
  getStatusText() {
    if (!this.state.enabled) {
      return "Disabled (traffic routes directly)";
    }
    return `Enabled -> ${this.state.url} (TLS inspection active)`;
  }
};

// src/tools.ts
import { Type } from "typebox";
function textResult(text) {
  return {
    content: [{ type: "text", text }],
    details: {}
  };
}
function registerCaidoTools(pi, client, proxy) {
  pi.registerTool({
    name: "caido_status",
    label: "Caido Status",
    description: "Check the status of Caido web proxy, MCP server connection, and discovered tools.",
    promptSnippet: "Check Caido proxy and MCP connectivity.",
    promptGuidelines: [
      "Call caido_status first if you are unsure whether Caido web proxy or MCP is connected.",
      "If disconnected, suggest the user run `/caido connect` or verify Caido is running."
    ],
    parameters: Type.Object({}),
    execute: async () => {
      const isMcpConnected = client.connected;
      const mcpInfo = client.info;
      const toolCount = client.availableTools.length;
      const proxyStatus = proxy.getStatusText();
      const output = [
        "=== Caido Status ===",
        `MCP Server: ${isMcpConnected ? "\u{1F7E2} Connected" : "\u{1F534} Disconnected"}`,
        mcpInfo ? `Server: ${mcpInfo.name} (v${mcpInfo.version})` : "Server: Unknown",
        `Available MCP Tools: ${toolCount}`,
        `Web Proxy: ${proxyStatus}`
      ].join("\n");
      return textResult(output);
    }
  });
  pi.registerTool({
    name: "caido_list_requests",
    label: "Caido List Requests",
    description: 'Search and list HTTP requests recorded by Caido proxy. Supports HTTPQL filters (e.g., req.host.eq:"example.com", req.status.eq:200, req.method.eq:"POST").',
    promptSnippet: "Search and filter Caido proxy HTTP history with HTTPQL.",
    promptGuidelines: [
      "Use caido_list_requests to find captured traffic before executing external requests.",
      'Filter with HTTPQL syntax: req.host.eq:"domain", req.path.starts_with:"/api", req.status.eq:200, req.method.eq:"POST".',
      'Combine filters using boolean operators, e.g.: req.host.contains:"target" and resp.status.eq:200'
    ],
    parameters: Type.Object({
      filter: Type.Optional(Type.String({ description: 'HTTPQL filter query (e.g. req.host.eq:"api.target.com")' })),
      limit: Type.Optional(Type.Integer({ description: "Maximum number of requests to return (default: 20)", default: 20 }))
    }),
    execute: async (_id, params) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }
      try {
        const result = await client.callTool("list_requests", {
          filter: params.filter,
          limit: params.limit || 20
        });
        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "No requests found matching criteria.";
        return textResult(text);
      } catch (err) {
        return textResult(`Failed to list Caido requests: ${err.message}`);
      }
    }
  });
  pi.registerTool({
    name: "caido_get_request",
    label: "Caido Get Request",
    description: "Retrieve full HTTP request and response details (headers, body, URL, status) by request IDs.",
    promptSnippet: "Retrieve full HTTP headers and bodies for request IDs from Caido history.",
    promptGuidelines: [
      "Use caido_get_request after caido_list_requests to inspect full headers, parameters, and bodies.",
      "Pass array of request IDs: ids: ['1578']. Set include_body: true to view response bodies."
    ],
    parameters: Type.Object({
      ids: Type.Array(Type.String({ description: "Request IDs to inspect (e.g. ['1578'])" })),
      include_body: Type.Optional(Type.Boolean({ description: "Include request/response bodies (default: true)", default: true })),
      max_text_body_chars: Type.Optional(Type.Integer({ description: "Maximum text body characters to return (default: 4000)", default: 4e3 }))
    }),
    execute: async (_id, params) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }
      try {
        const result = await client.callTool("get_requests_by_ids", {
          ids: params.ids.map(String),
          serialization: {
            include_body: params.include_body ?? true,
            max_text_body_chars: params.max_text_body_chars ?? 4e3
          }
        });
        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "No details returned.";
        return textResult(text);
      } catch (err) {
        return textResult(`Failed to get Caido request details: ${err.message}`);
      }
    }
  });
  pi.registerTool({
    name: "caido_send_requests",
    label: "Caido Send Requests",
    description: "Replay and send saved HTTP requests by ID through Caido.",
    promptSnippet: "Replay saved HTTP requests by ID through Caido.",
    promptGuidelines: [
      "Pass request IDs to replay: ids: ['1578'].",
      "Set save: true to store the new replayed request/response in Caido history."
    ],
    parameters: Type.Object({
      ids: Type.Array(Type.String({ description: "Saved request IDs to send/replay (e.g. ['1578'])" })),
      save: Type.Optional(Type.Boolean({ description: "Whether to save the replayed request into Caido history (default: true)", default: true })),
      include_body: Type.Optional(Type.Boolean({ description: "Include response body in result (default: true)", default: true }))
    }),
    execute: async (_id, params) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }
      try {
        const result = await client.callTool("send_requests", {
          ids: params.ids.map(String),
          options: { save: params.save ?? true },
          serialization: { include_body: params.include_body ?? true }
        });
        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "Request dispatched.";
        return textResult(text);
      } catch (err) {
        return textResult(`Failed to send request via Caido: ${err.message}`);
      }
    }
  });
  pi.registerTool({
    name: "caido_create_finding",
    label: "Caido Create Finding",
    description: "Record a newly discovered security vulnerability or finding into Caido.",
    promptSnippet: "Log security vulnerabilities and findings directly into Caido dashboard.",
    promptGuidelines: [
      "Call caido_create_finding whenever you identify an actionable security issue (IDOR, SQLi, info leak, etc.).",
      "Include clear reproduction steps and impact in the description.",
      "Associate the request_id (string ID of the saved request) and reporter."
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Title of the vulnerability or observation" }),
      description: Type.String({ description: "Detailed description, impact, and reproduction steps" }),
      request_id: Type.String({ description: "Associated Caido saved request ID (e.g. '1578')" }),
      reporter: Type.Optional(Type.String({ description: "Reporter identifier (default: 'Pi Coding Agent')", default: "Pi Coding Agent" })),
      dedupe_key: Type.Optional(Type.String({ description: "Optional deduplication key" }))
    }),
    execute: async (_id, params) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }
      try {
        const targetRequestId = String(params.request_id || params.requestId);
        const item = {
          title: params.title,
          description: params.description || "",
          reporter: params.reporter || "Pi Coding Agent",
          request_id: targetRequestId
        };
        if (params.dedupe_key) {
          item.dedupe_key = params.dedupe_key;
        }
        const result = await client.callTool("create_finding", {
          items: [item]
        });
        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "Finding successfully created.";
        return textResult(text);
      } catch (err) {
        return textResult(`Failed to create finding in Caido: ${err.message}`);
      }
    }
  });
  pi.registerTool({
    name: "caido_list_scopes",
    label: "Caido List Scopes",
    description: "List target scope definitions configured in Caido (allowlist and denylist patterns).",
    promptSnippet: "View in-scope and out-of-scope target rules configured in Caido.",
    promptGuidelines: [
      "Always check caido_list_scopes before active testing to ensure target domains are authorized."
    ],
    parameters: Type.Object({}),
    execute: async () => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }
      try {
        const result = await client.callTool("list_scopes", {});
        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "No scopes found.";
        return textResult(text);
      } catch (err) {
        return textResult(`Failed to list scopes in Caido: ${err.message}`);
      }
    }
  });
  pi.registerTool({
    name: "caido_call_mcp",
    label: "Caido Call MCP Tool",
    description: "Execute any of the 81 native Caido MCP tools by name (e.g. list_tamper_rules, get_sitemap_entries_by_ids, query_replay_sessions, list_websocket_streams, get_httpql_help).",
    promptSnippet: "Call any of Caido's 81 advanced native MCP tools directly.",
    promptGuidelines: [
      "Use caido_call_mcp for advanced Caido operations not covered by curated tools.",
      "Useful tools: list_tamper_rules, test_tamper_rule, list_sitemap_roots, get_sitemap_entries_by_ids, list_websocket_streams, get_httpql_help.",
      "Note: query_replay_sessions has a known Caido server-side GraphQL bug; use list_replay_collections_detailed instead."
    ],
    parameters: Type.Object({
      toolName: Type.String({ description: "Exact Caido MCP tool name" }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Arguments object for the tool" }))
    }),
    execute: async (_id, params) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }
      try {
        const result = await client.callTool(params.toolName, params.arguments || {});
        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "Executed successfully with empty output.";
        return textResult(text);
      } catch (err) {
        return textResult(`Failed executing Caido tool '${params.toolName}': ${err.message}`);
      }
    }
  });
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
          const message = [
            "\u{1F6E1}\uFE0F **Caido Integration Status**",
            `- **MCP Server:** ${mcpConnected ? "\u{1F7E2} Connected" : "\u{1F534} Disconnected"}`,
            info ? `  - Name: \`${info.name}\` (v${info.version})` : "  - Server Info: None",
            `- **Discovered Tools:** ${tools.length} available`,
            `- **Web Proxy Interception:** ${proxyText}`,
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
          const proxyUrl = rest[1];
          if (action === "on") {
            const state = proxy.enable(proxyUrl);
            saveGlobalConfig({ proxyEnabled: true, proxyUrl: state.url });
            updateStatusBadge(ctx);
            const msg = `\u{1F7E2} **Caido Web Proxy Enabled**
Traffic routed via \`${state.url}\`.
Node TLS certificate verification bypassed for local inspection.`;
            if (ctx.hasUI) ctx.ui.notify("Caido proxy enabled", "info");
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
            "- `/caido status`: Check MCP and Web Proxy connectivity",
            "- `/caido connect [url]`: Connect to Caido MCP Streamable HTTP endpoint (default: `http://127.0.0.1:3333/mcp`)",
            "- `/caido disconnect`: Disconnect from Caido MCP server",
            "- `/caido proxy on [url]`: Route Pi web traffic through Caido proxy (default: `http://127.0.0.1:8080`)",
            "- `/caido proxy off`: Restore direct network routing",
            "- `/caido proxy status`: Check active proxy routing state",
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

// src/index.ts
var STATUS_KEY = "caido";
var __dirname2 = path2.dirname(fileURLToPath(import.meta.url));
async function index_default(pi) {
  const config = loadConfig();
  const client = new CaidoMcpClient(config);
  const proxy = new CaidoProxyManager(config);
  const updateStatusBadge = (ctx) => {
    if (!ctx?.ui) return;
    if (client.connected) {
      const toolCount = client.availableTools.length;
      const proxyIndicator = proxy.isEnabled ? " \u21C4 Proxy" : "";
      ctx.ui.setStatus(STATUS_KEY, `Caido: \u{1F7E2} ${toolCount} tools${proxyIndicator}`);
    } else {
      const proxyIndicator = proxy.isEnabled ? " \u21C4 Proxy" : "";
      ctx.ui.setStatus(STATUS_KEY, `Caido: \u26AA Offline${proxyIndicator}`);
    }
  };
  pi.on("resources_discover", async () => {
    const skillsDir = path2.resolve(__dirname2, "../skills");
    return {
      skillPaths: [skillsDir]
    };
  });
  registerCaidoTools(pi, client, proxy);
  registerCaidoCommands(pi, client, proxy, updateStatusBadge);
  try {
    await client.connect();
  } catch {
  }
  pi.on("session_start", async (_event, ctx) => {
    if (!client.connected) {
      try {
        await client.connect();
      } catch {
      }
    }
    updateStatusBadge(ctx);
  });
  pi.on("session_shutdown", async () => {
    proxy.disable();
    client.disconnect();
  });
}
export {
  index_default as default
};
//# sourceMappingURL=index.js.map