import { CaidoConfig, ProxyState } from './types.js';

declare class CaidoProxyManager {
    private state;
    constructor(config: CaidoConfig);
    get isEnabled(): boolean;
    get proxyUrl(): string;
    /**
     * Route outgoing requests from Pi and tools through Caido proxy.
     */
    enable(url?: string, allowInsecureTls?: boolean): ProxyState;
    /**
     * Restore previous proxy settings.
     */
    disable(): ProxyState;
    /**
     * Get formatted status report.
     */
    getStatusText(): string;
}

export { CaidoProxyManager };
