# Pectra Upgrade Testing

## Overview

These tests extend the Ethereum specification tests to validate the Pectra Upgrade in the context of the Hiero ecosystem.
We include tests for the EIPs implemented as part of the Pectra Upgrade in Hiero.
That is,
[EIP-7702: Set Code for EOAs](https://eips.ethereum.org/EIPS/eip-7702),
[EIP-7623: Increase calldata cost](https://eips.ethereum.org/EIPS/eip-7623) and
[EIP-2537: Precompile for BLS12-381 curve operations](https://eips.ethereum.org/EIPS/eip-2537).

Throughout the tests for EIP-7702, we use Smart Wallet contracts, which have the ability to execute multiple transactions (method calls) dynamically based on the calldata.
For example, Smart Wallet contract can be either <https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/accounts/Simple7702Account.sol> or <https://github.com/AmbireTech/wallet/blob/main/contracts/AmbireAccount.sol>.
These kind of Smart Wallets have the ability to send transactions through contract methods like `execute` and `executeBatch`.
Note that this includes the ability to call Hiero’s System Contracts as well, e.g., HTS method calls.

## Install

```sh
npm ci
```

## Run Tests

> [!NOTE]
> At the moment, you can run tests against an Ethereum client until the Pectra upgrade is released.
> For example, you can run Geth client in another terminal with
>
> ```sh
> docker run -p 8545:8545 --rm ethereum/client-go --dev --verbosity 4 --http --http.api eth,web3,net,debug --http.addr 0.0.0.0
> ```

```sh
npm test
```

### Run Tests with logging enabled

You can also run tests with logging enabled.
This uses Node.js's built-in `debuglog` utility to provide
conditional debugging output based on the `NODE_DEBUG` environment variable.
That is, to enable debug output, set `NODE_DEBUG=pectra-testing` when running the tests, for example

```sh
NODE_DEBUG=pectra-testing npm test
```

Note that the output might be considerably large with logging enabled.
You may want to filter tests to be executed by either using Mocha's `--grep` flag or `.only` modifier in source code.
For more details see [`util.debuglog(section[, callback])`](https://nodejs.org/api/util.html#utildebuglogsection-callback) in Node.js's documentation.

## Development

- project structure, 
lib is utils, not uut

compilation with Foundry, no hardhat
- Quick question: why are we using foundry for those tests, rather than sticking to hardhat for consistency?

It's only needed for compilation, we could use either Foundry or Hardhat, or even solc directly. Foundry doesn't need to be added to the lock file and doesn't pollute the project.

### Contracts

We use the Smart Wallet implementation from <https://github.com/eth-infinitism/account-abstraction>.
In particular, `@account-abstraction/contracts/accounts/Simple7702Account.sol` which allow us to execute transactions dynamically based on calldata.

> [!NOTE]
> The sole purpose of the `Wrapper` contract is to `import` contracts that are used directly in tests as artifacts.
> Without `import`ing them, these contracts are not compiled, thus they will not appear as artifacts in the `out/` folder.

### Avoid Polluting Dependencies

The Hiero JS SDK contains a transitive dependency to `react-native-get-random-values`.
This in turn, triggers the installation of hundreds of unused packages, which makes the installation slower, increases the surface for supply-chain attacks and pollutes the `node_modules` folder.
We can prune the tree dependency by avoid installing `react-native-get-random-values` using `overrides` as shown next

```json
  "overrides": {
    "react-native-get-random-values": "file:./null"
  }
```

This reduces the amount of installed packages from `~400` to `~100`.
