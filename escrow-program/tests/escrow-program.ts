import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EscrowProgram } from "../target/types/escrow_program";
import { expect } from "chai";
import {
  createUmi,
} from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  signerIdentity,
  Umi,
} from "@metaplex-foundation/umi";
import {
  createV1,
  fetchAsset,
  MPL_CORE_PROGRAM_ID,
  mplCore,
} from "@metaplex-foundation/mpl-core";
import { createSignerFromWalletAdapter } from "@metaplex-foundation/umi-signer-wallet-adapters";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll fetchAsset until `owner` matches `expectedOwner` or we time out.
// This is necessary because UMI's HTTP RPC client can lag behind the
// WebSocket-based confirmTransaction, returning pre-tx state for up to
// several seconds on localnet.
async function waitForAssetOwner(
  umi: Umi,
  assetPublicKey: ReturnType<typeof generateSigner>["publicKey"],
  expectedOwner: string,
  maxWaitMs = 30_000,
  pollIntervalMs = 500
): Promise<Awaited<ReturnType<typeof fetchAsset>>> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const data = await fetchAsset(umi, assetPublicKey, { commitment: "confirmed" });
    if (data.owner.toString() === expectedOwner) return data;
    await sleep(pollIntervalMs);
  }
  const last = await fetchAsset(umi, assetPublicKey, { commitment: "confirmed" });
  throw new Error(
    `Timeout: asset owner is '${last.owner.toString()}', expected '${expectedOwner}'`
  );
}

describe("EscrowProgram", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow_program as Program<EscrowProgram>;

  const maker = provider.wallet;
  const taker = anchor.web3.Keypair.generate();

  let umi: Umi;
  // asset is a Umi Signer, so its publicKey is a Umi PublicKey
  let assetSigner: ReturnType<typeof generateSigner>;
  // For Anchor, we need Web3.js PublicKeys, so we'll convert them
  let assetWeb3Pubkey: anchor.web3.PublicKey;

  const seed = new anchor.BN(1234);
  let escrowPda: anchor.web3.PublicKey;
  let escrowBump: number;
  let vaultPda: anchor.web3.PublicKey;

  let token_price = 0.1 * anchor.web3.LAMPORTS_PER_SOL;

  before(async () => {
    //providing sol from the providers wallet instead of the 
    //airdrops which might create some issues.(Provider has a lot of sols)
    const transferAmount = 500 * anchor.web3.LAMPORTS_PER_SOL;

    const transferTx = new anchor.web3.Transaction()
      .add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: maker.publicKey,
          lamports: transferAmount,
        })
      )
      .add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey,
          toPubkey: taker.publicKey,
          lamports: transferAmount,
        })
      );

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    transferTx.feePayer = provider.wallet.publicKey;
    transferTx.recentBlockhash = latestBlockhash.blockhash;

    // Send and confirm
    const sig = await provider.sendAndConfirm(transferTx);
    console.log("Funded maker and taker via transfer: ", sig);

   
    umi = createUmi(provider.connection.rpcEndpoint).use(mplCore());

    //Ensure that umi signs from the same enitity that is the wallet. 
    const wallet = provider.wallet as anchor.Wallet;
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(wallet.payer.secretKey);
    umi.use(keypairIdentity(createSignerFromKeypair(umi, umiKeypair)));
    
    console.log("Umi Identity: ", umi.identity.publicKey.toString());
    assetSigner = generateSigner(umi);
    assetWeb3Pubkey = new anchor.web3.PublicKey(assetSigner.publicKey);

    console.log("Minting Core Asset...");
    console.log("Maker SOL Balance before mint:", await provider.connection.getBalance(maker.publicKey));
    // Create the Core asset owned by the maker
    try {
      const tx = createV1(umi, {
        asset: assetSigner,
        name: "Escrow Test Asset",
        uri: "https://example.com/asset.json",
      });
      console.log("Tx instructions:", tx.getInstructions().map(ix => ix.programId));
      await tx.sendAndConfirm(umi, { send: { skipPreflight: true, commitment: "confirmed" } });
    } catch (e: any) {
      console.error("UMI Mint Error:", e);
      if (e.logs) console.error("Logs:", e.logs);
      throw e;
    }


    // Verify it was minted correctly
    const assetData = await fetchAsset(umi, assetSigner.publicKey);
    expect(assetData.owner.toString()).to.equal(maker.publicKey.toString());
  });

  it("Makes and refunds the escrow", async () => {
    const seed1 = new anchor.BN(1111);
    [escrowPda, escrowBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed1.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // The vault PDA that will own the asset during escrow
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowPda.toBuffer()],
      program.programId
    );

    console.log("Running Make instruction...");
    // Make
    const makeSig1 = await program.methods
      .make(seed1, new anchor.BN(token_price))
      .accountsStrict({
        maker: maker.publicKey,
        asset: assetWeb3Pubkey,
        collection: anchor.web3.SystemProgram.programId, // No collection, so we pass SystemProgram (or core defaults to it)
        vault: vaultPda,
        escrow: escrowPda,
        coreProgram: new anchor.web3.PublicKey(MPL_CORE_PROGRAM_ID),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await provider.connection.confirmTransaction(makeSig1, "confirmed");

    let escrowAccount = await program.account.escrow.fetch(escrowPda);
    expect(escrowAccount.maker.toBase58()).to.equal(maker.publicKey.toBase58());
    expect(escrowAccount.mintNft.toBase58()).to.equal(assetWeb3Pubkey.toBase58());
    expect(escrowAccount.price.toNumber()).to.equal(token_price);
    expect(escrowAccount.bump).to.equal(escrowBump);

    console.log("Vault PDA:", vaultPda.toBase58());
    console.log("Maker PDA:", maker.publicKey.toBase58());
    // Poll until the vault PDA owns the Core Asset (UMI HTTP can lag behind WebSocket confirm)
    let assetData = await waitForAssetOwner(umi, assetSigner.publicKey, vaultPda.toBase58());
    console.log("Asset Owner:", assetData.owner.toString());

    // Refund
    const refundSig = await program.methods
      .refund(seed1)
      .accountsStrict({
        maker: maker.publicKey,
        asset: assetWeb3Pubkey,
        collection: anchor.web3.SystemProgram.programId,
        vault: vaultPda,
        escrow: escrowPda,
        coreProgram: new anchor.web3.PublicKey(MPL_CORE_PROGRAM_ID),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await provider.connection.confirmTransaction(refundSig, "confirmed");

    // Check if escrow is closed.
    const escrowInfo = await provider.connection.getAccountInfo(escrowPda);
    expect(escrowInfo).to.be.null;

    // Poll until the maker gets the asset back
    assetData = await waitForAssetOwner(umi, assetSigner.publicKey, maker.publicKey.toBase58());
    expect(assetData.owner.toString()).to.equal(maker.publicKey.toBase58());
  });

  it("Makes and takes the escrow", async () => {
    const seed2 = new anchor.BN(2222);
    [escrowPda, escrowBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), maker.publicKey.toBuffer(), seed2.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // The vault PDA
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowPda.toBuffer()],
      program.programId
    );

    console.log("Running Make instruction again for Take...");
    // Make (have to do it again for taking)
    const makeSig2 = await program.methods
      .make(seed2, new anchor.BN(token_price))
      .accountsStrict({
        maker: maker.publicKey,
        asset: assetWeb3Pubkey,
        collection: anchor.web3.SystemProgram.programId,
        vault: vaultPda,
        escrow: escrowPda,
        coreProgram: new anchor.web3.PublicKey(MPL_CORE_PROGRAM_ID),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await provider.connection.confirmTransaction(makeSig2, "confirmed");

    // Poll until the vault owns the asset
    let assetData = await waitForAssetOwner(umi, assetSigner.publicKey, vaultPda.toBase58());
    expect(assetData.owner.toString()).to.equal(vaultPda.toBase58());

    // Capture SOL balances before take
    const takerSolBefore = await provider.connection.getBalance(taker.publicKey);
    const makerSolBefore = await provider.connection.getBalance(maker.publicKey);

    console.log("Running Take instruction...");
    // Take
    const takeSig = await program.methods
      .take(seed2)
      .accountsStrict({
        taker: taker.publicKey,
        maker: maker.publicKey,
        asset: assetWeb3Pubkey,
        collection: anchor.web3.SystemProgram.programId,
        vault: vaultPda,
        escrow: escrowPda,
        coreProgram: new anchor.web3.PublicKey(MPL_CORE_PROGRAM_ID),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([taker])
      .rpc();
    await provider.connection.confirmTransaction(takeSig, "confirmed");

    // Check closed
    const escrowInfo = await provider.connection.getAccountInfo(escrowPda);
    expect(escrowInfo).to.be.null;

    // Poll until the taker owns the asset
    assetData = await waitForAssetOwner(umi, assetSigner.publicKey, taker.publicKey.toBase58());
    expect(assetData.owner.toString()).to.equal(taker.publicKey.toBase58());

    // Check SOL balances changed correctly
    const takerSolAfter = await provider.connection.getBalance(taker.publicKey);
    const makerSolAfter = await provider.connection.getBalance(maker.publicKey);

    // Taker paid token_price + tx fees, so decrease should be >= token_price
    expect(takerSolBefore - takerSolAfter).to.be.greaterThanOrEqual(token_price);

    // Maker received token_price
    expect(makerSolAfter - makerSolBefore).to.greaterThanOrEqual(token_price);
  });
});
