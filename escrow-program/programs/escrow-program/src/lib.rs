use anchor_lang::prelude::*;

pub mod state;

pub mod instructions;
use instructions::*;

pub mod errors;

declare_id!("FaS8ZHPZvJ9bCYRVSSPnDcPtmVaQMV6MVDUimqwobbeN");

#[program]
pub mod escrow_program {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, price: u64) -> Result<()> {
        ctx.accounts.init(seed, price, &ctx.bumps)?;
        Ok(())
    }
    pub fn refund(ctx: Context<Refund>, _seed: u64) -> Result<()> {
        ctx.accounts.refund(&ctx.bumps)?;
        Ok(())
    }

    pub fn take(ctx: Context<Take>, _seed: u64) -> Result<()> {
        ctx.accounts.take(&ctx.bumps)?;
        Ok(())
    }
}
