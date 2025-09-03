
## Cloudwalk Solidity Project Setup

## Play with repo

1. Clone the repo.
1. Create the `.env` file based on the `.env.example` one:
   - Windows:

   ```sh
   copy .env.example .env
   ```

   - MacOS/Linux:

   ```sh
   cp .env.example .env
   ```

1. Optionally update the settings in the newly created `.env` file (e.g., Solidity version, number of optimization runs, network RPC URLs, private keys (PK) for networks, etc.).
1. Optional: [Setup npm token](./NPM.md). If you need development tools, like linters.
## Build and test

```sh
# Install all dependencies
npm ci

# Compile all contracts
npm run build

# Run all tests
npm run test
```
