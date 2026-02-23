use anchor_lang::prelude::*;

pub mod state;
use state::escrow::Escrow;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info>{
   #[account(mut)]
   pub maker : Signer<'info>,
  #[account(
    mint::decimals = 0,
    mint::token_program = token_program
  )]
   pub nft_mint : InterfaceAccount<'info,Mint>,
   #[account(
    mut,
    associated_token::mint = nft_mint,
    associated_token::authority = maker,
    token::token_program = token_program
   )]
   pub maker_ata : InterfaceAccount<'info,TokenAccount>,

   pub token_program : Program<'info,TokenInterface>,
   pub system_program : Program<'info,System>,
  pub associated_token_program : Program<'info,AssociatedToken>,

     #[account(
        init,
        payer = maker,
        associated_token::mint = nft_mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = maker,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        space = Escrow::DISCRIMINATOR.len() + Escrow::INIT_SPACE,
        bump
    )]
    pub escrow: Account<'info, Escrow>,


}

impl<'info> Make<'info>{
   pub fn init(&mut self,seed : u64, price : u64,bumps:&MakeBumps) -> Result<()>{
        self.escrow.set_inner(Escrow{
            seed,
            maker : self.maker.key(),
            mint_nft : self.nft_mint.key(),
            price,
            bump
        });
        let cpi_accounts = TransferChecked {
            from: self.maker_ata.to_account_info(),
            mint: self.nft_mint.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.maker.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            cpi_accounts,
        );

        
        transfer_checked(cpi_ctx, 1, 0)?;

       
        Ok(())

        

   }
}