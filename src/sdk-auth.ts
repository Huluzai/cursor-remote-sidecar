import type { SidecarConfig } from "./config.js";

/** Pass to SDK calls: omit apiKey when using stored browser login. */
export function sdkAuthOptions(
  config: SidecarConfig,
): { apiKey?: string } | Record<string, never> {
  if (config.apiKey) {
    return { apiKey: config.apiKey };
  }
  return {};
}
