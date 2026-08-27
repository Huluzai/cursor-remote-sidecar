import { networkInterfaces } from "node:os";

export function localAddresses(): string[] {
  const out: string[] = [];
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.internal) continue;
      if (e.family === "IPv4") out.push(e.address);
    }
  }
  return out;
}
