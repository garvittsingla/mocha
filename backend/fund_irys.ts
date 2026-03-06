 // bun run fund-irys

import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const FUND_LAMPORTS = 50_000_000; // 0.05 SOL — enough for many image uploads

// Load creator keypair from Solana CLI wallet
const creatorSecret: number[] = JSON.parse(
  readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf-8")
);
const secretKey = Uint8Array.from(creatorSecret);

console.log("🔗 Connecting to Irys devnet node...");
const irys = await Uploader(Solana)
  .devnet()
  .withRpc("https://api.devnet.solana.com")
  .withWallet(secretKey);

// Check current balance before funding
const currentBalance = await irys.getLoadedBalance();
console.log(`💰 Current Irys balance : ${irys.utils.fromAtomic(currentBalance).toFixed(6)} SOL`);

console.log(`🚀 Funding Irys node with ${FUND_LAMPORTS / 1e9} SOL...`);
const fundTx = await irys.fund(FUND_LAMPORTS);
console.log(`✅ Funded! Transaction ID: ${fundTx.id}`);

const newBalance = await irys.getLoadedBalance();
console.log(`💰 New Irys balance     : ${irys.utils.fromAtomic(newBalance).toFixed(6)} SOL`);
console.log("\n✅ Done! You can now set USE_REAL_UPLOADS = true in index.test.ts");
