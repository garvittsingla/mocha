use anchor_lang::prelude::*;

declare_id!("8r1y3F7F7RVfRUNeh6tA7MLDrCdCKZL6Y2GYozqa81WL");

#[program]
pub mod mint_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
