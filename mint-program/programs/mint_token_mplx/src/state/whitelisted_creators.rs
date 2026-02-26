use anchor_lang::prelude::*;

use crate::error::MPLXCoreError;

#[account]
#[derive(InitSpace)]
pub struct WhitelistedCreators {
    pub creators: [Pubkey; 10],
    pub num_creators: u8,
    pub bump: u8,
}

impl WhitelistedCreators {
    pub fn contains(&self, creator: &AccountInfo) -> bool {
        //[1..n] this is a good slicing technique to only check the portion of the array that has
        //been filled with whitelisted creators, instead of checking the entire array which may
        //contain default values (Pubkey::default()) that could match the creator's key and give a
        //false positive.
        self.creators[..self.num_creators as usize].contains(creator.key)
    }

    pub fn whitelist_creator(&mut self, creator: &AccountInfo) -> Result<()> {
        // Check if the array is full
        // This error macro here is provided by Anchor and allows us to return a custom error
        // defined in our MPLXCoreError enum.
        if self.num_creators as usize >= self.creators.len() {
            return err!(MPLXCoreError::CreatorListFull);
        }

        // Check if already whitelisted
        if self.contains(creator) {
            return err!(MPLXCoreError::CreatorAlreadyWhitelisted);
        }

        // Add the creator at the current num_creators index
        self.creators[self.num_creators as usize] = creator.key();
        self.num_creators += 1;
        Ok(())
    }
}
