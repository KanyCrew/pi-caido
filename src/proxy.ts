import type { CaidoConfig, ProxyState } from "./types.js";
import { normalizePortOrUrl, extractPort } from "./config.js";

export class CaidoProxyManager {
  private state: ProxyState = {
    enabled: false,
    url: "http://127.0.0.1:8080",
    previousEnv: {},
  };

  constructor(config: CaidoConfig) {
    this.state.url = normalizePortOrUrl(config.proxyUrl || config.proxyPort || config.port || "http://127.0.0.1:8080");
    if (config.proxyEnabled) {
      this.enable(this.state.url, config.allowInsecureTls);
    }
  }

  public get isEnabled(): boolean {
    return this.state.enabled;
  }

  public get proxyUrl(): string {
    return this.state.url;
  }

  public get port(): number | undefined {
    return extractPort(this.state.url);
  }

  /**
   * Set proxy port or URL and re-apply to environment if active.
   */
  public setPort(portOrUrl: number | string): ProxyState {
    const newUrl = normalizePortOrUrl(portOrUrl);
    this.state.url = newUrl;
    if (this.state.enabled) {
      process.env.HTTP_PROXY = newUrl;
      process.env.HTTPS_PROXY = newUrl;
      process.env.http_proxy = newUrl;
      process.env.https_proxy = newUrl;
      process.env.ALL_PROXY = newUrl;
      process.env.all_proxy = newUrl;
    }
    return this.state;
  }

  /**
   * Route outgoing requests from Pi and tools through Caido proxy.
   */
  public enable(urlOrPort?: string | number, allowInsecureTls = true): ProxyState {
    const targetUrl = urlOrPort !== undefined ? normalizePortOrUrl(urlOrPort) : this.state.url;
    this.state.url = targetUrl;

    if (!this.state.enabled) {
      // Backup previous environment variables
      this.state.previousEnv = {
        HTTP_PROXY: process.env.HTTP_PROXY,
        HTTPS_PROXY: process.env.HTTPS_PROXY,
        http_proxy: process.env.http_proxy,
        https_proxy: process.env.https_proxy,
        ALL_PROXY: process.env.ALL_PROXY,
        all_proxy: process.env.all_proxy,
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
      };
    }

    // Set proxy environment variables
    process.env.HTTP_PROXY = targetUrl;
    process.env.HTTPS_PROXY = targetUrl;
    process.env.http_proxy = targetUrl;
    process.env.https_proxy = targetUrl;
    process.env.ALL_PROXY = targetUrl;
    process.env.all_proxy = targetUrl;

    if (allowInsecureTls) {
      // Allows intercepting Caido self-signed CA certs in Node without TLS rejection
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    this.state.enabled = true;
    return this.state;
  }

  /**
   * Restore previous proxy settings.
   */
  public disable(): ProxyState {
    if (!this.state.enabled) {
      return this.state;
    }

    const prev = this.state.previousEnv;

    const restoreOrDelete = (key: string, val: string | undefined) => {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    };

    restoreOrDelete("HTTP_PROXY", prev.HTTP_PROXY);
    restoreOrDelete("HTTPS_PROXY", prev.HTTPS_PROXY);
    restoreOrDelete("http_proxy", prev.http_proxy);
    restoreOrDelete("https_proxy", prev.https_proxy);
    restoreOrDelete("ALL_PROXY", prev.ALL_PROXY);
    restoreOrDelete("all_proxy", prev.all_proxy);
    restoreOrDelete("NODE_TLS_REJECT_UNAUTHORIZED", prev.NODE_TLS_REJECT_UNAUTHORIZED);

    this.state.enabled = false;
    return this.state;
  }

  /**
   * Get formatted status report.
   */
  public getStatusText(): string {
    if (!this.state.enabled) {
      return "Disabled (traffic routes directly)";
    }
    return `Enabled -> ${this.state.url} (TLS inspection active)`;
  }
}
