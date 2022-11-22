const { web3,deployments } = require("hardhat");
const { expect } = require("chai");
const { BN, expectRevert } = require("@openzeppelin/test-helpers");

const GTCR = artifacts.require("./LightGeneralizedTCR.sol");
const LightGTCRFactory = artifacts.require("./LightGTCRFactory.sol");
const Arbitrator = artifacts.require("EnhancedAppealableArbitrator");

const RelayMock = artifacts.require("RelayMock");

describe("LightGTCRFactory", () => {
  let governor;
  let other;
  let arbitratorExtraData;
  let arbitrationCost;

  const appealTimeOut = 180;
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
  let implementation;
  let relay;

  before("Get accounts", async () => {
    const accounts = await web3.eth.getAccounts();

    governor = accounts[0];
    other = accounts[1];
    arbitratorExtraData = "0x85";
    arbitrationCost = 1000;
  });

  beforeEach("initialize the contract", async function () {
    arbitrator = await Arbitrator.new(arbitrationCost, governor, arbitratorExtraData, appealTimeOut, {
      from: governor,
    });

    relay = await RelayMock.new({ from: governor });

    await arbitrator.changeArbitrator(arbitrator.address);
    await arbitrator.createDispute(3, arbitratorExtraData, {
      from: other,
      value: arbitrationCost,
    }); // Create a dispute so the index in tests will not be a default value.

    implementation = await GTCR.new(); // This contract is going to be used with DELEGATECALL from each GTCR proxy.
    factory = await LightGTCRFactory.new(implementation.address);
    await factory.deploy(
      arbitrator.address,
      arbitratorExtraData,
      other, // Temporarily set connectedTCR to 'other' account for test purposes.
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor,
      [submissionBaseDeposit, removalBaseDeposit, submissionChallengeBaseDeposit, removalChallengeBaseDeposit],
      challengePeriodDuration,
      [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
      relay.address,
      { from: governor }
    );
    const proxyAddress = await factory.instances(new BN(0));
    gtcr = await GTCR.at(proxyAddress);
  });

  it("Should not be possibe to initilize a GTCR instance twice.", async () => {
    await expectRevert(
      gtcr.initialize(
        arbitrator.address,
        arbitratorExtraData,
        other, // Temporarily set connectedTCR to 'other' account for test purposes.
        registrationMetaEvidence,
        clearingMetaEvidence,
        governor,
        [submissionBaseDeposit, removalBaseDeposit, submissionChallengeBaseDeposit, removalChallengeBaseDeposit],
        challengePeriodDuration,
        [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
        relay.address,
        { from: governor }
      ),
      "Already initialized."
    );
  });

  it("Should allow multiple deployments.", async () => {
    for (let i = 1; i <= 5; i++) {
      await factory.deploy(
        arbitrator.address,
        arbitratorExtraData,
        other, // Temporarily set connectedTCR to 'other' account for test purposes.
        registrationMetaEvidence,
        clearingMetaEvidence,
        governor,
        [submissionBaseDeposit, removalBaseDeposit, submissionChallengeBaseDeposit, removalChallengeBaseDeposit],
        challengePeriodDuration + i,
        [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
        relay.address,
        { from: governor }
      );
      const gtcrClone = await GTCR.at(await factory.instances(new BN(i)));
      expect((await factory.count()).toString()).to.eq(new BN(i + 1).toString());
      expect((await gtcrClone.challengePeriodDuration()).toString()).to.eq(
        new BN(challengePeriodDuration + i).toString()
      );
    }
  });
});
