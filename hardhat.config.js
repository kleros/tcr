require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-web3");

module.exports = {
  solidity: {
    version: "0.5.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
};
