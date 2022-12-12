<p align="center">
  <b style="font-size: 32px;">Arbitrable Permission Lists on Ethereum</b>
</p>

<p align="center">
  <a href="https://standardjs.com"><img src="https://img.shields.io/badge/code_style-standard-brightgreen.svg" alt="JavaScript Style Guide"></a>
  <a href="https://github.com/trufflesuite/truffle"><img src="https://img.shields.io/badge/tested%20with-truffle-red.svg" alt="Tested with Truffle"></a>
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg" alt="Conventional Commits"></a>
  <a href="http://commitizen.github.io/cz-cli/"><img src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg" alt="Commitizen Friendly"></a>
  <a href="https://github.com/prettier/prettier"><img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with Prettier"></a>
</p>

Contracts for creating arbitrable permission lists on Ethereum.

## Development

1.  Clone this repo.
2.  Run `yarn install` to install dependencies and then `yarn build` to compile the contracts.

## Release

To bump the version of the package, use `yarn release`.

## Scripts

- `yarn prettify` - Apply prettier to the entire project.
- `yarn lint:sol` - Lint the entire project's .sol files.
- `yarn lint:js` - Lint the entire project's .js files.
- `yarn lint:sol --fix` - Fix fixable linting errors in .sol files.
- `yarn lint:js --fix` - Fix fixable linting errors in .js files.
- `yarn lint` - Lint the entire project's .sol and .js files.
- `yarn test` - Run the truffle tests.
- `yarn cz` - Run commitizen.
- `yarn build` - Compiles contracts and extracts the abi into the abi folder.
- `yarn release` - Run standard-version`.

## Test

Testrpc default gas limit is lower than the mainnet which prevents deploying some contracts. Before running truffle tests use:
`testrpc -l 8000000`.

## Testing contracts

- Run `npx hardhat compile` to compile the contracts.
- Run `npx hardhat test` to run all test cases in test folder.
- Run `npx hardhat test <location of test file>` to run the test cases for specific contract.

## Testing contracts on specific network

- Run `npx hardhat test --network <network name in hardhat.config.js>` to run all test cases in test folder.
- Run `npx hardhat test <location of test file> --network <network name in hardhat.config.js>` to run the test cases for specific contract.
- Add private keys for the roles needed to test the contracts according to hardhat.config.js.

## Contributing

See [contributing](https://kleros.gitbook.io/contributing-md/).

Learn how to develop arbitrable and arbitrator contracts [here](https://erc-792.readthedocs.io/en/latest/).
