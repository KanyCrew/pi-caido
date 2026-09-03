// src/proxy.ts
var CaidoProxyManager = class {
  state = {
    enabled: false,
    url: "http://127.0.0.1:8080",
    previousEnv: {}
  };
  constructor(config) {
    this.state.url = config.proxyUrl;
    if (config.proxyEnabled) {
      this.enable(config.proxyUrl, config.allowInsecureTls);
    }
  }
  get isEnabled() {
    return this.state.enabled;
  }
  get proxyUrl() {
    return this.state.url;
  }
  /**
   * Route outgoing requests from Pi and tools through Caido proxy.
   */
  enable(url, allowInsecureTls = true) {
    const targetUrl = url || this.state.url;
    this.state.url = targetUrl;
    if (!this.state.enabled) {
      this.state.previousEnv = {
        HTTP_PROXY: process.env.HTTP_PROXY,
        HTTPS_PROXY: process.env.HTTPS_PROXY,
        http_proxy: process.env.http_proxy,
        https_proxy: process.env.https_proxy,
        ALL_PROXY: process.env.ALL_PROXY,
        all_proxy: process.env.all_proxy,
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED
      };
    }
    process.env.HTTP_PROXY = targetUrl;
    process.env.HTTPS_PROXY = targetUrl;
    process.env.http_proxy = targetUrl;
    process.env.https_proxy = targetUrl;
    process.env.ALL_PROXY = targetUrl;
    process.env.all_proxy = targetUrl;
    if (allowInsecureTls) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    this.state.enabled = true;
    return this.state;
  }
  /**
   * Restore previous proxy settings.
   */
  disable() {
    if (!this.state.enabled) {
      return this.state;
    }
    const prev = this.state.previousEnv;
    const restoreOrDelete = (key, val) => {
      if (val !== void 0) {
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
  getStatusText() {
    if (!this.state.enabled) {
      return "Disabled (traffic routes directly)";
    }
    return `Enabled -> ${this.state.url} (TLS inspection active)`;
  }
};
export {
  CaidoProxyManager
};
//# sourceMappingURL=proxy.js.map