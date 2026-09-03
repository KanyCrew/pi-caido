# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-03

### Added
- **Streamable HTTP MCP Client**: Native connection to Caido's Streamable HTTP endpoint (`http://127.0.0.1:3333/mcp`) supporting JSON-RPC 2.0, SSE, and full handshake.
- **Dynamic Tool Discovery**: Automatic discovery and relay of all 81 Caido MCP tools (requests, replay, sitemap, findings, tamper rules, automations, websockets).
- **Curated Security Tools**:
  - `caido_status`: Diagnostic check for proxy and MCP health.
  - `caido_list_requests`: HTTPQL history query with filtering and pagination.
  - `caido_get_request`: Request & response header/body inspector.
  - `caido_send_request`: Dispatch raw HTTP traffic via Caido.
  - `caido_create_finding`: Record vulnerability findings in Caido.
  - `caido_list_scopes`: Query configured scope definitions.
  - `caido_call_mcp`: Direct execution of any Caido MCP tool.
- **Web Proxy Controller**: Dynamic intercepting proxy routing (`http://127.0.0.1:8080`) with TLS bypass for auditing outgoing agent traffic.
- **Slash Commands**: Comprehensive `/caido` command with `status`, `connect`, `disconnect`, `proxy`, `tools`, and `help`.
- **TUI Integration**: Real-time status indicator in Pi's status bar footer.
- **GitHub Workflow**: Continuous Integration pipeline for type checking and automated builds.
