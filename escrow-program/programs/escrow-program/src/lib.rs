use anchor_lang::prelude::*;

pub mod state;

pub mod instructions;
use instructions::*;

declare_id!("8YaictS2mS1cUFR4dqk84Lz5QYwRBc2vxbwxEFH2EK6M");

#[program]
pub mod escrow_program {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, price: u64) -> Result<()> {
        ctx.accounts.init(seed, price, &ctx.bumps);
        Ok(())

    }
    pub fn refund(ctx: Context<Refund>, seed: u64) -> Result<()> {
        ctx.accounts.refund(seed);
        Ok(())
    }

    pub fn take(ctx: Context<Take>, seed: u64) -> Result<()> {
        ctx.accounts.take(seed);
        Ok(())
    }
}