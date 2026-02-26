use anchor_lang::prelude::*;
use mpl_core::{instructions::UpdateV1CpiBuilder, ID as CORE_PROGRAM_ID};

use crate::{error::MPLXCoreError, state::CollectionAuthority};

#[derive(Accounts)]
pub struct UpdateNft<'info> {
    /// The collection creator who has authority to update
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The NFT asset to update
    #[account(mut)]
    /// CHECK: Verified by Metaplex Core CPI
    pub asset: UncheckedAccount<'info>,

    /// The collection this NFT belongs to
    #[account(
        mut,
        constraint = collection.owner == &CORE_PROGRAM_ID @ MPLXCoreError::InvalidCollection,
    )]
    /// CHECK: Verified by Metaplex Core CPI
    pub collection: UncheckedAccount<'info>,

    /// The PDA that acts as the update authority for all NFTs in this collection
    #[account(
        seeds = [b"collection_authority", collection.key().as_ref()],
        bump = collection_authority.bump,
        constraint = collection_authority.creator == authority.key() @ MPLXCoreError::NotAuthorized,
    )]
    pub collection_authority: Account<'info, CollectionAuthority>,

    /// Metaplex Core program
    #[account(address = CORE_PROGRAM_ID)]
    /// CHECK: Metaplex Core program
    pub core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> UpdateNft<'info> {
    //Here we are basically updating the name of the nft.
    //And the collection authority pda is our signer.
    pub fn update_nft(&mut self, new_name: String) -> Result<()> {
        // Create signer seeds for the collection authority PDA
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"collection_authority",
            &self.collection.key().to_bytes(),
            &[self.collection_authority.bump],
        ]];

        // Build the update CPI
        UpdateV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .authority(Some(&self.collection_authority.to_account_info()))
            .payer(&self.authority.to_account_info())
            .system_program(&self.system_program.to_account_info())
            .new_name(new_name)
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}
