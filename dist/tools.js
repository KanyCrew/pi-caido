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
export {
  registerCaidoTools
};
//# sourceMappingURL=tools.js.map