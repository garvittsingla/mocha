#!/bin/bash

echo "Deploying programs..."

echo "deploy escrow program"
solana program deploy ./escrow_program.so --program-id escrow_program-keypair.json
echo "deployed escrow program"

echo "deploy mint program"
solana program deploy ./mint_program.so --program-id mint_program-keypair.json
echo "deployed mint program"

bun test --timeout 300000