import * as anchor from "@coral-xyz/anchor";
import { Program, type Idl } from "@coral-xyz/anchor";
import escrowIdl from "./escrow_program.json";
import mintIdl from "./mint_token_mplx.json";
import { expect, describe, it, beforeAll } from "bun:test";
import { SystemProgram } from "@solana/web3.js";
import { MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";




describe("deployed programs", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const escrowProgram = new Program(escrowIdl as Idl, provider);
  const mintProgram = new Program(mintIdl as Idl, provider);

  const creator = anchor.web3.Keypair.generate();
  const taker = anchor.web3.Keypair.generate();
  const collection = anchor.web3.Keypair.generate();

  let mintToken = anchor.web3.Keypair.generate();

  let creatorAta = anchor.web3.PublicKey.findProgramAddressSync(
    [mintToken.publicKey.toBuffer(), creator.publicKey.toBuffer()],
    mintProgram.programId
  )[0];

  let mintAta = anchor.web3.PublicKey.findProgramAddressSync(
    [mintToken.publicKey.toBuffer(), creator.publicKey.toBuffer()],
    mintProgram.programId
  )[0];

  let takerAta = anchor.web3.PublicKey.findProgramAddressSync(
    [mintToken.publicKey.toBuffer(), taker.publicKey.toBuffer()],
    mintProgram.programId
  )[0];

  let escrowPda = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      creator.publicKey.toBuffer(),
      mintToken.publicKey.toBuffer(),
    ],
    escrowProgram.programId
  )[0];

  let vault = anchor.web3.PublicKey.findProgramAddressSync(
    [mintToken.publicKey.toBuffer(), escrowPda.toBuffer()],
    mintProgram.programId
  )[0];

  let programDataAccount: anchor.web3.PublicKey;

  beforeAll(async () => {
    console.log("Escrow Program:", escrowProgram.programId.toBase58());
    console.log("Mint Program:", mintProgram.programId.toBase58());

    await provider.connection.requestAirdrop(
      creator.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );

    await provider.connection.requestAirdrop(
      taker.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const programAccountInfo =
      await provider.connection.getParsedAccountInfo(
        mintProgram.programId
      );

    const parsed = (programAccountInfo.value?.data as any)?.parsed;
    programDataAccount = new anchor.web3.PublicKey(
      parsed.info.programData
    );
  });

  it("should load deployed programs", async () => {
    console.log("Escrow Program:", escrowProgram.programId.toBase58());
    console.log("Mint Program:", mintProgram.programId.toBase58());

    expect(escrowProgram.programId).toBeDefined();
    expect(mintProgram.programId).toBeDefined();
  });

  it("mint the nft", async () => {
    const whitelistedCreatorsPda =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("whitelist")],
        mintProgram.programId
      )[0];

    const collectionAuthorityPda =
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("collection_authority"),
          collection.publicKey.toBuffer(),
        ],
        mintProgram.programId
      )[0];

    if (!mintProgram.methods.whitelistCreator) {
      console.log("whitelistCreator not found");
      return;
    }

    try {
      const sig = await mintProgram.methods
        .whitelistCreator()
        .accountsStrict({
          payer: provider.wallet.publicKey,
          creator: creator.publicKey,
          whitelistedCreators: whitelistedCreatorsPda,
          systemProgram: SystemProgram.programId,
          thisProgram: mintProgram.programId,
          programData: programDataAccount,
        })
        .rpc();

      console.log(`sig ${sig}`);
    } catch (error: any) {
      console.error(`Oops, something went wrong: ${error}`);

      if (error.logs && Array.isArray(error.logs)) {
        console.log("Transaction Logs:");
        error.logs.forEach((log: string) =>
          console.log(log)
        );
      } else {
        console.log("No logs available in the error.");
      }
    }

    //@ts-ignore
    const whitelistedCreators =
    //@ts-ignore
      await mintProgram.account.whitelistedCreators.fetch(
        whitelistedCreatorsPda
      );

    console.log(
      `whitelistedCreators ${whitelistedCreators.creators}`
    );

    const creatorPubkeyStr =
      creator.publicKey.toString();

    let found = false;

    for (
      let i = 0;
      i < whitelistedCreators.creators.length;
      i++
    ) {
      if (
        whitelistedCreators.creators[i].toString() ===
        creatorPubkeyStr
      ) {
        found = true;
        break;
      }
    }

    expect(found).toBe(true);

    const args = {
      name: "Test Collection",
      uri: "https://devnet.irys.xyz/yourhashhere",
      nftName: "Test NFT",
      nftUri: "https://gateway.irys.xyz/yourhashhere",
    };

    if (!mintProgram.methods.createCollection) {
      console.log("createCollection not found");
      return;
    }

    try {
      const sig = await mintProgram.methods
        .createCollection(args)
        .accountsStrict({
          creator: creator.publicKey,
          collection: collection.publicKey,
          whitelistedCreators: whitelistedCreatorsPda,
          collectionAuthority: collectionAuthorityPda,
          coreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator, collection])
        .rpc();

      console.log(`sig ${sig}`);
    } catch (error: any) {
      console.error(`Oops, something went wrong: ${error}`);

      if (error.logs && Array.isArray(error.logs)) {
        console.log("Transaction Logs:");
        error.logs.forEach((log: string) =>
          console.log(log)
        );
      } else {
        console.log("No logs available in the error.");
      }
    }

    
    const collectionAuthority =
    //@ts-ignore
      await mintProgram.account.collectionAuthority.fetch(
        collectionAuthorityPda
      );

    expect(
      collectionAuthority.creator.toString()
    ).toBe(creator.publicKey.toString());

    expect(
      collectionAuthority.collection.toString()
    ).toBe(collection.publicKey.toString());

    expect(collectionAuthority.nftName).toBe(
      args.nftName
    );

    expect(collectionAuthority.nftUri).toBe(
      args.nftUri
    );

    if (!mintProgram.methods.mintNft) {
      console.log("mintNft not found");
      return;
    }

    await mintProgram.methods
      .mintNft()
      .accountsStrict({
        minter: creator.publicKey,
        asset: mintToken.publicKey,
        collection: collection.publicKey,
        collectionAuthority: collectionAuthorityPda,
        coreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([mintToken, creator])
      .rpc();
  });

  it("escrow the nft", async () => {
    if (!escrowProgram.methods.make) {
      console.log("make not found");
      return;
    }

    try {
      await escrowProgram.methods
        .make("escrow", new anchor.BN(1))
        .accountsStrict({
          maker: creator.publicKey,
          nftMint: mintToken.publicKey,
          makerAta: creatorAta,
          tokenProgram: MPL_CORE_PROGRAM_ID,
          systemProgram:
            anchor.web3.SystemProgram.programId,
          associatedTokenProgram:
            MPL_CORE_PROGRAM_ID,
          vault: vault,
          escrow: escrowPda,
        })
        .rpc();
    } catch (error: any) {
      console.error(`Oops, something went wrong: ${error}`);

      if (error.logs && Array.isArray(error.logs)) {
        console.log("Transaction Logs:");
        error.logs.forEach((log: string) =>
          console.log(log)
        );
      } else {
        console.log("No logs available in the error.");
      }
    }
  });
});