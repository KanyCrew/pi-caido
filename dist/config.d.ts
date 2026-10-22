import { CaidoConfig } from './types.js';

declare const DEFAULT_CONFIG: CaidoConfig;
/**
 * Normalizes a port number or URL string into a complete HTTP URL.
 * Examples:
 *   9080 -> "http://127.0.0.1:9080"
 *   "9080" -> "http://127.0.0.1:9080"
 *   ":9080" -> "http://127.0.0.1:9080"
 *   "127.0.0.1:9080" -> "http://127.0.0.1:9080"
 *   "http://127.0.0.1:9080" -> "http://127.0.0.1:9080"
 */
declare function normalizePortOrUrl(input: string | number, defaultPath?: string): string;
/**
 * Extract integer port from URL or port representation.
 */
declare function extractPort(input?: string | number): number | undefined;
/**
 * Load configuration merged from global file, local directory file, and env vars.
 */
declare function loadConfig(cwd?: string): CaidoConfig;
/**
 * Persist configuration changes to global ~/.pi/agent/caido.json.
 */
declare function saveGlobalConfig(partial: Partial<CaidoConfig>): void;

export { DEFAULT_CONFIG, extractPort, loadConfig, normalizePortOrUrl, saveGlobalConfig };
