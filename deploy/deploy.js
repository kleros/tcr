const { network, ethers, artifacts } = require("hardhat");
const hre = require("hardhat");
module.exports = async ({ getNamedAccounts, deployments, getChainId, getUnnamedAccounts }) => {
  const { deploy, execute } = deployments;
  const { deployer, governor, other } = await getNamedAccounts();
  const accounts = await ethers.getSigners();
  arbitratorExtraData = "0x85";
  arbitrationCost = 1000;
  const appealTimeOut = 180;
  const registrationMetaEvidence = "registrationMetaEvidence.json";
  const clearingMetaEvidence = "clearingMetaEvidence.json";
  const submissionBaseDeposit = 2000;
  const removalBaseDeposit = 1300;
  const submissionChallengeBaseDeposit = 5000;
  const removalChallengeBaseDeposit = 1200;
  const challengePeriodDuration = 600;
  const sharedStakeMultiplier = 5000;
  const winnerStakeMultiplier = 2000;
  const loserStakeMultiplier = 8000;

  // the following will deploy "EnhancedAppealableArbitrator" if the contract was never deployed or if the code changed since last deployment
  //console.log(deployer,governor,accounts[0], "deployer");
  const EnhancedArbitrator = await deploy("EnhancedAppealableArbitrator", {
    from: deployer,
    args: [arbitrationCost, governor, arbitratorExtraData, appealTimeOut],
  });
  console.log(EnhancedArbitrator.address, "EnhancedAppealableArbitrator");
  const GTCRFactory = await deploy("GTCRFactory", {
    from: deployer,
    args: [],
  });
  await execute(
    "GTCRFactory",
    { from: governor, log: true },
    "deploy",
    EnhancedArbitrator.address,
    arbitratorExtraData,
    other,
    registrationMetaEvidence,
    clearingMetaEvidence,
    governor,
    submissionBaseDeposit,
    removalBaseDeposit,
    submissionChallengeBaseDeposit,
    removalChallengeBaseDeposit,
    challengePeriodDuration,
    [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier]
  );
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
  await execute(
    "LightGTCRFactory",
    { from: governor, log: true },
    "deploy",
    EnhancedArbitrator.address,
    arbitratorExtraData,
    other, // Temporarily set connectedTCR to 'other' account for test purposes.
    registrationMetaEvidence,
    clearingMetaEvidence,
    governor,
    [submissionBaseDeposit, removalBaseDeposit, submissionChallengeBaseDeposit, removalChallengeBaseDeposit],
    challengePeriodDuration,
    [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
    RelayMock.address
  );
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
