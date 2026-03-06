// Prints devnet balances for all tracked accounts.

import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";
const ACCOUNTS_FILE = join(import.meta.dir, "accounts.json");

const connection = new Connection(DEVNET_RPC, "confirmed");

async function printBalance(label: string, kp: Keypair) {
  const lamports = await connection.getBalance(kp.publicKey);
  const sol = (lamports / LAMPORTS_PER_SOL).toFixed(4);
  console.log(`  ${label.padEnd(12)}: ${kp.publicKey.toBase58()}  →  ${sol} SOL`);
}

// Creator (Solana CLI wallet)
const creatorSecret: number[] = JSON.parse(
  readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf-8")
);
const creator = Keypair.fromSecretKey(Uint8Array.from(creatorSecret));

// Other accounts from accounts.json
if (!existsSync(ACCOUNTS_FILE)) {
  console.error("❌ accounts.json not found — run `bun run airdrop` first");
  process.exit(1);
}
const stored: Record<string, number[]> = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf-8"));
const taker      = Keypair.fromSecretKey(Uint8Array.from(stored["taker"]!));
const collection = Keypair.fromSecretKey(Uint8Array.from(stored["collection"]!));
const mintToken  = Keypair.fromSecretKey(Uint8Array.from(stored["mintToken"]!));

console.log("\n─── Devnet Balances ─────────────────────────────────────────────────────");
await printBalance("Creator",    creator);
await printBalance("Taker",      taker);
await printBalance("Collection", collection);
await printBalance("MintToken",  mintToken);
console.log("─────────────────────────────────────────────────────────────────────────\n");
