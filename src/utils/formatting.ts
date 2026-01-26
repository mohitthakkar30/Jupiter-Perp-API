import { BN } from "@coral-xyz/anchor";

// Format BN values into USD string representation
export function BNToUSDRepresentation(
  value: BN,
  exponent: number = 8,
  displayDecimals: number = 2
): string {
  const quotient = value.divn(Math.pow(10, exponent - displayDecimals));
  const usd = Number(quotient) / Math.pow(10, displayDecimals);

  return usd.toLocaleString("en-US", {
    maximumFractionDigits: displayDecimals,
    minimumFractionDigits: displayDecimals,
    useGrouping: false,
  });
}

// Format BN to string with specified decimals
export function formatBN(value: BN, decimals: number = 6): string {
  if (value.isNeg()) {
    return "-" + formatBN(value.abs(), decimals);
  }

  const str = value.toString().padStart(decimals + 1, "0");
  const integerPart = str.slice(0, -decimals) || "0";
  const decimalPart = str.slice(-decimals);

  return `${integerPart}.${decimalPart}`;
}

// Parse string to BN with decimals
export function parseToBN(value: string, decimals: number = 6): BN {
  const [integerPart, decimalPart = ""] = value.split(".");
  const paddedDecimal = decimalPart.padEnd(decimals, "0").slice(0, decimals);
  return new BN(integerPart + paddedDecimal);
}

// Format timestamp to ISO string
export function formatTimestamp(timestamp: BN | number): string {
  const ts = typeof timestamp === "number" ? timestamp : timestamp.toNumber();
  return new Date(ts * 1000).toISOString();
}

// Format side enum to string
export function formatSide(side: { long?: object; short?: object }): "long" | "short" {
  return side.long ? "long" : "short";
}
