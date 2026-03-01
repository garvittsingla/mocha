# Technical Investigation: Resolving `NotAuthorized` Upgrade Authority Error

This report outlines the debugging journey to resolve the `NotAuthorized` (Error 6002) issue encountered during the `WhitelistCreator` instruction in the `mint-program` test suite.

## 1. Executive Summary

The primary issue was a mismatch between the program's **Upgrade Authority** on localnet vs. the test's expectations. By default, `anchor test` loads programs as **immutable**, which breaks checks requiring the `payer` to be the upgrade authority. We resolved this by bypassing the default Anchor test runner and implementing a custom deployment flow.

---

## 2. Root Cause Analysis

### A. The "Immutable" Local Validator

In Anchor (v0.32.1), the `anchor test` command starts `solana-test-validator` using the `--bpf-program` flag.

-   **Result**: The program is loaded directly into the ledger at genesis.
-   **Consequence**: The `Upgrade Authority` address is set to `11111111111111111111111111111111` (None).
-   **Conflict**: The `whitelist_creator.rs` instruction strictly requires:
    ```rust
    #[account(constraint = program_data.upgrade_authority_address == Some(payer.key()))]
    ```
    Since `None != Some(wallet_key)`, the transaction always fails with `NotAuthorized`.

### B. Broken PDA Derivation

The original test code attempted to hardcode the `BPF_LOADER_UPGRADEABLE_PROGRAM_ID` string.

-   **Bug**: The string was incorrectly formatted (missing characters).
-   **Effect**: Initializing a `PublicKey` with an invalid string threw errors before the transaction even reached the cluster.

### C. Dependency Missing (MPL Core)

Because we switched to a fresh validator to fix the authority issue, we lost the default programs normally loaded by Anchor's dependency management.

-   **Problem**: `CreateCollection` failed with `Unsupported program id` because the Metaplex Core program was missing from the fresh ledger.

---

## 3. The Fix: Custom Test Architecture

We moved away from the standard `anchor test` automated flow and implemented a more robust manual lifecycle:

### I. Dynamic PDA Lookup

Instead of hardcoding the BPF Loader ID, we now read the program's metadata directly from the cluster:

```typescript
const programAccountInfo = await connection.getParsedAccountInfo(
    program.programId,
);
const parsedData = (programAccountInfo.value?.data as any)?.parsed;
programDataAccount = new PublicKey(parsedData.info.programData);
```

### II. `scripts/run-tests.sh`

This script replaces the internal Anchor test runner to provide granular control:

1.  **Starts Validator** with `--url devnet --clone-upgradeable-program ...` to fetch Metaplex Core automatically.
2.  **Deploys Program** via `solana program deploy`. Unlike Anchor's internal loader, this command specifically initializes the program with your local wallet as the **Upgrade Authority**.
3.  **Executes Tests** using `ts-mocha` while injecting necessary environment variables (`ANCHOR_PROVIDER_URL`, etc.).

---

## 4. Alternative: Surfpool/Txtx Analysis

Could this have been solved more efficiently? **Yes.**

If using **Surfpool + Txtx Runbooks**, the "Infrastructure as Code" approach would have naturally prevented these issues:

1.  **Declarative Authority**: You define the `authority` keypair directly in the `svm::deploy_program` action. Surfpool ensures the program is active and upgradeable by that specific key before tests run.
2.  **Environment Sync**: Clones (like MPL Core) are defined in `txtx.yml` environments, removing the need for `solana program dump` or complex CLI flags.
3.  **Determinism**: Runbooks execute as a series of discrete actions. This eliminates the "airdrop race conditions" and `setTimeout` hacks common in Mocha tests.

---

## 5. Summary of Passing Tests

The suite now reports **9 passing** tests, covering:

-   Whitelisting creators (Authority check passed ✅)
-   Collection creation (MPL Core integration passed ✅)
-   Minting/Freezing/Thawing logic (PDA and Authority logic verified ✅)

_To run the suite again:_

```bash
anchor test
```

_(Now mapped to `bash scripts/run-tests.sh`)_
