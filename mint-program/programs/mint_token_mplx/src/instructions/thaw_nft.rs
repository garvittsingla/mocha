use anchor_lang::prelude::*;
use mpl_core::{
    instructions::UpdatePluginV1CpiBuilder,
    types::{FreezeDelegate, Plugin},
    ID as CORE_PROGRAM_ID,
};

use crate::{error::MPLXCoreError, state::CollectionAuthority};

#[derive(Accounts)]
pub struct ThawNft<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    //clearly shows that the owner of the collection is the metaplex core program, and this will be
    //checked by core CPI as well. So we can be sure that the collection is valid.
    #[account(mut,
        constraint = collection.owner == &CORE_PROGRAM_ID @ MPLXCoreError::InvalidCollection,
    )]
    /// CHECK: Will be checked by core CPI - owner must be the MPL Core program
    pub collection: UncheckedAccount<'info>,
    #[account(
        seeds = [b"collection_authority", collection.key().as_ref()],
        bump = collection_authority.bump,
        constraint = collection_authority.creator == payer.key() @ MPLXCoreError::NotAuthorized,
    )]
    pub collection_authority: Account<'info, CollectionAuthority>,
    #[account(mut)]
    /// CHECK: Verified by MPL Core CPI
    pub asset: UncheckedAccount<'info>,

    #[account(address = CORE_PROGRAM_ID)]
    /// CHECK: Address is constrained to the MPL Core program ID
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> ThawNft<'info> {
    pub fn thaw_nft(&mut self) -> Result<()> {
        let seeds: &[&[&[u8]]] = &[&[
            b"collection_authority",
            &self.collection.key().to_bytes(),
            &[self.collection_authority.bump],
        ]];

        UpdatePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .authority(Some(&self.collection_authority.to_account_info()))
            .payer(&self.payer.to_account_info())
            .system_program(&self.system_program.to_account_info())
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
            .invoke_signed(seeds)?;
        Ok(())
    }
}
