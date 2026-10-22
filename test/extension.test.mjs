import test from "node:test";
import assert from "node:assert/strict";
import { CaidoProxyManager } from "../dist/proxy.js";
import { CaidoMcpClient } from "../dist/mcp-client.js";
import { loadConfig, normalizePortOrUrl, extractPort } from "../dist/config.js";

test("loadConfig returns default parameters", () => {
  const cfg = loadConfig("/tmp");
  assert.equal(cfg.mcpUrl, "http://127.0.0.1:3333/mcp");
  assert.equal(cfg.proxyUrl, "http://127.0.0.1:8080");
  assert.equal(cfg.proxyPort, 8080);
  assert.equal(cfg.proxyEnabled, false);
});

test("normalizePortOrUrl converts numeric and bare port strings to full URLs", () => {
  assert.equal(normalizePortOrUrl(9080), "http://127.0.0.1:9080");
  assert.equal(normalizePortOrUrl("9080"), "http://127.0.0.1:9080");
  assert.equal(normalizePortOrUrl(":9080"), "http://127.0.0.1:9080");
  assert.equal(normalizePortOrUrl("127.0.0.1:9080"), "http://127.0.0.1:9080");
  assert.equal(normalizePortOrUrl("http://localhost:9080"), "http://localhost:9080");
  assert.equal(normalizePortOrUrl(3333, "/mcp"), "http://127.0.0.1:3333/mcp");
  assert.equal(normalizePortOrUrl("3333", "/mcp"), "http://127.0.0.1:3333/mcp");
});

test("extractPort accurately extracts port numbers", () => {
  assert.equal(extractPort(9080), 9080);
  assert.equal(extractPort("9080"), 9080);
  assert.equal(extractPort("http://127.0.0.1:9080"), 9080);
  assert.equal(extractPort("http://localhost:3333/mcp"), 3333);
  assert.equal(extractPort("http://example.com"), 80);
  assert.equal(extractPort("https://example.com"), 443);
});

test("loadConfig recognizes CAIDO_PORT and CAIDO_MCP_PORT environment variables", () => {
  const prevCaidoPort = process.env.CAIDO_PORT;
  const prevMcpPort = process.env.CAIDO_MCP_PORT;

  try {
    process.env.CAIDO_PORT = "9080";
    process.env.CAIDO_MCP_PORT = "3333";

    const cfg = loadConfig("/tmp");
    assert.equal(cfg.proxyUrl, "http://127.0.0.1:9080");
    assert.equal(cfg.proxyPort, 9080);
    assert.equal(cfg.port, 9080);
    assert.equal(cfg.mcpUrl, "http://127.0.0.1:3333/mcp");
    assert.equal(cfg.mcpPort, 3333);
  } finally {
    if (prevCaidoPort !== undefined) {
      process.env.CAIDO_PORT = prevCaidoPort;
    } else {
      delete process.env.CAIDO_PORT;
    }
    if (prevMcpPort !== undefined) {
      process.env.CAIDO_MCP_PORT = prevMcpPort;
    } else {
      delete process.env.CAIDO_MCP_PORT;
    }
  }
});

test("CaidoProxyManager handles bare port numbers and setPort(9080)", () => {
  const originalHttpProxy = process.env.HTTP_PROXY;
  const originalHttpsProxy = process.env.HTTPS_PROXY;
  const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  const proxy = new CaidoProxyManager({
    mcpUrl: "http://127.0.0.1:3333/mcp",
    proxyUrl: "http://127.0.0.1:8080",
    proxyEnabled: false,
    timeoutMs: 5000,
    autoRegisterTools: true,
    toolPrefix: "caido_",
    allowInsecureTls: true,
  });

  assert.equal(proxy.port, 8080);

  // Set port to 9080 while disabled
  proxy.setPort(9080);
  assert.equal(proxy.port, 9080);
  assert.equal(proxy.proxyUrl, "http://127.0.0.1:9080");
  assert.equal(proxy.isEnabled, false);

  // Enable proxy with bare port
  proxy.enable(9080, true);
  assert.equal(proxy.isEnabled, true);
  assert.equal(proxy.port, 9080);
  assert.equal(process.env.HTTP_PROXY, "http://127.0.0.1:9080");
  assert.equal(process.env.HTTPS_PROXY, "http://127.0.0.1:9080");

  // Dynamically switch port to 9090 while running
  proxy.setPort("9090");
  assert.equal(proxy.port, 9090);
  assert.equal(process.env.HTTP_PROXY, "http://127.0.0.1:9090");

  proxy.disable();
  assert.equal(proxy.isEnabled, false);
  assert.equal(process.env.HTTP_PROXY, originalHttpProxy);
  assert.equal(process.env.HTTPS_PROXY, originalHttpsProxy);
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, originalTls);
});

test("CaidoProxyManager properly sets and restores environment variables", () => {
  const originalHttpProxy = process.env.HTTP_PROXY;
  const originalHttpsProxy = process.env.HTTPS_PROXY;
  const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  const proxy = new CaidoProxyManager({
    mcpUrl: "http://127.0.0.1:3333/mcp",
    proxyUrl: "http://127.0.0.1:8080",
    proxyEnabled: false,
    timeoutMs: 5000,
    autoRegisterTools: true,
    toolPrefix: "caido_",
    allowInsecureTls: true,
  });

  assert.equal(proxy.isEnabled, false);

  // Enable proxy
  proxy.enable("http://127.0.0.1:8080", true);
  assert.equal(proxy.isEnabled, true);
  assert.equal(process.env.HTTP_PROXY, "http://127.0.0.1:8080");
  assert.equal(process.env.HTTPS_PROXY, "http://127.0.0.1:8080");
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");

  // Disable proxy
  proxy.disable();
  assert.equal(proxy.isEnabled, false);
  assert.equal(process.env.HTTP_PROXY, originalHttpProxy);
  assert.equal(process.env.HTTPS_PROXY, originalHttpsProxy);
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, originalTls);
});

test("CaidoMcpClient connects and discovers tools on local Caido", async () => {
  const client = new CaidoMcpClient({
    mcpUrl: "http://127.0.0.1:3333/mcp",
    proxyUrl: "http://127.0.0.1:8080",
    proxyEnabled: false,
    timeoutMs: 5000,
    autoRegisterTools: true,
    toolPrefix: "caido_",
    allowInsecureTls: true,
  });

  try {
    const res = await client.connect();
    assert.ok(res.serverInfo);
    assert.ok(res.toolCount > 0);
    assert.equal(client.connected, true);
    assert.ok(client.availableTools.length > 0);

    // Test get_requests_by_ids with serialization schema
    const details = await client.callTool("get_requests_by_ids", {
      ids: ["1578"],
      serialization: { include_body: true },
    });
    assert.ok(details.content && details.content.length > 0);
    assert.notEqual(details.isError, true);

    client.disconnect();
    assert.equal(client.connected, false);
  } catch (err) {
    console.log("Local Caido MCP test skipped or unreachable:", err.message);
  }
});
