import dotenv from "dotenv";

dotenv.config();

export const config = {
  rpcUrl: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
};
