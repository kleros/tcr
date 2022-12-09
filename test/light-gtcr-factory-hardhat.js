const { deployments, ethers } = require("hardhat");
const { expect } = require("chai");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { BN } = require("bn.js");

describe("LightGTCRFactory", async () => {
  let governor;
  let other;
  let arbitratorExtraData;
  let arbitrationCost;
  const submissionBaseDeposit = 2000;
  const removalBaseDeposit = 1300;
  const submissionChallengeBaseDeposit = 5000;
  const removalChallengeBaseDeposit = 1200;
  const challengePeriodDuration = 600;
  const sharedStakeMultiplier = 5000;
  const winnerStakeMultiplier = 2000;
  const loserStakeMultiplier = 8000;
  const registrationMetaEvidence = "registrationMetaEvidence.json";
  const clearingMetaEvidence = "clearingMetaEvidence.json";

  let arbitrator;
  let factory;
  let gtcr;
  let relay;

  before("Get accounts", async () => {
    [governor, , , , other] = await ethers.getSigners();
    arbitratorExtraData = "0x85";
    arbitrationCost = 1000;
  });
  beforeEach("setup contract", async function () {
    await deployments.fixture(["gtcrContracts"], {
      fallbackToGlobal: true,
      keepExistingDeployments: false,
    });
    arbitrator = await ethers.getContract("EnhancedAppealableArbitrator");
    relay = await ethers.getContract("RelayMock");

    await arbitrator.connect(governor).changeArbitrator(arbitrator.address);

    await arbitrator.connect(other).createDispute(3, arbitratorExtraData, {
      value: arbitrationCost,
    }); // Create a dispute so the index in tests will not be a default value.
    factory = await ethers.getContract("LightGTCRFactory");
    await factory.connect(governor).deploy(
      arbitrator.address,
      arbitratorExtraData,
      other.address, // Temporarily set connectedTCR to 'other' account for test purposes.
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor.address,
      [submissionBaseDeposit, removalBaseDeposit, submissionChallengeBaseDeposit, removalChallengeBaseDeposit],
      challengePeriodDuration,
      [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
      relay.address
    );

    const proxyAddress = await factory.instances(0);
    gtcr = await ethers.getContractAt("LightGeneralizedTCR", proxyAddress);
  });
  it("Should not be possible to initilize a GTCR instance twice.", async () => {
    await expectRevert(
      gtcr.connect(governor).initialize(
        arbitrator.address,
        arbitratorExtraData,
        other.address, // Temporarily set connectedTCR to 'other' account for test purposes.
        registrationMetaEvidence,
        clearingMetaEvidence,
        governor.address,
        [submissionBaseDeposit, removalBaseDeposit, submissionChallengeBaseDeposit, removalChallengeBaseDeposit],
        challengePeriodDuration,
        [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
        relay.address
      ),
      "Already initialized."
    );
  });

  it("Should allow multiple deployments.", async () => {
    for (let i = 1; i <= 5; i++) {
      await factory.connect(governor).deploy(
        arbitrator.address,
        arbitratorExtraData,
        other.address, // Temporarily set connectedTCR to 'other' account for test purposes.
        registrationMetaEvidence,
        clearingMetaEvidence,
        governor.address,
        [submissionBaseDeposit, removalBaseDeposit, submissionChallengeBaseDeposit, removalChallengeBaseDeposit],
        challengePeriodDuration + i,
        [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
        relay.address
      );
      const gtcrClone = await ethers.getContractAt("LightGeneralizedTCR", await factory.instances(i));
      expect((await factory.count()).toString()).to.eq((i + 1).toString());
      expect((await gtcrClone.challengePeriodDuration()).toString()).to.eq(
        new BN(challengePeriodDuration + i).toString()
      );
    }
  });
});
