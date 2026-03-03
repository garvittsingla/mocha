use crate::{error::MPLXCoreError, program::MintTokenMplx, state::WhitelistedCreators};
use anchor_lang::prelude::*;

#[derive(Accounts)]
//The goal here is that this instruction should allow us
//i.e the ones who deployed this program to add creators to the whitelist, so that only those
//creators can be used in the minting process of the candy machine.
pub struct WhitelistCreator<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    //UncheckedAccount means that the Account can be any type of account, and we won't be doing any
    //checks on it in this instruction.
    /// CHECK should be a keypair
    pub creator: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        space = WhitelistedCreators::DISCRIMINATOR.len() + WhitelistedCreators::INIT_SPACE,
        seeds = [b"whitelist"],
        bump,
    )]
    pub whitelisted_creators: Account<'info, WhitelistedCreators>,
    pub system_program: Program<'info, System>,
    //Here we are checking that the program data account associated with this program is the one
    //being passed in, to ensure that only the program update authority can add creators to the
    //whitelist.
    #[account(constraint = this_program.programdata_address()? == Some(program_data.key()))]
    pub this_program: Program<'info, MintTokenMplx>,
    // Making sure only the program update authority can add creators to the array
    #[account(constraint = program_data.upgrade_authority_address == Some(payer.key()) @ MPLXCoreError::NotAuthorized)]
    pub program_data: Account<'info, ProgramData>,
}

impl<'info> WhitelistCreator<'info> {
    pub fn whitelist_creator(&mut self) -> Result<()> {
        //using the already defined function in the WhitelistedCreators struct to add the creator
        //to the whitelist
        self.whitelisted_creators.whitelist_creator(&self.creator)
    }
}
