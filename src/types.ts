/**
 * Type definitions for pi-caido extension.
 */

export interface CaidoConfig {
  /** Caido MCP Server Streamable HTTP endpoint (default: "http://127.0.0.1:3333/mcp") */
  mcpUrl: string;
  /** Caido upstream web proxy URL (default: "http://127.0.0.1:8080") */
  proxyUrl: string;
  /** Whether web proxy interception is enabled for Pi (default: false) */
  proxyEnabled: boolean;
  /** Optional API token for Caido */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 15000) */
  timeoutMs: number;
  /** Automatically register all discovered MCP tools (default: true) */
  autoRegisterTools: boolean;
  /** Prefix for registered MCP tools in Pi (default: "caido_") */
  toolPrefix: string;
  /** Allow insecure TLS certificates through proxy (default: true for pentesting) */
  allowInsecureTls: boolean;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface McpListToolsResult {
  tools: McpToolSchema[];
  nextCursor?: string;
}

export interface McpCallToolResult {
  content?: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface ProxyState {
  enabled: boolean;
  url: string;
  previousEnv: {
    HTTP_PROXY?: string;
    HTTPS_PROXY?: string;
    http_proxy?: string;
    https_proxy?: string;
    ALL_PROXY?: string;
    all_proxy?: string;
    NODE_TLS_REJECT_UNAUTHORIZED?: string;
  };
}
