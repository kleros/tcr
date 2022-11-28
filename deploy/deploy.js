const { network, ethers, artifacts } = require("hardhat");
module.exports = async ({ getNamedAccounts, deployments}) => {
  const { deploy} = deployments;
  const { deployer, governor} = await getNamedAccounts();
  arbitratorExtraData = "0x85";
  arbitrationCost = 1000;
  const appealTimeOut = 180;

  // the following will deploy "EnhancedAppealableArbitrator" if the contract was never deployed or if the code changed since last deployment
  const EnhancedArbitrator = await deploy("EnhancedAppealableArbitrator", {
    from: governor,
    args: [arbitrationCost, governor, arbitratorExtraData, appealTimeOut],
  });
  console.log(EnhancedArbitrator.address, "EnhancedAppealableArbitrator");
  const GTCRFactory = await deploy("GTCRFactory", {
    from: deployer,
    args: [],
  });
  console.log(GTCRFactory.address, "GTCRFactory address");
  const LGTCR = await deploy("LightGeneralizedTCR", {
    from: deployer,
    args: [],
  });
  console.log(LGTCR.address, "address of LGTCR");
  const LGTCRFactory = await deploy("LightGTCRFactory", {
    from: deployer,
    args: [LGTCR.address],
  });
  const RelayMock = await deploy("RelayMock", {
    from: governor,
    args: [],
  });
  console.log(RelayMock.address, "address of RelayMock");
  console.log(LGTCRFactory.address, "address of LGTCR factory");
  const LightGeneralizedTCRView = await deploy("LightGeneralizedTCRView", {
    from: governor,
    args: [],
  });
  console.log(LightGeneralizedTCRView.address, "address of LightGeneralizedTCRView");

  const GeneralizedTCRView = await deploy("GeneralizedTCRView", {
    from: governor,
    args: [],
  });
  console.log(GeneralizedTCRView.address, "address of GeneralizedTCRView");

  const BatchWithdraw = await deploy("BatchWithdraw", {
    from: governor,
    args: [],
  });
  console.log(BatchWithdraw.address, "address of BatchWithdraw");
  const LBatchWithdraw = await deploy("LightBatchWithdraw", {
    from: governor,
    args: [],
  });
  console.log(LBatchWithdraw.address, "address of LightBatchWithdraw");
  
};
module.exports.tags = ["gtcrContracts"];