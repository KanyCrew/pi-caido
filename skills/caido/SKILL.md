---
name: caido
description: Comprehensive guide for using the Caido web security proxy and Caido MCP tools in Pi. Activate this skill whenever investigating HTTP proxy history, inspecting requests and responses, searching traffic with HTTPQL, sending or replaying web requests, auditing APIs, or managing security findings and scopes.
---

# Caido MCP & Web Proxy Integration Guide for Pi Agent

This skill guides the AI assistant on how to effectively use the **Caido Web Security Proxy** and **Caido MCP Server** tools in Pi.

---

## 1. Core Architecture & Endpoints

- **Caido Web Proxy (`http://127.0.0.1:8080`)**: Intercepts HTTP/HTTPS traffic. When proxy routing is active, all agent outgoing requests can be audited in Caido.
- **Caido MCP Server (`http://127.0.0.1:3333/mcp`)**: Streamable HTTP endpoint providing access to Caido's internal database, request history, tamper rules, fuzzing sessions, replay engine, and findings.

---

## 2. Available Tools & Decision Guide

When interacting with Caido, choose the right tool for the task:

| Task | Recommended Tool | Example Usage |
|---|---|---|
| Check if Caido MCP & Proxy are running | `caido_status` | Call `caido_status()` before executing complex queries |
| Search intercepted requests | `caido_list_requests` | `filter: 'req.host.eq:"api.target.com" and resp.status.eq:200'` |
| View headers & body of a request | `caido_get_request` | `ids: ["123", "124"], includeBody: true` |
| Dispatch/replay a custom HTTP request | `caido_send_request` | `raw: "GET /api/user HTTP/1.1\r\nHost: target.com\r\n\r\n"` |
| Report a security issue/finding | `caido_create_finding` | `title: "IDOR on /user/profile", requestId: "123"` |
| Check allowed/blocked targets | `caido_list_scopes` | Call `caido_list_scopes()` to confirm target is in scope |
| Use any of the 81 native Caido tools | `caido_call_mcp` | `toolName: "get_sitemap_entries_by_ids", arguments: {...}` |

---

## 3. HTTPQL Cheat Sheet (Querying History)

Caido uses **HTTPQL** to filter HTTP traffic. When calling `caido_list_requests(filter: "...")`, use these filter clauses:

### Host & Path
- Host equals: `req.host.eq:"api.example.com"`
- Host contains: `req.host.contains:"example"`
- Path equals: `req.path.eq:"/v1/auth/login"`
- Path starts with: `req.path.starts_with:"/api"`
- Path contains: `req.path.contains:"graphql"`

### Method & Status Code
- HTTP Method: `req.method.eq:"POST"` or `req.method.eq:"GET"`
- Successful status: `resp.status.eq:200`
- Client error status: `resp.status.gte:400 and resp.status.lt:500`
- Server error status: `resp.status.gte:500`

### Headers & Query Parameters
- Query parameter exists: `req.query.name.eq:"debug"`
- Header value contains: `req.header.value.contains:"Bearer "`
- Content-Type: `resp.header.name.eq:"content-type" and resp.header.value.contains:"application/json"`

### Logical Operators
- Combine clauses using `and`, `or`, and `not`:
  ```httpql
  req.host.eq:"target.com" and req.method.eq:"POST" and resp.status.eq:200
  ```

---

## 4. Standard Agent Workflows

### Workflow A: Investigating an API Target
1. Run `caido_status` to verify that Caido MCP is online.
2. Run `caido_list_scopes` to inspect targets defined in the workspace.
3. Query recent endpoints with `caido_list_requests(filter: 'req.host.contains:"target"')`.
4. Inspect the exact authentication and payload with `caido_get_request(ids: ["<id>"], includeBody: true)`.

### Workflow B: Testing a Vulnerability & Logging a Finding
1. Retrieve the baseline request using `caido_get_request(ids: ["<id>"])`.
2. Craft the modified exploit payload and send it via `caido_send_request(raw: "...", host: "...")`.
3. If the vulnerability is confirmed (e.g. SQLi, IDOR, SSRF, Information Disclosure), document it immediately using:
   ```json
   {
     "title": "IDOR - Access to another user data",
     "description": "Sending request with ID 456 returns profile data of tenant B without authorization.",
     "requestId": "123"
   }
   ```
   This persists the finding into the user's Caido dashboard for reporting.

### Workflow C: Advanced Caido Features (`caido_call_mcp`)
If you need capabilities beyond standard request inspection, invoke `caido_call_mcp` with any of Caido's native tool names:
- **Tamper Rules**: `list_tamper_rule_collections`, `test_tamper_rule`, `toggle_tamper_rule`
- **Replay Sessions**: `query_replay_sessions`, `create_replay_session`, `start_replay_task`
- **Sitemap**: `list_sitemap_roots`, `list_sitemap_descendants`, `get_sitemap_entries_by_ids`
- **WebSockets / SSE**: `list_websocket_streams`, `list_websocket_messages`, `get_websocket_messages_by_ids`
- **Environments**: `list_environments`, `get_environment_variable`, `set_environment_variable`

---

## 5. Slash Commands in Pi TUI
The user can also manage the extension interactively:
- `/caido status`: Check MCP & proxy status
- `/caido proxy on [url]`: Route Pi traffic through Caido
- `/caido proxy off`: Disable proxy routing
- `/caido tools`: View all discovered tools
