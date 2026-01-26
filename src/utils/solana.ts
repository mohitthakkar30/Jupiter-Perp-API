import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { IDL, type Perpetuals } from "../idl/jupiter-perpetuals-idl";
import { IDL as DovesIDL, type Doves } from "../idl/doves-idl";
import {
  JUPITER_PERPETUALS_PROGRAM_ID,
  DOVES_PROGRAM_ID,
} from "../constants/index";
import { config } from "../config/index";

// Create Solana connection
export function createConnection(): Connection {
  return new Connection(config.rpcUrl, { commitment: "confirmed" });
}

// Create Jupiter Perpetuals Program instance
export function createPerpetualsProgram(
  connection: Connection
): Program<Perpetuals> {
  const provider = new AnchorProvider(
    connection,
    new Wallet(Keypair.generate()),
    AnchorProvider.defaultOptions()
  );

  return new Program<Perpetuals>(IDL, JUPITER_PERPETUALS_PROGRAM_ID, provider);
}

// Create Doves Oracle Program instance
export function createDovesProgram(connection: Connection): Program<Doves> {
  const provider = new AnchorProvider(
    connection,
    new Wallet(Keypair.generate()),
    AnchorProvider.defaultOptions()
  );

  return new Program<Doves>(DovesIDL, DOVES_PROGRAM_ID, provider);
}

// Singleton instances
let connectionInstance: Connection | null = null;
let perpetualsProgramInstance: Program<Perpetuals> | null = null;
let dovesProgramInstance: Program<Doves> | null = null;

export function getConnection(): Connection {
  if (!connectionInstance) {
    connectionInstance = createConnection();
  }
  return connectionInstance;
}

export function getPerpetualsProgram(): Program<Perpetuals> {
  if (!perpetualsProgramInstance) {
    perpetualsProgramInstance = createPerpetualsProgram(getConnection());
  }
  return perpetualsProgramInstance;
}

export function getDovesProgram(): Program<Doves> {
  if (!dovesProgramInstance) {
    dovesProgramInstance = createDovesProgram(getConnection());
  }
  return dovesProgramInstance;
}
