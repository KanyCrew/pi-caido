import { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { CaidoMcpClient } from './mcp-client.js';
import { CaidoProxyManager } from './proxy.js';
import './types.js';

/**
 * Register built-in Caido security tools into Pi with rich prompt guidelines for the agent.
 */
declare function registerCaidoTools(pi: ExtensionAPI, client: CaidoMcpClient, proxy: CaidoProxyManager): void;

export { registerCaidoTools };
