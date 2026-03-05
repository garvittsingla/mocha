import * as anchor from "@coral-xyz/anchor";
import { Program, type Idl } from "@coral-xyz/anchor";
import escrowIdl from "./escrow_program.json";
import mintIdl from "./mint_token_mplx.json";
import { expect, describe, it, beforeAll } from "bun:test";
import axios from "axios";
import { SystemProgram } from "@solana/web3.js";
import { MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import checkEligibility from "./test_helpers";
import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";

const img_path1 = "./assets/elonshoecook.jpg"
const img_path2 = "./assets/elonshoeplay.jpg"
interface ResponseType {
    success: boolean,
    message: string
}

const USE_REAL_UPLOADS = false; // Set to true for Devnet/Mainnet, false for Localnet

describe("deployed programs", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const escrowProgram = new Program(escrowIdl as Idl, provider);
  const mintProgram = new Program(mintIdl as Idl, provider);

  const creator = anchor.web3.Keypair.generate();
  const taker = anchor.web3.Keypair.generate();
  const collection = anchor.web3.Keypair.generate();

  let mintToken = anchor.web3.Keypair.generate();

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


  it("Happy path mint the nft", async () => {
    // 1. Check eligibility
    const result_json: ResponseType | null = await checkEligibility(
      creator.publicKey.toString(),
      img_path1
    );

    if (result_json == null || !result_json.success) {
      console.log("Creator not eligible, skipping happy path test.");
      return;
    }

    let nfturi: string | undefined;
    let collectionUri: string | undefined;

    if (USE_REAL_UPLOADS) {
      // 2. Upload NFT image and collection image to Irys
      const getIrysUploader = async () => {
        return await Uploader(Solana).withWallet(creator.secretKey);
      };
      const irys = await getIrysUploader();

      // Upload NFT image (img_path1 passed eligibility check)
      try {
        const nftFile = Bun.file(img_path1);
        const nftTags = [{ name: "Content-Type", value: nftFile.type }];
        const nftResponse = await irys.uploadFile(img_path1, { tags: nftTags });
        nfturi = `https://gateway.irys.xyz/${nftResponse.id}`;
        console.log(`NFT image uploaded ==> ${nfturi}`);
      } catch (e) {
        console.log("Error uploading NFT image:", e);
      }

      // Upload collection image (img_path2 used as the collection cover)
      try {
        const collectionFile = Bun.file(img_path2);
        const collectionTags = [{ name: "Content-Type", value: collectionFile.type }];
        const collectionResponse = await irys.uploadFile(img_path2, { tags: collectionTags });
        collectionUri = `https://gateway.irys.xyz/${collectionResponse.id}`;
        console.log(`Collection image uploaded ==> ${collectionUri}`);
      } catch (e) {
        console.log("Error uploading collection image:", e);
      }
    } else {
      console.log("Localnet mode: Using dummy URIs for NFT and Collection.");
      nfturi = "https://example.com/mock-nft.json";
      collectionUri = "https://example.com/mock-collection.json";
    }

    if (!nfturi || !collectionUri) {
      console.log("Upload(s) failed or mock URIs missing, skipping rest of happy path test.");
      return;
    }

    // 3. Derive PDAs
    const whitelistedCreatorsPda = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist")],
      mintProgram.programId
    )[0];

    const collectionAuthorityPda = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("collection_authority"), collection.publicKey.toBuffer()],
      mintProgram.programId
    )[0];

    // 4. Whitelist the creator
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
      console.log(`whitelistCreator sig: ${sig}`);
    } catch (error: any) {
      console.error(`whitelistCreator failed: ${error}`);
      if (error.logs && Array.isArray(error.logs)) {
        error.logs.forEach((log: string) => console.log(log));
      }
    }

    // 5. Create collection using the uploaded URIs
    const collectionArgs = {
      name: "Elon Collection",
      uri: collectionUri,
      nftName: "Elon Shoe Cooking",
      nftUri: nfturi,
    };

    try {
      if (!mintProgram.methods.createCollection) {
        console.log("createCollection not found");
        return;
      }
      const sig = await mintProgram.methods
        .createCollection(collectionArgs)
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
      console.log(`createCollection sig: ${sig}`);
    } catch (error: any) {
      console.error(`createCollection failed: ${error}`);
      if (error.logs && Array.isArray(error.logs)) {
        error.logs.forEach((log: string) => console.log(log));
      }
    }

    // 6. Mint the NFT
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

    console.log("NFT minted successfully in happy path!");
    console.log("Creator PK:", creator.publicKey.toBase58());
    console.log("Collection PK:", collection.publicKey.toBase58());
    console.log("Mint Token PK:", mintToken.publicKey.toBase58());
    console.log("Taker PK:", taker.publicKey.toBase58());

    // ─────────────────────────────────────────────────────────────────
    // ESCROW FLOW: creator lists the NFT → taker buys it
    // ─────────────────────────────────────────────────────────────────

    // 7. Derive escrow PDAs
    // seed is an arbitrary u64 that uniquely identifies this listing
    const escrowSeed = new anchor.BN(42);
    const nftPrice = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL); // 0.1 SOL

    const [escrowPdaHappy] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        creator.publicKey.toBuffer(),
        escrowSeed.toArrayLike(Buffer, "le", 8), // u64 little-endian
      ],
      escrowProgram.programId
    );

    const [vaultPdaHappy] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowPdaHappy.toBuffer()],
      escrowProgram.programId
    );

    console.log("Escrow PDA:", escrowPdaHappy.toBase58());
    console.log("Vault PDA:", vaultPdaHappy.toBase58());

    // 7.5. Thaw the NFT before listing — mintNft applies a FreezeDelegate plugin
    //      so only the collectionAuthority PDA can move it. We must thaw first.
    try {
      //@ts-ignore
      const thawSig = await mintProgram.methods
        .thawNft()
        .accountsStrict({
          payer: creator.publicKey,
          collection: collection.publicKey,
          collectionAuthority: collectionAuthorityPda,
          asset: mintToken.publicKey,
          coreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      console.log("NFT thawed! sig:", thawSig);
    } catch (err: any) {
      console.error("thawNft failed:", err);
      if (err.logs) err.logs.forEach((l: string) => console.log(l));
      return;
    }

    // 8. Creator calls `make` — transfers NFT ownership to vault PDA
    //    and stores price + metadata in the escrow account
    if (!escrowProgram.methods.make) {
      console.log("make not found");
      return;
    }


    const makeSig = await escrowProgram.methods
      .make(escrowSeed, nftPrice)
      .accountsStrict({
        maker: creator.publicKey,
        asset: mintToken.publicKey,   // the Core NFT asset keypair
        collection: collection.publicKey,
        vault: vaultPdaHappy,
        escrow: escrowPdaHappy,
        coreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    await provider.connection.confirmTransaction(makeSig, "confirmed");
    console.log("NFT listed in escrow! sig:", makeSig);

    // Verify escrow account state
    //@ts-ignore
    const escrowAccount = await escrowProgram.account.escrow.fetch(escrowPdaHappy);
    expect(escrowAccount.maker.toBase58()).toBe(creator.publicKey.toBase58());
    expect(escrowAccount.mintNft.toBase58()).toBe(mintToken.publicKey.toBase58());
    expect(escrowAccount.price.toNumber()).toBe(nftPrice.toNumber());
    console.log(
      `Escrow state — maker: ${escrowAccount.maker.toBase58()}, price: ${escrowAccount.price.toNumber()} lamports`
    );

    // 9. Capture balances before the take so we can assert SOL flow
    const takerBalanceBefore = await provider.connection.getBalance(taker.publicKey);
    const makerBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    console.log(`Taker balance before take: ${takerBalanceBefore / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`Maker balance before take: ${makerBalanceBefore / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    // 10. Taker calls `take` — pays SOL to maker, receives NFT from vault
    //     The escrow account is closed and rent returned to maker
    if (!escrowProgram.methods.take) {
      console.log("take not found");
      return;
    }

    const takeSig = await escrowProgram.methods
      .take(escrowSeed)
      .accountsStrict({
        taker: taker.publicKey,
        maker: creator.publicKey,
        asset: mintToken.publicKey,
        collection: collection.publicKey,
        vault: vaultPdaHappy,
        escrow: escrowPdaHappy,
        coreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    await provider.connection.confirmTransaction(takeSig, "confirmed");
    console.log("NFT purchased by taker via escrow! sig:", takeSig);

    // 11. Escrow account should be closed (lamports returned to maker)
    const escrowInfoAfterTake = await provider.connection.getAccountInfo(escrowPdaHappy);
    expect(escrowInfoAfterTake).toBeNull();

    // 12. Assert SOL moved from taker to maker
    const takerBalanceAfter = await provider.connection.getBalance(taker.publicKey);
    const makerBalanceAfter = await provider.connection.getBalance(creator.publicKey);

    // Taker paid at least the NFT price (plus tx fees on top)
    expect(takerBalanceBefore - takerBalanceAfter).toBeGreaterThanOrEqual(nftPrice.toNumber());
    // Maker received at least the NFT price
    expect(makerBalanceAfter - makerBalanceBefore).toBeGreaterThanOrEqual(nftPrice.toNumber());

    console.log(
      `Maker received: ${(makerBalanceAfter - makerBalanceBefore) / anchor.web3.LAMPORTS_PER_SOL} SOL`
    );
    console.log("Happy path complete: mint → list → buy ✓");
  });

  // it("mint the nft", async () => {
  //     const whitelistedCreatorsPda =
  //       anchor.web3.PublicKey.findProgramAddressSync(
  //         [Buffer.from("whitelist")],
  //         mintProgram.programId
  //       )[0];

  //     const collectionAuthorityPda =
  //       anchor.web3.PublicKey.findProgramAddressSync(
  //         [
  //           Buffer.from("collection_authority"),
  //           collection.publicKey.toBuffer(),
  //         ],
  //         mintProgram.programId
  //       )[0];

  //     if (!mintProgram.methods.whitelistCreator) {
  //       console.log("whitelistCreator not found");
  //       return;
  //     }

  //     try {
  //       const sig = await mintProgram.methods
  //         .whitelistCreator()
  //         .accountsStrict({
  //           payer: provider.wallet.publicKey,
  //           creator: creator.publicKey,
  //           whitelistedCreators: whitelistedCreatorsPda,
  //           systemProgram: SystemProgram.programId,
  //           thisProgram: mintProgram.programId,
  //           programData: programDataAccount,
  //         })
  //         .rpc();

  //       console.log(`sig ${sig}`);
  //     } catch (error: any) {
  //       console.error(`Oops, something went wrong: ${error}`);

  //       if (error.logs && Array.isArray(error.logs)) {
  //         console.log("Transaction Logs:");
  //         error.logs.forEach((log: string) =>
  //           console.log(log)
  //         );
  //       } else {
  //         console.log("No logs available in the error.");
  //       }
  //     }

  //     //@ts-ignore
  //     const whitelistedCreators =
  //       //@ts-ignore
  //       await mintProgram.account.whitelistedCreators.fetch(
  //         whitelistedCreatorsPda
  //       );

  //     console.log(
  //       `whitelistedCreators ${whitelistedCreators.creators}`
  //     );

  //     const creatorPubkeyStr =
  //       creator.publicKey.toString();

  //     let found = false;

  //     for (
  //       let i = 0;
  //       i < whitelistedCreators.creators.length;
  //       i++
  //     ) {
  //       if (
  //         whitelistedCreators.creators[i].toString() ===
  //         creatorPubkeyStr
  //       ) {
  //         found = true;
  //         break;
  //       }
  //     }

  //     expect(found).toBe(true);

  //     const args = {
  //       name: "Elon Collection",
  //       uri: "https://devnet.irys.xyz/yourhashhere",
  //       nftName: "Test NFT",
  //       nftUri: "https://gateway.irys.xyz/yourhashhere",
  //     };

  //     if (!mintProgram.methods.createCollection) {
  //       console.log("createCollection not found");
  //       return;
  //     }

  //     try {
  //       const sig = await mintProgram.methods
  //         .createCollection(args)
  //         .accountsStrict({
  //           creator: creator.publicKey,
  //           collection: collection.publicKey,
  //           whitelistedCreators: whitelistedCreatorsPda,
  //           collectionAuthority: collectionAuthorityPda,
  //           coreProgram: MPL_CORE_PROGRAM_ID,
  //           systemProgram: SystemProgram.programId,
  //         })
  //         .signers([creator, collection])
  //         .rpc();

  //       console.log(`sig ${sig}`);
  //     } catch (error: any) {
  //       console.error(`Oops, something went wrong: ${error}`);

  //       if (error.logs && Array.isArray(error.logs)) {
  //         console.log("Transaction Logs:");
  //         error.logs.forEach((log: string) =>
  //           console.log(log)
  //         );
  //       } else {
  //         console.log("No logs available in the error.");
  //       }
  //     }


  //     const collectionAuthority =
  //       //@ts-ignore
  //       await mintProgram.account.collectionAuthority.fetch(
  //         collectionAuthorityPda
  //       );

  //     expect(
  //       collectionAuthority.creator.toString()
  //     ).toBe(creator.publicKey.toString());

  //     expect(
  //       collectionAuthority.collection.toString()
  //     ).toBe(collection.publicKey.toString());

  //     expect(collectionAuthority.nftName).toBe(
  //       args.nftName
  //     );

  //     expect(collectionAuthority.nftUri).toBe(
  //       args.nftUri
  //     );

  //     if (!mintProgram.methods.mintNft) {
  //       console.log("mintNft not found");
  //       return;
  //     }

  //     await mintProgram.methods
  //       .mintNft()
  //       .accountsStrict({
  //         minter: creator.publicKey,
  //         asset: mintToken.publicKey,
  //         collection: collection.publicKey,
  //         collectionAuthority: collectionAuthorityPda,
  //         coreProgram: MPL_CORE_PROGRAM_ID,
  //         systemProgram: SystemProgram.programId,
  //       })
  //       .signers([mintToken, creator])
  //       .rpc();
  //   });

  // it("escrow the nft", async () => {
  //   if (!escrowProgram.methods.make) {
  //     console.log("make not found");
  //     return;
  //   }

  //   try {
  //     await escrowProgram.methods
  //       .make("escrow", new anchor.BN(1))
  //       .accountsStrict({
  //         maker: creator.publicKey,
  //         nftMint: mintToken.publicKey,
  //         makerAta: creatorAta,
  //         tokenProgram: MPL_CORE_PROGRAM_ID,
  //         systemProgram:
  //           anchor.web3.SystemProgram.programId,
  //         associatedTokenProgram:
  //           MPL_CORE_PROGRAM_ID,
  //         vault: vault,
  //         escrow: escrowPda,
  //       })
  //       .rpc();
  //   } catch (error: any) {
  //     console.error(`Oops, something went wrong: ${error}`);

  //     if (error.logs && Array.isArray(error.logs)) {
  //       console.log("Transaction Logs:");
  //       error.logs.forEach((log: string) =>
  //         console.log(log)
  //       );
  //     } else {
  //       console.log("No logs available in the error.");
  //     }
  //   }
  // });
});
