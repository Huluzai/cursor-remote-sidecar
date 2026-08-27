import qrcode from "qrcode-terminal";
import {
  buildPairingPayload,
  pickPrimaryHost,
} from "./pairing-payload.js";
import { localAddresses } from "./utils/network.js";

export function printPairingQR(
  host: string,
  port: number,
  token: string,
  allAddresses: string[],
): void {
  const qrHost = host || pickPrimaryHost(allAddresses);
  const payload = buildPairingPayload(qrHost, port, token);

  console.log("用 iPhone 扫描下方二维码配对（Path C）");
  qrcode.generate(payload, { small: true });
  console.log(`  QR host: ${qrHost}  port: ${port}`);

  const others = allAddresses.filter((ip) => ip !== qrHost);
  if (others.length > 0) {
    console.log("  其他可用 host（扫不上时可手输）:");
    for (const ip of others) {
      console.log(`    ${ip}`);
    }
  }
  console.log("");
}
