import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Program IDs
export const JUPITER_PERPETUALS_PROGRAM_ID = new PublicKey(
  "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"
);

export const DOVES_PROGRAM_ID = new PublicKey(
  "DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e"
);

export const JUPITER_PERPETUALS_EVENT_AUTHORITY_PUBKEY = new PublicKey(
  "37hJBDnntwqhGbK7L6M1bLyvccj4u55CCUiLPdYkiqBN"
);

// Pool & JLP Addresses
export const JLP_POOL_ACCOUNT_PUBKEY = new PublicKey(
  "5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq"
);

export const JLP_MINT_PUBKEY = new PublicKey(
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4"
);

// Custody Addresses
export enum CUSTODY_PUBKEY {
  SOL = "7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz",
  ETH = "AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn",
  BTC = "5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm",
  USDC = "G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa",
  USDT = "4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk",
}

export const CUSTODY_PUBKEYS = [
  new PublicKey(CUSTODY_PUBKEY.SOL),
  new PublicKey(CUSTODY_PUBKEY.BTC),
  new PublicKey(CUSTODY_PUBKEY.ETH),
  new PublicKey(CUSTODY_PUBKEY.USDC),
  new PublicKey(CUSTODY_PUBKEY.USDT),
];

// Token Mint Addresses
export const TOKEN_MINTS = {
  SOL: new PublicKey("So11111111111111111111111111111111111111112"),
  ETH: new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"),
  BTC: new PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh"),
  USDC: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  USDT: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
};

// Complete Custody Details with Oracles
export const CUSTODY_DETAILS: Record<
  string,
  {
    name: string;
    mint: PublicKey;
    pythnetOracle: PublicKey;
    dovesOracle: PublicKey;
    chainlinkOracle: PublicKey;
    dovesAgOracle: PublicKey;
    tokenAccount: PublicKey;
  }
> = {
  [CUSTODY_PUBKEY.SOL]: {
    name: "SOL",
    mint: TOKEN_MINTS.SOL,
    pythnetOracle: new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"),
    dovesOracle: new PublicKey("39cWjvHrpHNz2SbXv6ME4NPhqBDBd4KsjUYv5JkHEAJU"),
    chainlinkOracle: new PublicKey("FWLXDDgW2Qm2VuX8MdV99VYpo6X1HLEykUjfAsjz2G78"),
    dovesAgOracle: new PublicKey("FYq2BWQ1V5P1WFBqr3qB2Kb5yHVvSv7upzKodgQE5zXh"),
    tokenAccount: new PublicKey("BUvduFTd2sWFagCunBPLupG8fBTJqweLw9DuhruNFSCm"),
  },
  [CUSTODY_PUBKEY.ETH]: {
    name: "ETH",
    mint: TOKEN_MINTS.ETH,
    pythnetOracle: new PublicKey("42amVS4KgzR9rA28tkVYqVXjq9Qa8dcZQMbH5EYFX6XC"),
    dovesOracle: new PublicKey("5URYohbPy32nxK1t3jAHVNfdWY2xTubHiFvLrE3VhXEp"),
    chainlinkOracle: new PublicKey("BNQzYvnidN8vVVn78xh6wgLo5ozmV8Dx8AE8rndqeLEe"),
    dovesAgOracle: new PublicKey("AFZnHPzy4mvVCffrVwhewHbFc93uTHvDSFrVH7GtfXF1"),
    tokenAccount: new PublicKey("Bgarxg65CEjN3kosjCW5Du3wEqvV3dpCGDR3a2HRQsYJ"),
  },
  [CUSTODY_PUBKEY.BTC]: {
    name: "BTC",
    mint: TOKEN_MINTS.BTC,
    pythnetOracle: new PublicKey("4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo"),
    dovesOracle: new PublicKey("4HBbPx9QJdjJ7GUe6bsiJjGybvfpDhQMMPXP1UEa7VT5"),
    chainlinkOracle: new PublicKey("A6F8mvoM8Qc9wTaKjrD1B5Fgpp6NhPQyJLWXeafWrbsV"),
    dovesAgOracle: new PublicKey("hUqAT1KQ7eW1i6Csp9CXYtpPfSAvi835V7wKi5fRfmC"),
    tokenAccount: new PublicKey("FgpXg2J3TzSs7w3WGYYE7aWePdrxBVLCXSxmAKnCZNtZ"),
  },
  [CUSTODY_PUBKEY.USDC]: {
    name: "USDC",
    mint: TOKEN_MINTS.USDC,
    pythnetOracle: new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"),
    dovesOracle: new PublicKey("A28T5pKtscnhDo6C1Sz786Tup88aTjt8uyKewjVvPrGk"),
    chainlinkOracle: new PublicKey("3Z4gQ5ujXZSYeVyPhkakVcrmyMxhAk6VT2NYSVV3RGGU"),
    dovesAgOracle: new PublicKey("6Jp2xZUTWdDD2ZyUPRzeMdc6AFQ5K3pFgZxk2EijfjnM"),
    tokenAccount: new PublicKey("WzWUoCmtVv7eqAbU3BfKPU3fhLP6CXR8NCJH78UK9VS"),
  },
  [CUSTODY_PUBKEY.USDT]: {
    name: "USDT",
    mint: TOKEN_MINTS.USDT,
    pythnetOracle: new PublicKey("HT2PLQBcG5EiCcNSaMHAjSgd9F98ecpATbk4Sk5oYuM"),
    dovesOracle: new PublicKey("AGW7q2a3WxCzh5TB2Q6yNde1Nf41g3HLaaXdybz7cbBU"),
    chainlinkOracle: new PublicKey("5KQxzQ4xQGPUiJGYbujLjygm6Frin9zE5h996hxxfyqe"),
    dovesAgOracle: new PublicKey("Fgc93D641F8N2d1xLjQ4jmShuD3GE3BsCXA56KBQbF5u"),
    tokenAccount: new PublicKey("Gex24YznvguMad1mBzTQ7a64U1CJy59gvsStQmNnnwAd"),
  },
};

// Precision Constants
export const USDC_DECIMALS = 6;
export const JLP_DECIMALS = 6;
export const BPS_POWER = new BN(10_000);
export const DBPS_POWER = new BN(100_000);
export const RATE_POWER = new BN(1_000_000_000);
export const DEBT_POWER = RATE_POWER;
export const BORROW_SIZE_PRECISION = new BN(1000);

// Token name to custody mapping
export const TOKEN_TO_CUSTODY: Record<string, string> = {
  SOL: CUSTODY_PUBKEY.SOL,
  ETH: CUSTODY_PUBKEY.ETH,
  BTC: CUSTODY_PUBKEY.BTC,
  USDC: CUSTODY_PUBKEY.USDC,
  USDT: CUSTODY_PUBKEY.USDT,
};
