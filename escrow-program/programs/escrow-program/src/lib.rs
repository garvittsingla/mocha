use anchor_lang::prelude::*;

pub mod state;

pub mod instructions;
use instructions::*;

pub mod errors;


declare_id!("DcniW2k5mDoDzKqzoTRxfQeTyqwQgnRWfWBXoV4GTznj");


#[program]
pub mod escrow_program {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, price: u64) -> Result<()> {
        ctx.accounts.init(seed, price, &ctx.bumps)?;
        Ok(())

    }
    pub fn refund(ctx: Context<Refund>, seed: u64) -> Result<()> {
        ctx.accounts.refund(seed)?;
        Ok(())
    }

    pub fn take(ctx: Context<Take>, seed: u64) -> Result<()> {
        ctx.accounts.take(seed)?;
        Ok(())
    }
}
