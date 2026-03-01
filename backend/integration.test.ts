import { describe, it, expect, beforeAll } from "bun:test";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddressSync,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount
} from "@solana/spl-token";
import BN from "bn.js";

// IDLs
import escrowIdl from "./escrow_program.json";
import mintIdl from "./mint_token_mplx.json";

describe("Complete NFT Lifecycle: Mint -> Escrow -> Buy", () => {
  const connection = new Connection("http://localhost:8899", "confirmed");
  
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  
  const provider = new anchor.AnchorProvider(
    connection, 
    new anchor.Wallet(maker), 
    { commitment: "confirmed" }
  );
  
  const escrowProgram = new Program(escrowIdl as any, provider);
  const mintProgram = new Program(mintIdl as any, provider);

  beforeAll(async () => {
    // Airdrop SOL to participants
    const airdrops = await Promise.all([
      connection.requestAirdrop(maker.publicKey, 5 * LAMPORTS_PER_SOL),
      connection.requestAirdrop(taker.publicKey, 5 * LAMPORTS_PER_SOL)
    ]);
    await Promise.all(airdrops.map(sig => connection.confirmTransaction(sig)));
    
    console.log("Setup complete. Maker and Taker funded.");
  });

  it("Mints an NFT and completes the Escrow cycle", async () => {
    // --- PART 1: MINTING ---
    // We create a standard SPL NFT (as required by the Escrow program)
    console.log("Creating NFT...");
    const nftMint = await createMint(
      connection,
      maker,
      maker.publicKey,
      null,
      0
    );

    const makerAta = await getOrCreateAssociatedTokenAccount(
      connection,
      maker,
      nftMint,
      maker.publicKey
    );

    await mintTo(
      connection,
      maker,
      nftMint,
      makerAta.address,
      maker,
      1
    );
    console.log(`NFT created: ${nftMint.toBase58()}`);

    // --- PART 2: ESCROW (MAKE) ---
    const seed = new BN(Math.floor(Math.random() * 1000000));
    const price = new BN(1 * LAMPORTS_PER_SOL);

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
      escrowProgram.programId
    );

    const [vault] = PublicKey.findProgramAddressSync(
        [
            escrowPda.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            nftMint.toBuffer()
        ],
        escrowProgram.programId
    );

    console.log("Listing NFT on Escrow...");
    await escrowProgram.methods
      .make(seed, price)
      .accounts({
        maker: maker.publicKey,
        nftMint: nftMint,
        makerAta: makerAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        vault: vault,
        escrow: escrowPda,
      })
      .signers([maker])
      .rpc();

    // Verify NFT is in vault
    const vaultBalance = await connection.getTokenAccountBalance(vault);
    expect(vaultBalance.value.amount).toBe("1");
    console.log("NFT successfully moved to Vault.");

    // --- PART 3: ESCROW (TAKE/BUY) ---
    const takerAta = getAssociatedTokenAddressSync(nftMint, taker.publicKey);

    console.log("Taker buying NFT...");
    await escrowProgram.methods
      .take(seed)
      .accounts({
        taker: taker.publicKey,
        nftMint: nftMint,
        maker: maker.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        vault: vault,
        takerAta: takerAta,
        escrow: escrowPda,
      })
      .signers([taker])
      .rpc();

    // Verify final ownership
    const takerBalance = await connection.getTokenAccountBalance(takerAta);
    expect(takerBalance.value.amount).toBe("1");
    
    // Verify maker received SOL
    const makerBalance = await connection.getBalance(maker.publicKey);
    // 5 SOL initial + 1 SOL price - fees
    expect(makerBalance).toBeGreaterThan(5.9 * LAMPORTS_PER_SOL);
    
    console.log("Cycle complete: Taker owns the NFT and Maker received 1 SOL.");
  });
});
