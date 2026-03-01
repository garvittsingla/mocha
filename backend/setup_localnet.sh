#!/bin/bash

# Ensure solana-test-validator is not already running
killall solana-test-validator 2>/dev/null || true

# Program IDs from your IDLs
MINT_PROGRAM_ID="8r1y3F7F7RVfRUNeh6tA7MLDrCdCKZL6Y2GYozqa81WL"
ESCROW_PROGRAM_ID="D3obuYP14sxhSRMvYPXZR7U8j9nGgrTNGj8mgohYu5PG"
CORE_PROGRAM_ID="CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"

# Check for binaries
if [ ! -f "mint_program.so" ]; then
    echo "ERROR: mint_program.so not found!"
    exit 1
fi

if [ ! -f "escrow_program.so" ]; then
    echo "WARNING: escrow_program.so not found. Using mint_program.so as a placeholder for the escrow address so the validator starts..."
    cp mint_program.so escrow_program.so
fi

echo "Starting validator and loading programs into specific addresses..."
# This command:
# 1. Clones Metaplex Core from Mainnet
# 2. Loads your Mint binary into the Mint ID
# 3. Loads your Escrow binary into the Escrow ID
solana-test-validator \
  --clone $CORE_PROGRAM_ID -u m \
  --bpf-program $MINT_PROGRAM_ID mint_program.so \
  --bpf-program $ESCROW_PROGRAM_ID escrow_program.so \
  --reset --quiet &

VALIDATOR_PID=$!

# Wait for validator to start
echo "Waiting for validator to be ready..."
until solana cluster-version &>/dev/null; do
  sleep 1
done

# Set config to localhost
solana config set --url localhost

echo "Validator is ready. Programs are loaded at:"
echo "Mint Program: $MINT_PROGRAM_ID"
echo "Escrow Program: $ESCROW_PROGRAM_ID"
echo "Metaplex Core: $CORE_PROGRAM_ID"

echo "You can now run: bun test integration.test.ts"
