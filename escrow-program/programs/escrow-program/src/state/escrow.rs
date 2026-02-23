use anchor_lang::prelude::*;

#[derive(InitSpace)]
#[account]
pub struct Escrow {
    pub seed: u64, // one user can have more than 1 nft to sell, so we need a seed to distinguish them
    pub maker: Pubkey, // the user who wants to sell the nft
    pub mint_nft: Pubkey, // the mint address of the nft
    pub price: u64, // the price of the nft in lamports
    pub bump: u8,  // the bump seed for the PDA
}
