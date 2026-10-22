import { CaidoConfig, ProxyState } from './types.js';

declare class CaidoProxyManager {
    private state;
    constructor(config: CaidoConfig);
    get isEnabled(): boolean;
    get proxyUrl(): string;
    get port(): number | undefined;
    /**
     * Set proxy port or URL and re-apply to environment if active.
     */
    setPort(portOrUrl: number | string): ProxyState;
    /**
     * Route outgoing requests from Pi and tools through Caido proxy.
     */
    enable(urlOrPort?: string | number, allowInsecureTls?: boolean): ProxyState;
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
