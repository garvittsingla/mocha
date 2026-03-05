use anchor_lang::prelude::*;

use crate::state::escrow::Escrow;

use mpl_core::{instructions::TransferV1CpiBuilder, ID as CORE_PROGRAM_ID};

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mut)]
    /// CHECK: Validated by mpl-core CPI
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Validated by mpl-core CPI. May be System Program for un-collected assets.
    pub collection: UncheckedAccount<'info>,

    /// CHECK: This is the vault PDA that will become the new owner of the asset.
    /// It doesn't need to be initialized — it's just a signing authority PDA.
    #[account(
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        init,
        payer = maker,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        space = Escrow::DISCRIMINATOR.len() + Escrow::INIT_SPACE,
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(address = CORE_PROGRAM_ID)]
    /// CHECK: This is the mpl-core program
    pub core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Make<'info> {
    pub fn init(&mut self, seed: u64, price: u64, bumps: &MakeBumps) -> Result<()> {
        self.escrow.set_inner(Escrow {
            seed,
            maker: self.maker.key(),
            mint_nft: self.asset.key(),
            price,
            bump: bumps.escrow,
        });

        let collection_info = self.collection.to_account_info();
        let collection_arg = if self.collection.key() == self.system_program.key() {
            None
        } else {
            Some(&collection_info)
        };

        msg!(
            "CPI TransferV1: asset={}, owner={}, new_owner={}",
            self.asset.key(),
            self.maker.key(),
            self.vault.key()
        );

        // Transfer asset ownership: maker → vault PDA
        TransferV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(collection_arg)
            .payer(&self.maker.to_account_info())
            .authority(None)
            .new_owner(&self.vault.to_account_info())
            .system_program(Some(&self.system_program.to_account_info()))
            .invoke()?;

        msg!("CPI TransferV1 success!");

        Ok(())
    }
}
