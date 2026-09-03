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
export {
  CaidoMcpClient
};
//# sourceMappingURL=mcp-client.js.map