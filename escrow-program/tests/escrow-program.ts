import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EscrowProgram } from "../target/types/escrow_program";
import { expect } from "chai";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createMint, mintTo, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("EscrowProgram", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow_program as Program<EscrowProgram>;

  const maker = provider.wallet.publicKey;
  const taker = anchor.web3.Keypair.generate();

  let mintA: anchor.web3.PublicKey;
  let makerAtaA: anchor.web3.PublicKey;
  let takerAtaA: anchor.web3.PublicKey;

  const seed = new anchor.BN(1234);
  let escrowPda: anchor.web3.PublicKey;
  let escrowBump: number;
  let vault: anchor.web3.PublicKey;

  let token_price = 0.10 * anchor.web3.LAMPORTS_PER_SOL;

  before(async () => {
    // Airdrop SOL to maker and taker
    await provider.connection.requestAirdrop(maker, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(taker.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create mints (decimals=0 for simplicity)
    mintA = await createMint(provider.connection, provider.wallet.payer!, maker, null, 0);

    // Create ATAs and mint tokens
    makerAtaA = getAssociatedTokenAddressSync(mintA, maker);
    const makerAtaATx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(provider.wallet.publicKey, makerAtaA, maker, mintA)
    );

    await provider.sendAndConfirm(makerAtaATx);
    //I guess we are minting only one token of that nft.
    await mintTo(provider.connection, provider.wallet.payer!, mintA, makerAtaA, provider.wallet.payer!, 1);

  });

  it("Makes and refunds the escrow", async () => {
    const seed1 = new anchor.BN(1111);
    [escrowPda, escrowBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.toBuffer(), seed1.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    vault = getAssociatedTokenAddressSync(mintA, escrowPda, true);

    // Make
    await program.methods
      .make(seed1, new anchor.BN(token_price))
      .accountsStrict({
        maker: maker,
        nftMint: mintA,
        makerAta: makerAtaA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        vault: vault,
        escrow: escrowPda,
      })
      .rpc();

    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    expect(escrowAccount.maker.toBase58()).to.equal(maker.toBase58());
    expect(escrowAccount.mintNft.toBase58()).to.equal(mintA.toBase58());
    expect(escrowAccount.price.toNumber()).to.equal(token_price);
    expect(escrowAccount.bump).to.equal(escrowBump);

    const vaultBalance = (await provider.connection.getTokenAccountBalance(vault)).value.uiAmount;
    expect(vaultBalance).to.equal(1);

    // Refund
    await program.methods
      .refund(seed1)
      .accountsStrict({
        maker: maker,
        vault: vault,
        nftMint: mintA,
        escrow: escrowPda,
        makerAta: makerAtaA,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Check if escrow is closed.
    const escrowInfo = await provider.connection.getAccountInfo(escrowPda);
    expect(escrowInfo).to.be.null;
    // check if vault is closed too.
    const vaultInfo = await provider.connection.getAccountInfo(vault);
    expect(vaultInfo).to.be.null;
  });

  it("Makes and takes the escrow", async () => {
    const seed2 = new anchor.BN(2222);
    [escrowPda, escrowBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.toBuffer(), seed2.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    vault = getAssociatedTokenAddressSync(mintA, escrowPda, true);

    // Make (have to do it again for taking)
    await program.methods
      .make(seed2, new anchor.BN(token_price))
      .accountsStrict({
        maker: maker,
        nftMint: mintA,
        makerAta: makerAtaA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        vault: vault,
        escrow: escrowPda,
      })
      .rpc();

    // Setup for take
    takerAtaA = getAssociatedTokenAddressSync(mintA, taker.publicKey);

    // Capture SOL balances before take
    const takerSolBefore = await provider.connection.getBalance(taker.publicKey);
    const makerSolBefore = await provider.connection.getBalance(maker);

    // Take
    await program.methods
      .take(seed2)
      .accountsStrict({
        taker: taker.publicKey,
        nftMint: mintA,
        maker: maker,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        vault: vault,
        takerAta: takerAtaA,
        escrow: escrowPda,
      })
      .signers([taker])
      .rpc();

    // Check closed
    const escrowInfo = await provider.connection.getAccountInfo(escrowPda);
    expect(escrowInfo).to.be.null;

    const vaultInfo = await provider.connection.getAccountInfo(vault);
    expect(vaultInfo).to.be.null;

    // Check SOL balances changed correctly
    const takerSolAfter = await provider.connection.getBalance(taker.publicKey);
    const makerSolAfter = await provider.connection.getBalance(maker);

    // Taker paid token_price + tx fees, so decrease should be >= token_price
    expect(takerSolBefore - takerSolAfter).to.be.greaterThanOrEqual(token_price);

    // Maker received token_price
    expect(makerSolAfter - makerSolBefore).to.greaterThanOrEqual(token_price);
  });
});
