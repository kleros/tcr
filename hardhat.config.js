require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-web3");
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-ethers");
require('hardhat-deploy');
module.exports = {
  solidity: {
    version: "0.5.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
    networks: {
      hardhat: {
        live: false,
        saveDeployments: true,
        allowUnlimitedContractSize: true,
        tags: ["test", "local"],
      },
      localhost: {
        url: `http://127.0.0.1:8545`,
        chainId: 31337,
        saveDeployments: true,
        tags: ["test", "local"],
      },
      mumbai: {
        live: false,
        saveDeployments: true,
        tags: ["test", "local"],
          url: `https://matic-mumbai.chainstacklabs.com`,
        chainId: 80001,
        accounts:["YOURPRIVATEKEYFORGOVERNOR","YOURPRIVATEKEYFORREQUESTER","YOURPRIVATEKEYFORCHALLENGER","YOURPRIVATEKEYFORGOVERNOR2","YOURPRIVATEKEYFOROTHER","YOURPRIVATEKEYFORDEPLOYER"],
      },
      goerli: {
        chainId: 5,
        url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
        accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
        live: true,
        saveDeployments: true,
        tags: ["staging", "foreign", "layer1"],
        companionNetworks: {
          home: "arbitrumGoerli",
        },
      },
    },
    namedAccounts: {
      governor: {
        default: 0,
      },
      requester: {
        default: 1,
      },
      challenger: {
        default: 2,
      },
      governor2 :{
        default: 3,
      },
      other: {
        default: 4,
      },
      deployer: {
        default: 5,
      },
    },
  
  gasReporter: {
    enabled: process.env.REPORT_GAS ? true : false,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: "USD",
    gasPrice: 100,
  },
};
