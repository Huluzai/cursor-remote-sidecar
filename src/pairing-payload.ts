export const PAIRING_SCHEME = "cursor-remote";
export const PAIRING_PATH = "pair";
export const PAIRING_VERSION = "1";

export interface PairingFields {
  host: string;
  port: number;
  token: string;
}

export class PairingPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingPayloadError";
  }
}

function hostPriority(host: string): number {
  if (host.startsWith("192.168.")) return 0;
  if (host.startsWith("10.")) return 1;
  if (host.startsWith("100.")) return 2;
  return 3;
}

export function pickPrimaryHost(addresses: string[]): string {
  const ipv4 = addresses.filter((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
  if (ipv4.length === 0) return "127.0.0.1";
  return [...ipv4].sort((a, b) => hostPriority(a) - hostPriority(b))[0]!;
}

export function validatePairingFields(
  host: string,
  port: number,
  token: string,
): void {
  if (!host.trim()) {
    throw new PairingPayloadError("host required");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PairingPayloadError("port out of range");
  }
  if (!/^\d{6}$/.test(token)) {
    throw new PairingPayloadError("token must be 6 digits");
  }
}

export function buildPairingPayload(
  host: string,
  port: number,
  token: string,
): string {
  validatePairingFields(host, port, token);
  const params = new URLSearchParams({
    v: PAIRING_VERSION,
    host: host.trim(),
    port: String(port),
    token,
  });
  return `${PAIRING_SCHEME}://${PAIRING_PATH}?${params.toString()}`;
}

export function parsePairingPayload(raw: string): PairingFields {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PairingPayloadError("invalid pairing URL");
  }
  if (url.protocol !== `${PAIRING_SCHEME}:` || url.hostname !== PAIRING_PATH) {
    throw new PairingPayloadError("unsupported pairing URL");
  }
  const version = url.searchParams.get("v");
  if (version !== PAIRING_VERSION) {
    throw new PairingPayloadError("unsupported pairing version");
  }
  const host = url.searchParams.get("host") ?? "";
  const portRaw = url.searchParams.get("port") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const port = Number(portRaw);
  validatePairingFields(host, port, token);
  return { host: host.trim(), port, token };
}
