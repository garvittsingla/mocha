#!/bin/bash
set -e

DEVNET_URL="https://api.devnet.solana.com"
PRIORITY="--with-compute-unit-price 50000"
RPC="--use-rpc"

echo "Deploying programs to devnet..."

echo "▶ Deploy escrow program"
solana program deploy ./escrow_program.so \
  --program-id escrow_program-keypair.json \
  --url $DEVNET_URL \
  $PRIORITY $RPC
echo "✅ Escrow program deployed"

echo "▶ Deploy mint program (large ~439KB — may take a few attempts)"
for attempt in 1 2 3; do
  echo "  Attempt $attempt/3..."
  if solana program deploy ./mint_program.so \
    --program-id mint_program-keypair.json \
    --url $DEVNET_URL \
    $PRIORITY $RPC; then
    echo "✅ Mint program deployed"
    break
  else
    if [ $attempt -lt 3 ]; then
      echo "  ⚠️  Deploy failed, waiting 15s before retry..."
      # Close any dangling buffers to recover SOL and start fresh
      solana program close --buffers --url $DEVNET_URL 2>/dev/null || true
      sleep 15
    else
      echo "  ❌ Mint program deploy failed after 3 attempts."
      echo "  Run: solana program close --buffers --url devnet"
      echo "  Then retry: bash script.sh"
      exit 1
    fi
  fi
done

echo ""
echo "▶ Running tests..."
bun test --timeout 300000

