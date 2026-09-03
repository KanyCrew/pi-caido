import { CaidoConfig, McpToolSchema, McpListToolsResult, McpCallToolResult } from './types.js';

declare class CaidoMcpClient {
    private config;
    private messageId;
    private serverInfo?;
    private isConnected;
    private tools;
    constructor(config: CaidoConfig);
    get connected(): boolean;
    get info(): {
        name: string;
        version: string;
    } | undefined;
    get availableTools(): McpToolSchema[];
    updateConfig(newConfig: Partial<CaidoConfig>): void;
    /**
     * Execute JSON-RPC 2.0 request over Streamable HTTP (SSE or JSON).
     */
    private postRequest;
    /**
     * Connect to Caido MCP server and initialize session.
     */
    connect(): Promise<{
        serverInfo: {
            name: string;
            version: string;
        };
        toolCount: number;
    }>;
    /**
     * List tools from Caido MCP server.
     */
    listTools(cursor?: string): Promise<McpListToolsResult>;
    /**
     * Call a tool on the Caido MCP server.
     */
    callTool(name: string, args?: Record<string, unknown>): Promise<McpCallToolResult>;
    /**
     * Disconnect client.
     */
    disconnect(): void;
}

export { CaidoMcpClient };
