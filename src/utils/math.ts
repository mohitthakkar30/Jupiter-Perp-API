import { BN } from "@coral-xyz/anchor";
import Decimal from "decimal";
import { USDC_DECIMALS } from "../constants";
import type { OraclePrice } from "../types";

// Division with ceiling (rounding up)
export function divCeil(a: BN, b: BN): BN {
  const dm = a.divmod(b);
  if (dm.mod.isZero()) return dm.div;
  return dm.div.ltn(0) ? dm.div.isubn(1) : dm.div.iaddn(1);
}

// Checked decimal multiplication with exponent handling
export function checkedDecimalMul(
  coefficient1: BN,
  exponent1: number,
  coefficient2: BN,
  exponent2: number,
  targetExponent: number
): BN {
  if (coefficient1.eqn(0) || coefficient2.eqn(0)) return new BN(0);

  const targetPower = exponent1 + exponent2 - targetExponent;

  if (targetPower >= 0) {
    return coefficient1
      .mul(coefficient2)
      .mul(new BN(Math.pow(10, targetPower)));
  } else {
    return coefficient1
      .mul(coefficient2)
      .div(new BN(Math.pow(10, -targetPower)));
  }
}

// Checked decimal division with exponent handling
export function checkedDecimalDiv(
  coefficient1: BN,
  exponent1: number,
  coefficient2: BN,
  exponent2: number,
  targetExponent: number
): BN {
  if (coefficient2.eqn(0)) throw new Error("MathOverflow: Division by zero");
  if (coefficient1.eqn(0)) return new BN(0);

  let scaleFactor = 0;
  let targetPower = exponent1 - exponent2 - targetExponent;

  if (exponent1 > 0) {
    scaleFactor += exponent1;
    targetPower -= exponent1;
  }
  if (exponent2 < 0) {
    scaleFactor -= exponent2;
    targetPower += exponent2;
  }
  if (targetExponent < 0) {
    scaleFactor -= targetExponent;
    targetPower += targetExponent;
  }

  const scaledCoeff1 =
    scaleFactor > 0
      ? new Decimal(coefficient1.toString()).mul(Decimal.pow(10, scaleFactor))
      : new Decimal(coefficient1.toString());

  const dividend = scaledCoeff1.div(new Decimal(coefficient2.toString()));
  const result =
    targetPower >= 0
      ? dividend.mul(Decimal.pow(10, targetPower))
      : dividend.div(Decimal.pow(10, -targetPower));

  return new BN(result.toDP(0).toString());
}

// Get USD value from token amount using oracle price
export function getAssetAmountUsd(
  oracle: OraclePrice,
  tokenAmount: BN,
  tokenDecimals: number
): BN {
  if (tokenAmount.eqn(0) || oracle.price.eqn(0)) {
    return new BN(0);
  }

  return checkedDecimalMul(
    tokenAmount,
    -tokenDecimals,
    oracle.price,
    oracle.exponent,
    -USDC_DECIMALS
  );
}

// Convert USD amount to token amount
export function getTokenAmount(
  oracle: OraclePrice,
  assetAmountUsd: BN,
  tokenDecimals: number
): BN {
  if (oracle.price.eqn(0) || assetAmountUsd.eqn(0)) return new BN(0);

  return checkedDecimalMul(
    assetAmountUsd,
    -USDC_DECIMALS,
    oracle.price,
    oracle.exponent,
    -tokenDecimals
  );
}

// Format oracle price to a target exponent
export function getPrice(
  oraclePrice: OraclePrice,
  targetExponent: number
): OraclePrice {
  if (targetExponent === oraclePrice.exponent) {
    return { ...oraclePrice };
  }

  const delta = targetExponent - oraclePrice.exponent;

  if (delta > 0) {
    return {
      price: oraclePrice.price.div(new BN(10).pow(new BN(delta))),
      exponent: targetExponent,
    };
  } else {
    return {
      price: oraclePrice.price.mul(new BN(10).pow(new BN(Math.abs(delta)))),
      exponent: targetExponent,
    };
  }
}

// Safety mechanism for stablecoin depegs
export function getOraclePriceForStable(oraclePrice: OraclePrice): OraclePrice {
  const oneUsd = new BN(10).pow(new BN(Math.abs(oraclePrice.exponent)));
  const maxPrice = BN.max(oneUsd, oraclePrice.price);

  return {
    price: maxPrice,
    exponent: oraclePrice.exponent,
  };
}
