import type {
  CaidoConfig,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  McpInitializeResult,
  McpListToolsResult,
  McpCallToolResult,
  McpToolSchema,
} from "./types.js";

export class CaidoMcpClient {
  private config: CaidoConfig;
  private messageId = 1;
  private serverInfo?: { name: string; version: string };
  private isConnected = false;
  private tools: McpToolSchema[] = [];

  constructor(config: CaidoConfig) {
    this.config = config;
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public get info(): { name: string; version: string } | undefined {
    return this.serverInfo;
  }

  public get availableTools(): McpToolSchema[] {
    return this.tools;
  }

  public updateConfig(newConfig: Partial<CaidoConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Execute JSON-RPC 2.0 request over Streamable HTTP (SSE or JSON).
   */
  private async postRequest<T>(request: JsonRpcRequest | JsonRpcNotification): Promise<T | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    try {
      const response = await fetch(this.config.mcpUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Caido MCP HTTP ${response.status} ${response.statusText}: ${errorText}`);
      }

      // Notifications do not expect a response payload
      if (!("id" in request)) {
        return undefined;
      }

      const contentType = response.headers.get("content-type") || "";

      // Handle JSON response
      if (contentType.includes("application/json")) {
        const json = (await response.json()) as JsonRpcResponse<T>;
        if (json.error) {
          throw new Error(`MCP Error [${json.error.code}]: ${json.error.message}`);
        }
        return json.result;
      }

      // Handle SSE / text stream
      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        const text = await response.text();
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr) {
              const parsed = JSON.parse(dataStr) as JsonRpcResponse<T>;
              if (parsed.error) {
                throw new Error(`MCP Error [${parsed.error.code}]: ${parsed.error.message}`);
              }
              return parsed.result;
            }
          }
        }

        // Try parsing entire text as JSON fallback
        try {
          const parsed = JSON.parse(text) as JsonRpcResponse<T>;
          if (parsed.error) {
            throw new Error(`MCP Error [${parsed.error.code}]: ${parsed.error.message}`);
          }
          return parsed.result;
        } catch {
          throw new Error(`Unexpected SSE response from Caido: ${text.slice(0, 200)}`);
        }
      }

      // Fallback
      const body = await response.text();
      return JSON.parse(body).result as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Connect to Caido MCP server and initialize session.
   */
  public async connect(): Promise<{ serverInfo: { name: string; version: string }; toolCount: number }> {
    try {
      const initReq: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: this.messageId++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "pi-caido",
            version: "1.0.0",
          },
        },
      };

      const initResult = await this.postRequest<McpInitializeResult>(initReq);
      if (!initResult) {
        throw new Error("Empty initialization response from Caido MCP");
      }

      this.serverInfo = initResult.serverInfo;

      // Send initialized notification
      const initNotif: JsonRpcNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };
      await this.postRequest(initNotif).catch((err) => {
        // Notification failure is non-fatal
        console.warn("[pi-caido] notifications/initialized warning:", err);
      });

      // Discover available tools
      const toolsResult = await this.listTools();
      this.tools = toolsResult.tools || [];
      this.isConnected = true;

      return {
        serverInfo: this.serverInfo,
        toolCount: this.tools.length,
      };
    } catch (err) {
      this.isConnected = false;
      throw err;
    }
  }

  /**
   * List tools from Caido MCP server.
   */
  public async listTools(cursor?: string): Promise<McpListToolsResult> {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.messageId++,
      method: "tools/list",
      params: cursor ? { cursor } : {},
    };

    const result = await this.postRequest<McpListToolsResult>(req);
    return result || { tools: [] };
  }

  /**
   * Call a tool on the Caido MCP server.
   */
  public async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallToolResult> {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.messageId++,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    };

    const result = await this.postRequest<McpCallToolResult>(req);
    return result || { content: [{ type: "text", text: "Tool call finished with empty result" }] };
  }

  /**
   * Disconnect client.
   */
  public disconnect(): void {
    this.isConnected = false;
    this.tools = [];
  }
}
