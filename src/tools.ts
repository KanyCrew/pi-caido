import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CaidoMcpClient } from "./mcp-client.js";
import type { CaidoProxyManager } from "./proxy.js";

/**
 * Helper to construct a standard text result for Pi.
 */
function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: {},
  };
}

/**
 * Register built-in Caido security tools into Pi with rich prompt guidelines for the agent.
 */
export function registerCaidoTools(
  pi: ExtensionAPI,
  client: CaidoMcpClient,
  proxy: CaidoProxyManager
): void {
  // 1. Status & Health Tool
  pi.registerTool({
    name: "caido_status",
    label: "Caido Status",
    description: "Check the status of Caido web proxy, MCP server connection, and discovered tools.",
    promptSnippet: "Check Caido proxy and MCP connectivity.",
    promptGuidelines: [
      "Call caido_status first if you are unsure whether Caido web proxy or MCP is connected.",
      "If disconnected, suggest the user run `/caido connect` or verify Caido is running.",
    ],
    parameters: Type.Object({}),
    execute: async () => {
      const isMcpConnected = client.connected;
      const mcpInfo = client.info;
      const toolCount = client.availableTools.length;
      const proxyStatus = proxy.getStatusText();

      const output = [
        "=== Caido Status ===",
        `MCP Server: ${isMcpConnected ? "🟢 Connected" : "🔴 Disconnected"}`,
        mcpInfo ? `Server: ${mcpInfo.name} (v${mcpInfo.version})` : "Server: Unknown",
        `Available MCP Tools: ${toolCount}`,
        `Web Proxy: ${proxyStatus}`,
      ].join("\n");

      return textResult(output);
    },
  });

  // 2. Search HTTP History via HTTPQL
  pi.registerTool({
    name: "caido_list_requests",
    label: "Caido List Requests",
    description:
      'Search and list HTTP requests recorded by Caido proxy. Supports HTTPQL filters (e.g., req.host.eq:"example.com", req.status.eq:200, req.method.eq:"POST").',
    promptSnippet: "Search and filter Caido proxy HTTP history with HTTPQL.",
    promptGuidelines: [
      "Use caido_list_requests to find captured traffic before executing external requests.",
      'Filter with HTTPQL syntax: req.host.eq:"domain", req.path.starts_with:"/api", req.status.eq:200, req.method.eq:"POST".',
      'Combine filters using boolean operators, e.g.: req.host.contains:"target" and resp.status.eq:200',
    ],
    parameters: Type.Object({
      filter: Type.Optional(Type.String({ description: 'HTTPQL filter query (e.g. req.host.eq:"api.target.com")' })),
      limit: Type.Optional(Type.Integer({ description: "Maximum number of requests to return (default: 20)", default: 20 })),
    }),
    execute: async (_id, params: { filter?: string; limit?: number }) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }

      try {
        const result = await client.callTool("list_requests", {
          filter: params.filter,
          limit: params.limit || 20,
        });

        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "No requests found matching criteria.";
        return textResult(text);
      } catch (err: any) {
        return textResult(`Failed to list Caido requests: ${err.message}`);
      }
    },
  });

  // 3. Get Details of Specific Requests
  pi.registerTool({
    name: "caido_get_request",
    label: "Caido Get Request",
    description: "Retrieve full HTTP request and response details (headers, body, URL, status) by request IDs.",
    promptSnippet: "Retrieve full HTTP headers and bodies for request IDs from Caido history.",
    promptGuidelines: [
      "Use caido_get_request after caido_list_requests to inspect full headers, parameters, and bodies.",
      "Set includeBody: true to view response bodies (JSON, HTML, etc.).",
    ],
    parameters: Type.Object({
      ids: Type.Array(Type.String({ description: "Request IDs to inspect" })),
      includeBody: Type.Optional(Type.Boolean({ description: "Include request/response bodies", default: true })),
    }),
    execute: async (_id, params: { ids: string[]; includeBody?: boolean }) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }

      try {
        const result = await client.callTool("get_requests_by_ids", {
          ids: params.ids,
          include: params.includeBody
            ? ["requestHeaders", "requestBody", "responseHeaders", "responseBody"]
            : ["requestHeaders", "responseHeaders"],
        });

        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "No details returned.";
        return textResult(text);
      } catch (err: any) {
        return textResult(`Failed to get Caido request details: ${err.message}`);
      }
    },
  });

  // 4. Send or Replay HTTP Request
  pi.registerTool({
    name: "caido_send_request",
    label: "Caido Send Request",
    description: "Send a raw HTTP request through Caido proxy or trigger a Replay task.",
    promptSnippet: "Dispatch or replay custom raw HTTP requests through Caido.",
    promptGuidelines: [
      "Provide complete raw HTTP format: `METHOD /path HTTP/1.1\\r\\nHost: example.com\\r\\n\\r\\nBody`.",
      "Set tls: true for HTTPS endpoints, tls: false for HTTP endpoints.",
      "All requests sent with this tool will be logged in Caido's Replay / History for auditing.",
    ],
    parameters: Type.Object({
      raw: Type.String({ description: "Full raw HTTP request string including headers and body" }),
      host: Type.Optional(Type.String({ description: "Target host (overrides Host header if needed)" })),
      port: Type.Optional(Type.Integer({ description: "Target port (default 443 for HTTPS, 80 for HTTP)" })),
      tls: Type.Optional(Type.Boolean({ description: "Whether to use TLS/HTTPS (default: true)", default: true })),
    }),
    execute: async (_id, params: { raw: string; host?: string; port?: number; tls?: boolean }) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }

      try {
        const result = await client.callTool("send_requests", {
          raw: params.raw,
          host: params.host,
          port: params.port,
          tls: params.tls ?? true,
        });

        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "Request dispatched.";
        return textResult(text);
      } catch (err: any) {
        return textResult(`Failed to send request via Caido: ${err.message}`);
      }
    },
  });

  // 5. Create Security Finding in Caido
  pi.registerTool({
    name: "caido_create_finding",
    label: "Caido Create Finding",
    description: "Record a newly discovered security vulnerability or finding into Caido.",
    promptSnippet: "Log security vulnerabilities and findings directly into Caido dashboard.",
    promptGuidelines: [
      "Call caido_create_finding whenever you identify an actionable security issue (IDOR, SQLi, info leak, etc.).",
      "Include clear reproduction steps and impact in the description.",
      "Associate the requestId to link the finding with the concrete HTTP request evidence in Caido.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Title of the vulnerability or observation" }),
      description: Type.String({ description: "Detailed description, impact, and reproduction steps" }),
      requestId: Type.Optional(Type.String({ description: "Associated Caido request ID" })),
    }),
    execute: async (_id, params: { title: string; description: string; requestId?: string }) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }

      try {
        const result = await client.callTool("create_finding", {
          items: [
            {
              title: params.title,
              description: params.description,
              requestId: params.requestId,
              reporter: "Pi Coding Agent",
            },
          ],
        });

        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "Finding successfully created.";
        return textResult(text);
      } catch (err: any) {
        return textResult(`Failed to create finding in Caido: ${err.message}`);
      }
    },
  });

  // 6. List Security Scopes
  pi.registerTool({
    name: "caido_list_scopes",
    label: "Caido List Scopes",
    description: "List target scope definitions configured in Caido (allowlist and denylist patterns).",
    promptSnippet: "View in-scope and out-of-scope target rules configured in Caido.",
    promptGuidelines: [
      "Always check caido_list_scopes before active testing to ensure target domains are authorized.",
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
      } catch (err: any) {
        return textResult(`Failed to list scopes in Caido: ${err.message}`);
      }
    },
  });

  // 7. Generic Raw Caido MCP Tool Invoker (Access to all 81 Caido MCP tools)
  pi.registerTool({
    name: "caido_call_mcp",
    label: "Caido Call MCP Tool",
    description:
      "Execute any of the 81 native Caido MCP tools by name (e.g. list_tamper_rules, get_sitemap_entries_by_ids, query_replay_sessions, list_websocket_streams, get_httpql_help).",
    promptSnippet: "Call any of Caido's 81 advanced native MCP tools directly.",
    promptGuidelines: [
      "Use caido_call_mcp for advanced Caido operations not covered by curated tools.",
      "Useful tools: list_tamper_rules, test_tamper_rule, list_sitemap_roots, get_sitemap_entries_by_ids, query_replay_sessions, list_websocket_streams, get_httpql_help.",
    ],
    parameters: Type.Object({
      toolName: Type.String({ description: "Exact Caido MCP tool name" }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Arguments object for the tool" })),
    }),
    execute: async (_id, params: { toolName: string; arguments?: Record<string, any> }) => {
      if (!client.connected) {
        return textResult("Error: Not connected to Caido MCP server. Run /caido connect first.");
      }

      try {
        const result = await client.callTool(params.toolName, params.arguments || {});
        const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "Executed successfully with empty output.";
        return textResult(text);
      } catch (err: any) {
        return textResult(`Failed executing Caido tool '${params.toolName}': ${err.message}`);
      }
    },
  });
}
