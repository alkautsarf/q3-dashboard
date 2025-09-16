# 🚀 Quick Start

This guide helps you build, test, and run the **Solidity packages** and the **Next.js frontend** in this repo.

---

## 0) Prerequisites

- **Node.js** ≥ 20 and **npm**
  ```bash
  node -v
  npm -v
  ```
- **Foundry**
    ```
    curl -L https://foundry.paradigm.xyz | bash
    foundryup
    ```

## 1) Clone & Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/alkautsarf/q3-dashboard.git
cd q3-dashboard

# Install frontend dependencies
npm install
```

## 2) Environment Variables

Create a `.env.local` at the project root:

```bash
NEXT_PUBLIC_API=<ALCHEMY_API>
NEXT_PUBLIC_COINGECKO_API=<COINGECKO_API>

NEXT_PUBLIC_C1_ADDRESS=0xED259223F06eC265A80376251E483657572c10BD
NEXT_PUBLIC_C2_ADDRESS=0x45Eb2dF3c12C8fF7977bAF3f153E92C6a4933e69
NEXT_PUBLIC_C4_ADDRESS=0xF7367642f4bC701b3b44144399c0CB0D7470296F
```

(Optional) For deployments, export these in your shell:
```bash
export MAINNET_RPC_URL=<your_mainnet_rpc>
export ARBITRUM_RPC_URL=<your_arbitrum_rpc>
export ETHERSCAN_API_KEY=<your_etherscan_key>
```

## 3) Run the Frontend
```bash
# Start local dev
npm run dev

# Build for production
npm run build
```
## 4) Work on Contracts (Foundry)

Each challenge is a standalone Foundry package:

- `solidity/challenge-1`
- `solidity/challenge-2`
- `solidity/challenge-4`

### Build
```bash
cd solidity/challenge-1    # or challenge-2 / challenge-4
forge build
```
### Test
```bash
forge test
# with logs/traces:
forge test -vvv
```
### Coverage (src only)
```bash
forge coverage --exclude-tests --nmco script/<CONTRACT_NAME>.s.sol
```

## 4) Deploy (with verify & broadcast)
```bash
forge script script/<CONTRACT_NAME>.s.sol:<ContractName> \
  --rpc-url $MAINNET_RPC_URL \
  --account <USER_KEY> \
  --verify \
  --broadcast \
  -vvv
```
### Notes:
- Ensure `MAINNET_RPC_URL / ARBITRUM_RPC_URL` and `ETHERSCAN_API_KEY` are set.
- Update your `.env.local` with the deployed addresses so the frontend can read them.