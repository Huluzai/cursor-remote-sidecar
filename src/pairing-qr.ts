import qrcode from "qrcode-terminal";
import { t } from "./i18n/index.js";
import {
  buildPairingPayload,
  pickPrimaryHost,
} from "./pairing-payload.js";

export function printPairingQR(
  host: string,
  port: number,
  token: string,
  allAddresses: string[],
): void {
  const qrHost = host || pickPrimaryHost(allAddresses);
  const payload = buildPairingPayload(qrHost, port, token);

  console.log(t("pairing.scanQr"));
  qrcode.generate(payload, { small: true });
  console.log(t("pairing.qrHostPort", { host: qrHost, port }));

  const others = allAddresses.filter((ip) => ip !== qrHost);
  if (others.length > 0) {
    console.log(t("pairing.otherHosts"));
    for (const ip of others) {
      console.log(`    ${ip}`);
    }
  }
  console.log("");
}
