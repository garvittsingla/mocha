#!/bin/bash

# 1. Start Validator (Metaplex Core is required for your mint program)
echo "Starting validator with Metaplex Core..."
solana-test-validator --clone CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d -u m --reset --quiet &
PID=$!
sleep 5

# 2. Configure CLI
solana config set --url localhost

# 3. Deploy Mint Program to its specific IDL address
echo "Deploying Mint Program..."
solana program deploy \
  --program-id 8r1y3F7F7RVfRUNeh6tA7MLDrCdCKZL6Y2GYozqa81WL \
  mint_program.so

# 4. Deploy Escrow Program to its specific IDL address
# IMPORTANT: You must have the correct escrow_program.so file here!
if [ -f "escrow_program.so" ]; then
    echo "Deploying Escrow Program..."
    solana program deploy \
      --program-id D3obuYP14sxhSRMvYPXZR7U8j9nGgrTNGj8mgohYu5PG \
      escrow_program.so
else
    echo "ERROR: escrow_program.so not found. Please provide the correct binary."
fi

# 5. Run the Bun test
echo "Running tests..."
bun test integration.test.ts

# Cleanup
kill $PID
