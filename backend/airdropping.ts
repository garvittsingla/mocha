
// Loads the creator from the id.json from config and distributes sol among taker, and also
// creates other necessary accounts 

import { Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEVNET_RPC = "https://api.devnet.solana.com";
const ACCOUNTS_FILE = join(import.meta.dir, "accounts.json");
const TAKER_MIN_SOL = 2;
const TRANSFER_SOL = 2;

// ─── Helpers ───────────────────────────────────────────────────────────────

function loadOrCreate(existing?: number[]): Keypair {
  if (existing && existing.length === 64) {
    return Keypair.fromSecretKey(Uint8Array.from(existing));
  }
  return Keypair.generate();
}

async function getBalance(connection: Connection, kp: Keypair): Promise<number> {
  const lamports = await connection.getBalance(kp.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

const connection = new Connection(DEVNET_RPC, "confirmed");

const solanaCliPath = join(homedir(), ".config", "solana", "id.json");
if (!existsSync(solanaCliPath)) {
  console.error(`❌ Solana CLI wallet not found at ${solanaCliPath}`);
  console.error("   Run: solana-keygen new  (or set a different keypair path)");
  process.exit(1);
}
const creatorSecret: number[] = JSON.parse(readFileSync(solanaCliPath, "utf-8"));
const creator = Keypair.fromSecretKey(Uint8Array.from(creatorSecret));
console.log("👤 Creator (CLI wallet):", creator.publicKey.toBase58());

let stored: Record<string, number[]> = {};
if (existsSync(ACCOUNTS_FILE)) {
  stored = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf-8"));
  console.log("📂 Loaded existing accounts.json");
} else {
  console.log("📂 accounts.json not found — generating fresh keypairs");
}

const taker     = loadOrCreate(stored["taker"]);
const collection  = loadOrCreate(stored["collection"]);
const mintToken = loadOrCreate(stored["mintToken"]);

const toSave: Record<string, number[]> = {
  taker:      Array.from(taker.secretKey),
  collection: Array.from(collection.secretKey),
  mintToken:  Array.from(mintToken.secretKey),
};
writeFileSync(ACCOUNTS_FILE, JSON.stringify(toSave, null, 2));
console.log("💾 accounts.json saved");

console.log("\n📋 Account Public Keys:");
console.log("  Creator    :", creator.publicKey.toBase58());
console.log("  Taker      :", taker.publicKey.toBase58());
console.log("  Collection :", collection.publicKey.toBase58());
console.log("  MintToken  :", mintToken.publicKey.toBase58());

// 3. Check creator balance
const creatorBalance = await getBalance(connection, creator);
console.log(`\n💰 Creator balance: ${creatorBalance.toFixed(4)} SOL`);

if (creatorBalance < TRANSFER_SOL + 0.01) {
  console.error(`\n❌ Creator wallet has insufficient SOL (${creatorBalance.toFixed(4)} SOL).`);
  console.error("   Please fund it first:");
  console.error("     solana airdrop 5 --url devnet");
  console.error("     (wait ~30s, then)");
  console.error("     solana airdrop 5 --url devnet");
  process.exit(1);
}

const takerBalance = await getBalance(connection, taker);
console.log(`💰 Taker balance  : ${takerBalance.toFixed(4)} SOL`);

if (takerBalance < TAKER_MIN_SOL) {
  const amountLamports = TRANSFER_SOL * LAMPORTS_PER_SOL;
  console.log(`\n🚀 Taker has less than ${TAKER_MIN_SOL} SOL — transferring ${TRANSFER_SOL} SOL from creator...`);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: creator.publicKey,
      toPubkey:   taker.publicKey,
      lamports:   amountLamports,
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [creator]);
  console.log(`✅ Transfer confirmed! sig: ${sig}`);
} else {
  console.log(`✅ Taker already has enough SOL (${takerBalance.toFixed(4)} SOL) — no transfer needed`);
}

console.log("\n─── Final Balances ──────────────────────────────────");
const finalCreator    = await getBalance(connection, creator);
const finalTaker      = await getBalance(connection, taker);
const finalCollection = await getBalance(connection, collection);
const finalMintToken  = await getBalance(connection, mintToken);
console.log(`  Creator    : ${finalCreator.toFixed(4)} SOL`);
console.log(`  Taker      : ${finalTaker.toFixed(4)} SOL`);
console.log(`  Collection : ${finalCollection.toFixed(4)} SOL`);
console.log(`  MintToken  : ${finalMintToken.toFixed(4)} SOL`);
console.log("─────────────────────────────────────────────────────");
console.log("\n✅ Bootstrap complete! You can now run: bun test --timeout 300000");
