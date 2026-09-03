import { CaidoConfig } from './types.js';

declare const DEFAULT_CONFIG: CaidoConfig;
/**
 * Load configuration merged from global file, local directory file, and env vars.
 */
declare function loadConfig(cwd?: string): CaidoConfig;
/**
 * Persist configuration changes to global ~/.pi/agent/caido.json.
 */
declare function saveGlobalConfig(partial: Partial<CaidoConfig>): void;

export { DEFAULT_CONFIG, loadConfig, saveGlobalConfig };
