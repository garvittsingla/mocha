import * as anchor from "@coral-xyz/anchor";
import { Program, type Idl } from "@coral-xyz/anchor";
import escrowIdl from "./escrow_program.json";
import mintIdl from "./mint_token_mplx.json";
import { expect, describe, it, beforeAll } from "bun:test";
import axios from "axios";
import { Connection, Keypair, SystemProgram } from "@solana/web3.js";
import { MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";
import checkEligibility from "./test_helpers";
import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const img_path1 = "./assets/elonshoecook.jpg"
const img_path2 = "./assets/elonshoeplay.jpg"
interface ResponseType {
    success: boolean,
    message: string
}

const USE_REAL_UPLOADS = true; // Devnet — real Irys uploads enabled

// Creator is the Solana CLI wallet
const creatorSecret: number[] = JSON.parse(
  readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf-8")
);
const creator = Keypair.fromSecretKey(Uint8Array.from(creatorSecret));

// Taker, collection, mintToken are loaded from accounts.json (created by airdropping.ts)
const ACCOUNTS_FILE = join(import.meta.dir, "accounts.json");
if (!existsSync(ACCOUNTS_FILE)) {
  throw new Error(
    "accounts.json not found — run `bun run airdropping.ts` first to bootstrap devnet accounts"
  );
}
const stored: Record<string, number[]> = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf-8"));
const taker      = Keypair.fromSecretKey(Uint8Array.from(stored["taker"]!));
const collection = Keypair.fromSecretKey(Uint8Array.from(stored["collection"]!));
let mintToken    = Keypair.fromSecretKey(Uint8Array.from(stored["mintToken"]!));

const DEVNET_RPC = "https://api.devnet.solana.com";

describe("deployed programs", () => {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new anchor.Wallet(creator);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const escrowProgram = new Program(escrowIdl as Idl, provider);
  const mintProgram = new Program(mintIdl as Idl, provider);

  let programDataAccount: anchor.web3.PublicKey;

  beforeAll(async () => {
    console.log("Escrow Program:", escrowProgram.programId.toBase58());
    console.log("Mint Program:", mintProgram.programId.toBase58());
    console.log("Creator (CLI wallet):", creator.publicKey.toBase58());
    console.log("Taker:", taker.publicKey.toBase58());

    // No airdrop needed — creator is pre-funded manually;
    // taker is funded by airdropping.ts
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const programAccountInfo =
      await provider.connection.getParsedAccountInfo(
        mintProgram.programId
      );

    const parsed = (programAccountInfo.value?.data as any)?.parsed;
    if (!parsed?.info?.programData) {
      throw new Error(
        `Mint program (${mintProgram.programId.toBase58()}) is not deployed on devnet.\n` +
        `Run: solana program deploy ./mint_program.so --program-id mint_program-keypair.json --url devnet --with-compute-unit-price 5000`
      );
    }
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
      // Get irys Uploader for devnet.
      const getIrysUploader = async () => {
        return await Uploader(Solana)
          .devnet()
          .withRpc(DEVNET_RPC)
          .withWallet(creator.secretKey);
      };
      const irys = await getIrysUploader();

      let nftImageUrl: string | undefined;
      let collectionImageUrl: string | undefined;

      try {
        const nftFile = Bun.file(img_path1);
        const nftResponse = await irys.uploadFile(img_path1, {
          tags: [{ name: "Content-Type", value: nftFile.type }],
        });
        nftImageUrl = `https://gateway.irys.xyz/${nftResponse.id}`;
        console.log(`NFT image uploaded => ${nftImageUrl}`);
      } catch (e) {
        console.log("Error uploading NFT image:", e);
      }

      try {
        const collectionFile = Bun.file(img_path2);
        const collectionResponse = await irys.uploadFile(img_path2, {
          tags: [{ name: "Content-Type", value: collectionFile.type }],
        });
        collectionImageUrl = `https://gateway.irys.xyz/${collectionResponse.id}`;
        console.log(`Collection image uploaded => ${collectionImageUrl}`);
      } catch (e) {
        console.log("Error uploading collection image:", e);
      }

      // Build & upload Metaplex-standard metadata JSONs
      if (nftImageUrl) {
        try {
          const nftMetadata = {
            name: "Elon Shoe Cooking",
            symbol: "Elon",
            description: "Elon cooking some supper in his shoe",
            image: nftImageUrl,
            attributes: [],
            properties: {
              files: [{ uri: nftImageUrl, type: Bun.file(img_path1).type }],
              category: "image",
              creators: [{ address: creator.publicKey.toBase58(), share: 100 }],
            },
            creators: [{ address: creator.publicKey.toBase58(), share: 100, verified: false }],
          };
          const nftMetaBytes = Buffer.from(JSON.stringify(nftMetadata));
          const nftMetaResponse = await irys.upload(nftMetaBytes, {
            tags: [{ name: "Content-Type", value: "application/json" }],
          });
          nfturi = `https://gateway.irys.xyz/${nftMetaResponse.id}`;
          console.log(`NFT metadata JSON uploaded => ${nfturi}`);
        } catch (e) {
          console.log("Error uploading NFT metadata JSON:", e);
        }
      }

      if (collectionImageUrl) {
        try {
          const collectionMetadata = {
            name: "Elon Collection",
            symbol: "",
            description: "Collection of Elon shoe moments",
            image: collectionImageUrl,
            attributes: [],
            properties: {
              files: [{ uri: collectionImageUrl, type: Bun.file(img_path2).type }],
              category: "image",
              creators: [{ address: creator.publicKey.toBase58(), share: 100 }],
            },
            creators: [{ address: creator.publicKey.toBase58(), share: 100, verified: false }],
          };
          const collectionMetaBytes = Buffer.from(JSON.stringify(collectionMetadata));
          const collectionMetaResponse = await irys.upload(collectionMetaBytes, {
            tags: [{ name: "Content-Type", value: "application/json" }],
          });
          collectionUri = `https://gateway.irys.xyz/${collectionMetaResponse.id}`;
          console.log(`Collection metadata JSON uploaded => ${collectionUri}`);
        } catch (e) {
          console.log("Error uploading collection metadata JSON:", e);
        }
      }
    } else {
      console.log("Devnet mode (USE_REAL_UPLOADS=false): Using dummy URIs for NFT and Collection.");
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

    // Derive escrow PDAs
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

    //Thaw the NFT before listing, mintNft applies a FreezeDelegate plugin
    //so only the collectionAuthority PDA can move it. 
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

    //Creator calls make and transfers NFT ownership to vault PDA
    //and stores price + metadata in the escrow account
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

    //Capture balances before the take so we can assert SOL flow
    const takerBalanceBefore = await provider.connection.getBalance(taker.publicKey);
    const makerBalanceBefore = await provider.connection.getBalance(creator.publicKey);
    console.log(`Taker balance before take: ${takerBalanceBefore / anchor.web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`Maker balance before take: ${makerBalanceBefore / anchor.web3.LAMPORTS_PER_SOL} SOL`);

    //Taker calls take and pays SOL to maker, receives NFT from vault
    //The escrow account is closed and rent returned to maker
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

    //Escrow account should be closed and lamports will be returned to the maker.
    const escrowInfoAfterTake = await provider.connection.getAccountInfo(escrowPdaHappy);
    expect(escrowInfoAfterTake).toBeNull();

    const takerBalanceAfter = await provider.connection.getBalance(taker.publicKey);
    const makerBalanceAfter = await provider.connection.getBalance(creator.publicKey);

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
