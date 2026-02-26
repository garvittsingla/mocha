use anchor_lang::prelude::*;
use mpl_core::{
    instructions::UpdatePluginV1CpiBuilder,
    types::{FreezeDelegate, Plugin},
    ID as CORE_PROGRAM_ID,
};

use crate::{
    error::MPLXCoreError,
    state::{CollectionAuthority},
};

// #[derive(Accounts)]
// pub struct FreezeNft<'info> {
//    // TODO
// }

// impl<'info> FreezeNft<'info> {
//     pub fn freeze_nft(&mut self) -> Result<()> {
//         // TODO
//         Ok(())
//     }
// }

#[derive(Accounts)]
pub struct FreezeNft<'info> {
    // TODO
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    /// CHECK: Verified by Metaplex Core CPI
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = collection.owner == &CORE_PROGRAM_ID @ MPLXCoreError::InvalidCollection,
    )]
    /// CHECK: Verified by Metaplex Core CPI
    pub collection: UncheckedAccount<'info>,
    #[account(
        seeds = [b"collection_authority", collection.key().as_ref()],
        bump = collection_authority.bump,
        constraint = collection_authority.creator == payer.key() @ MPLXCoreError::NotAuthorized,
    )]
    pub collection_authority: Account<'info, CollectionAuthority>,

    #[account(address = CORE_PROGRAM_ID)]
    /// CHECK: Metaplex Core program
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> FreezeNft<'info> {
    pub fn freeze_nft(&mut self) -> Result<()> {
        // TODO
        let signer_seeds: &[&[&[u8]]] = &[&[
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
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: true }))
            .invoke_signed(signer_seeds)?;
        
        Ok(())
    }
}
