import { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Pi Extension entry point for Caido integration.
 */
declare function export_default(pi: ExtensionAPI): Promise<void>;

export { export_default as default };
