use anchor_lang::prelude::*;

use crate::state::escrow::Escrow;

use mpl_core::{instructions::TransferV1CpiBuilder, ID as CORE_PROGRAM_ID};

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Refund<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mut)]
    /// CHECK: Validated by mpl-core CPI
    pub asset: UncheckedAccount<'info>,

    /// CHECK: Validated by mpl-core CPI. May be System Program for un-collected assets.
    pub collection: UncheckedAccount<'info>,

    /// CHECK: Vault PDA that currently owns the asset.
    #[account(
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        has_one = maker,
        close = maker,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(address = CORE_PROGRAM_ID)]
    /// CHECK: This is the mpl-core program
    pub core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Refund<'info> {
    pub fn refund(&mut self, bumps: &RefundBumps) -> Result<()> {
        // Vault PDA signs to transfer asset ownership back to maker
        let escrow_key = self.escrow.key();
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", escrow_key.as_ref(), &[bumps.vault]]];

        let collection_info = self.collection.to_account_info();
        let collection_arg = if self.collection.key() == self.system_program.key() {
            None
        } else {
            Some(&collection_info)
        };

        TransferV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(collection_arg)
            .payer(&self.maker.to_account_info())
            .authority(Some(&self.vault.to_account_info()))
            .new_owner(&self.maker.to_account_info())
            .system_program(Some(&self.system_program.to_account_info()))
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}
