use anchor_lang::prelude::*;

use crate::state::escrow::Escrow;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        Mint, TokenAccount, TokenInterface, TransferChecked,transfer_checked,CloseAccount,close_account
    }
};


#[derive(Accounts)]
#[instruction(seed:u64)]
pub struct Refund<'info>{
    #[account(mut)]
    pub maker : Signer<'info>,
    #[account(
        associated_token::mint = nft_mint,
        associated_token::authority = escrow,
        token::token_program = token_program
    )]
    pub vault : InterfaceAccount<'info,TokenAccount>,
    #[account(
        mut,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
    )]
    #[account(
    mint::decimals = 0,
    mint::token_program = token_program
    )]
    pub nft_mint : InterfaceAccount<'info,Mint>,
    #[account(
        mut,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
        close = maker
    )]
    pub escrow : Account<'info,Escrow>,
    #[account(
        associated_token::mint = nft_mint,
        associated_token::authority = maker,
        token::token_program = token_program
    )]
    pub maker_ata : InterfaceAccount<'info,TokenAccount>,

    pub token_program : Interface<'info,TokenInterface>,
    pub system_program : Program<'info,System>,
    pub associated_token_program : Program<'info,AssociatedToken>
    

}
impl<'info> Refund<'info>{
    pub fn refund(&mut self,seed : u64) -> Result<()>{
        let cpi_accounts =TransferChecked{
            from : self.vault.to_account_info(),
            to : self.maker_ata.to_account_info(),
            mint : self.nft_mint.to_account_info(),
            authority : self.escrow.to_account_info(),
           
        };

        let signer_seeds : &[&[&[u8]]] = &[&[
            b"escrow",
            self.maker.to_account_info().key.as_ref(),
            &self.escrow.seed.to_le_bytes(),
            &[self.escrow.bump],
        ]];
        let cpi_ctx = CpiContext::new_with_signer(self.token_program.to_account_info(),cpi_accounts,signer_seeds);
        
        transfer_checked(cpi_ctx, 1, 0)?;

        let close_accounts = CloseAccount{
            account : self.vault.to_account_info(),
            destination : self.maker.to_account_info(),
            authority : self.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(self.token_program.to_account_info(),close_accounts,signer_seeds);
        close_account(cpi_ctx)?;
        Ok(())
    }
}