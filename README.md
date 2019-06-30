<p align="center">
  <b style="font-size: 32px;">Arbitrable Permission Lists on Ethereum</b>
</p>

<p align="center">
  <a href="https://standardjs.com"><img src="https://img.shields.io/badge/code_style-standard-brightgreen.svg" alt="JavaScript Style Guide"></a>
  <a href="https://david-dm.org/kleros/kleros-interaction"><img src="https://david-dm.org/kleros/kleros-interaction.svg" alt="Dependencies"></a>
  <a href="https://david-dm.org/kleros/kleros-interaction?type=dev"><img src="https://david-dm.org/kleros/kleros-interaction/dev-status.svg" alt="Dev Dependencies"></a>
  <a href="https://github.com/trufflesuite/truffle"><img src="https://img.shields.io/badge/tested%20with-truffle-red.svg" alt="Tested with Truffle"></a>
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg" alt="Conventional Commits"></a>
  <a href="http://commitizen.github.io/cz-cli/"><img src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg" alt="Commitizen Friendly"></a>
  <a href="https://github.com/prettier/prettier"><img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with Prettier"></a>
</p>

Contracts for creating arbitrable permission lists on Ethereum.

## Get Started

1.  Clone this repo.
2.  Run `yarn` to install dependencies and then `yarn run build` to compile the contracts.

## Scripts

- `yarn run prettify` - Apply prettier to the entire project.
- `yarn run lint:sol` - Lint the entire project's .sol files.
- `yarn run lint:js` - Lint the entire project's .js files.
- `yarn run lint:sol --fix` - Fix fixable linting errors in .sol files.
- `yarn run lint:js --fix` - Fix fixable linting errors in .js files.
- `yarn run lint` - Lint the entire project's .sol and .js files.
- `yarn test` - Run the truffle tests.
- `yarn run cz` - Run commitizen.
- `yarn run build` - Compile contracts.

## Test

Testrpc default gas limit is lower than the mainnet which prevents deploying some contracts. Before running truffle tests use:
`testrpc -l 8000000`.

## Contributing

See [contributing](https://kleros.gitbook.io/contributing-md/).

Learn how to develop arbitrable and arbitrator contracts [here](https://erc-792.readthedocs.io/en/latest/).
