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

## 2. Available Tools & Exact Parameter Guide

When interacting with Caido, use these verified tools:

| Tool | Purpose | Schema / Arguments |
|---|---|---|
| `caido_status` | Check MCP & Proxy health | `{}` |
| `caido_list_requests` | Search HTTP history via HTTPQL | `{ filter: 'req.host.eq:"example.com"', limit: 20 }` |
| `caido_get_request` | View full headers & body of requests | `{ ids: ["1578"], include_body: true }` |
| `caido_send_requests` | Replay saved requests by ID | `{ ids: ["1578"], save: true }` |
| `caido_create_finding` | Record vulnerability in Caido dashboard | `{ title: "...", description: "...", request_id: "1578", reporter: "Pi" }` |
| `caido_list_scopes` | View allowed/denied target patterns | `{}` |
| `caido_call_mcp` | Execute any of the 81 native tools | `{ toolName: "...", arguments: {...} }` |

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
4. Inspect the exact authentication and payload with `caido_get_request(ids: ["1578"], include_body: true)`.

### Workflow B: Replaying Requests & Logging Findings
1. Retrieve request ID from history or baseline with `caido_list_requests`.
2. Replay the request through Caido using `caido_send_requests(ids: ["1578"], save: true)`.
3. If a vulnerability is confirmed, document it immediately using:
   ```json
   {
     "title": "IDOR on /user/profile",
     "description": "Sending request with ID 1578 returns unauthorized data.",
     "request_id": "1578",
     "reporter": "Pi Coding Agent"
   }
   ```
   This persists the finding into the user's Caido dashboard.

---

## 5. Known Server-Side Quirks & Workarounds

- **`query_replay_sessions`**: Caido's native backend has an upstream GraphQL schema bug (`Unknown field "collection" on type "ReplaySession"`).  
  **Workaround**: Use `caido_call_mcp(toolName: "list_replay_collections_detailed", arguments: { first: 10 })` or `get_replay_session` / `create_replay_session` instead.
- **Replaying raw HTTP**: For raw HTTP tampering without pre-existing request IDs, use `caido_call_mcp(toolName: "start_replay_task", arguments: { items: [{ session_id: "...", raw_base64: "...", connection: { host: "...", port: 443, is_tls: true } }] })`.
