#!/usr/bin/env bash
# run-tests.sh
# Starts a local validator, clones MPL Core from devnet, deploys our program
# via BPF Upgradeable Loader (which sets upgrade authority = wallet), then runs tests.

set -e

PROGRAM_SO="target/deploy/mint_program.so"
PROGRAM_KEYPAIR="target/deploy/mint_program-keypair.json"
WALLET=~/.config/solana/id.json
VALIDATOR_URL="http://127.0.0.1:8899"
LEDGER_DIR="/tmp/test-ledger-mint"
MPL_CORE_PROGRAM_ID="CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"

echo "==> Killing any existing validator..."
pkill -f solana-test-validator 2>/dev/null || true
sleep 2

echo "==> Starting local test validator with MPL Core from devnet..."
rm -rf "$LEDGER_DIR"
solana-test-validator \
  --ledger "$LEDGER_DIR" \
  --reset \
  --mint "$(solana-keygen pubkey $WALLET)" \
  -u devnet \
  --clone-upgradeable-program "$MPL_CORE_PROGRAM_ID" \
  --quiet &

VALIDATOR_PID=$!
echo "    Validator PID: $VALIDATOR_PID"

echo "==> Waiting for validator..."
for i in {1..30}; do
  if solana --url "$VALIDATOR_URL" cluster-version &>/dev/null; then
    echo "    Validator is up!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: Validator did not start in time"
    kill $VALIDATOR_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo "==> Deploying program (sets upgrade authority = wallet)..."
solana program deploy \
  --url "$VALIDATOR_URL" \
  --keypair "$WALLET" \
  --program-id "$PROGRAM_KEYPAIR" \
  "$PROGRAM_SO"

echo "==> Verifying deploy..."
solana program show --url "$VALIDATOR_URL" "$(solana-keygen pubkey $PROGRAM_KEYPAIR)"

echo "==> Running tests..."
ANCHOR_PROVIDER_URL="$VALIDATOR_URL" \
ANCHOR_WALLET="$WALLET" \
  yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
EXIT_CODE=$?

echo "==> Stopping validator..."
kill $VALIDATOR_PID 2>/dev/null || true

exit $EXIT_CODE
