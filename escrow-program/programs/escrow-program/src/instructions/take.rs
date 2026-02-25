use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::state::escrow::Escrow;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};

#[derive(Accounts)]
#[instruction(seed:u64)]
pub struct Take<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,
    pub nft_mint: InterfaceAccount<'info, Mint>,
    pub maker: SystemAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = escrow,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = nft_mint,
        associated_token::authority = taker,
        token::token_program = token_program
    )]
    pub taker_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        has_one = maker,
        close = maker,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

impl<'info> Take<'info> {
    pub fn take(&mut self, seed: u64) -> Result<()> {
        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            to: self.taker_ata.to_account_info(),
            mint: self.nft_mint.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow",
            self.maker.to_account_info().key.as_ref(),
            &self.escrow.seed.to_le_bytes(),
            &[self.escrow.bump],
        ]];
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );

        transfer_checked(cpi_ctx, 1, 0)?;

        //tranfer money back to maker
        let fee_transfer_cpi_context = CpiContext::new(
            self.system_program.to_account_info(),
            Transfer {
                from: self.taker.to_account_info(),
                to: self.maker.to_account_info(),
            },
        );
        transfer(fee_transfer_cpi_context, self.escrow.price)?;

        let close_accounts = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            close_accounts,
            signer_seeds,
        );
        close_account(cpi_ctx)?;
        Ok(())
    }
}
