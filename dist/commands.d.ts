import { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { CaidoMcpClient } from './mcp-client.js';
import { CaidoProxyManager } from './proxy.js';
import './types.js';

declare function registerCaidoCommands(pi: ExtensionAPI, client: CaidoMcpClient, proxy: CaidoProxyManager, updateStatusBadge: (ctx?: {
    ui: {
        setStatus: (k: string, t: string | undefined) => void;
    };
}) => void): void;

export { registerCaidoCommands };
