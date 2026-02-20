use anchor_lang::prelude::*;

declare_id!("8YaictS2mS1cUFR4dqk84Lz5QYwRBc2vxbwxEFH2EK6M");

#[program]
pub mod escrow_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
