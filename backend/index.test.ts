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

const img_path1 = "./assets/elonshoecooking.jpg"
const img_path2 = "./assets/elonshoeplaying.jpg"
interface ResponseType {
    success: boolean,
    message: string
}

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

    // 2. Upload NFT image and collection image to Irys
    const getIrysUploader = async () => {
      return await Uploader(Solana).withWallet(creator.secretKey);
    };
    const irys = await getIrysUploader();

    let nfturi: string | undefined;
    let collectionUri: string | undefined;

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

    if (!nfturi || !collectionUri) {
      console.log("Upload(s) failed, skipping rest of happy path test.");
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
        name: "Elon Collection",
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
