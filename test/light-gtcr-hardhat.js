const { web3, deployments, ethers} = require("hardhat");
const { BN, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const chai = require("chai");
const { solidity } = require("ethereum-waffle");
chai.use(solidity);
const { expect,assert } = chai;
const Arbitrator = artifacts.require("EnhancedAppealableArbitrator");
const { soliditySha3 } = require("web3-utils");

const PARTY = {
  NONE: 0,
  REQUESTER: 1,
  CHALLENGER: 2,
};

describe("LightGeneralizedTCR", () => {
  let governor;
  let requester;
  let challenger;
  let other;
  let governor2;
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
  let newArbitrator;
  let factory;
  let gtcr;
  let implementation;
  let MULTIPLIER_DIVISOR;
  let submitterTotalCost;
  let submissionChallengeTotalCost;
  let relay;
  let removalTotalCost;
  let removalChallengeTotalCost;

  before("Get accounts", async () => {
    [ governor, requester, challenger, governor2, other,deployer] = await ethers.getSigners();
    arbitratorExtraData = "0x85";
    arbitrationCost = 1000;
  });

  beforeEach("initialize the contract", async function () {
    await deployments.fixture(["gtcrContracts"], {
        fallbackToGlobal: true,
        keepExistingDeployments: false,
      });
    arbitrator = await ethers.getContract("EnhancedAppealableArbitrator");
    relay = await ethers.getContract("RelayMock");
    newArbitrator = await Arbitrator.new(arbitrationCost, governor.address, arbitratorExtraData, appealTimeOut, {
        from: governor.address,
      });
      
      relay = await ethers.getContract("RelayMock");
    await arbitrator.connect(governor).changeArbitrator(arbitrator.address);
    await arbitrator.connect(other).createDispute(3, arbitratorExtraData, {
      value: arbitrationCost,
    });
    // Create a dispute so the index in tests will not be a default value.
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


    MULTIPLIER_DIVISOR = (await gtcr.MULTIPLIER_DIVISOR()).toNumber();
    submitterTotalCost = arbitrationCost + submissionBaseDeposit;
    removalTotalCost = arbitrationCost + removalBaseDeposit;
    submissionChallengeTotalCost = arbitrationCost + submissionChallengeBaseDeposit;
    removalChallengeTotalCost = arbitrationCost + removalChallengeBaseDeposit;
  });

  it("Should set the correct values in constructor", async () => {
    assert.equal(await gtcr.arbitrator(), arbitrator.address);
    assert.equal(await gtcr.arbitratorExtraData(), arbitratorExtraData);
    assert.equal(await gtcr.governor(), governor.address);
    assert.equal(await gtcr.submissionBaseDeposit(), submissionBaseDeposit);
    assert.equal(await gtcr.submissionChallengeBaseDeposit(), submissionChallengeBaseDeposit);
    assert.equal(await gtcr.challengePeriodDuration(), challengePeriodDuration);
    assert.equal(await gtcr.sharedStakeMultiplier(), sharedStakeMultiplier);
    assert.equal(await gtcr.winnerStakeMultiplier(), winnerStakeMultiplier);
    assert.equal(await gtcr.loserStakeMultiplier(), loserStakeMultiplier);
    assert.equal(await gtcr.relayerContract(), relay.address);
  });

  describe("When requesting registration", () => {
    it("Should revert when the requester do provide the full deposit", async () => {
      await expectRevert(
        gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
          value: submitterTotalCost - 1,
        }),
        "You must fully fund the request."
      );
    });

    it("Should revert when there already is a request to add the same item", async () => {
      await gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
        value: submitterTotalCost,
      });

      await expectRevert(
        gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
          value: submitterTotalCost,
        }),
        "Item must be absent to be added."
      );
    });

    it("Should set the correct values and fire the event when requesting registration", async () => {
      const txAddItem = await gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
        value: submitterTotalCost,
      });
      let txAddItemReceipt = await txAddItem.wait();
      await expectRevert(
        gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
          value: submitterTotalCost,
        }),
        "Item must be absent to be added."
      );

      const itemID = txAddItemReceipt.events[0].args._itemID;
      assert.equal(itemID, soliditySha3("/ipfs/Qwabdaa"), "Item ID has not been set up properly");

      const item = await gtcr.items(itemID);
      assert.equal(item.status, 2, "Item status has not been set up properly");

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request[4][1], requester.address, "Requester has not been set up properly");
      assert.equal(request[7], arbitrator.address, "Request arbitrator has not been set up properly");
      assert.equal(request[8], arbitratorExtraData, "Request extra data has not been set up properly");

      assert.equal(
        item.sumDeposit.toNumber(),
        submitterTotalCost,
        "Requester paidFees has not been registered correctly"
      );
      assert.equal(txAddItemReceipt.events[2].event, "Contribution", "The Contribution event has not been created");
      assert.equal(txAddItemReceipt.events[2].args._roundID, 0, "The Contribution event has wrong round ID");
      assert.equal(txAddItemReceipt.events[1].event, "RequestSubmitted", "The RequestSubmitted event has not been created");
      assert.equal(txAddItemReceipt.events[1].args._itemID, itemID, "The RequestSubmitted event has wrong item ID");
    });
  });

  describe("When challenging a registration request", () => {
    let tx;
    let itemID;

    beforeEach("Request to add item", async () => {
      tx = await gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
        value: submitterTotalCost,
      });
      let txReceipt = await tx.wait();
      itemID = txReceipt.events[0].args._itemID;
    });

    it("Should revert when the challenger do provide the full deposit", async () => {
      await expectRevert(
        gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
          value: submissionChallengeTotalCost - 1,
        }),
        "You must fully fund the challenge."
      );
    });

    it("Should set the correct values and create a dispute after the item is challenged and fire 2 events", async () => {
      const txChallenge = await gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
        value: submissionChallengeTotalCost,
      });
      let txChallengeReceipt = await txChallenge.wait();
      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.parties[2], challenger.address, "Challenger has not been set up properly");
      assert.equal(request.disputed, true, "The request should have status disputed");
      assert.equal(request.disputeID.toNumber(), 1, "Dispute ID has not been set up properly");
      assert.equal(request.numberOfRounds.toNumber(), 2, "Number of rounds should have been set to 2");

      const arbitratorDisputeIDToItemID = await gtcr.arbitratorDisputeIDToItemID(arbitrator.address, 1);
      assert.equal(arbitratorDisputeIDToItemID, itemID, "Incorrect arbitratorDisputeIDToItemID value");

      const item = await gtcr.items(itemID);
      const expectedRemainingDeposit = submitterTotalCost + submissionChallengeTotalCost - arbitrationCost;
      assert.equal(item.sumDeposit.toNumber(), expectedRemainingDeposit);

      const dispute = await arbitrator.disputes(1);
      assert.equal(dispute[0], gtcr.address, "Arbitrable not set up properly");
      assert.equal(dispute[1].toNumber(), 2, "Number of choices not set up properly");

      const evidenceGroupID = parseInt(soliditySha3(itemID, 0), 16);
      assert.equal(txChallengeReceipt.events[0].event, "Contribution", "The event Contribution has not been created");
      assert.equal(txChallengeReceipt.events[0].args._roundID, 0, "The event has wrong round ID");
      assert.equal(txChallengeReceipt.events[2].event, "Dispute", "The event Dispute has not been created");
      assert.equal(txChallengeReceipt.events[2].args._arbitrator, arbitrator.address, "The event has wrong arbitrator");
      assert.equal(txChallengeReceipt.events[2].args._disputeID.toNumber(), 1, "The event has wrong dispute ID");
      assert.equal(txChallengeReceipt.events[2].args._metaEvidenceID.toNumber(), 0, "The event has wrong metaevidence ID");
      assert.equal(txChallengeReceipt.events[2].args._evidenceGroupID, evidenceGroupID, "The event has wrong evidenceGroup ID");
      assert.equal(txChallengeReceipt.events[3].event, "Evidence", "The event Evidence has not been created");
      assert.equal(txChallengeReceipt.events[3].args._arbitrator, arbitrator.address, "The event has wrong arbitrator");
      assert.equal(txChallengeReceipt.events[3].args._evidenceGroupID, evidenceGroupID, "The event has wrong evidenceGroup ID");
      assert.equal(txChallengeReceipt.events[3].args._party, challenger.address, "The event has wrong party");
      assert.equal(txChallengeReceipt.events[3].args._evidence, "Evidence.json", "The event has wrong evidence");

      await expectRevert(
        gtcr.connect(other).challengeRequest(itemID, "Evidence2.json", {
          value: submissionChallengeTotalCost,
        }),
        "The request should not have already been disputed."
      );

      await time.increase(challengePeriodDuration + 1);
      await expectRevert(gtcr.connect(governor).executeRequest(itemID), "The request should not be disputed.");
    });

    it("Should revert when challenge has passed", async () => {
      await time.increase(challengePeriodDuration + 1);

      await expectRevert(
        gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
          value: submissionChallengeTotalCost,
        }),
        "Challenges must occur during the challenge period."
      );
    });
  });

  describe("When there is no challenge during the request challenge period", () => {
    let tx;
    let itemID;

    beforeEach("Request to add item", async () => {
      tx = await gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
        value: submitterTotalCost,
      });
      let txReceipt = await tx.wait();
      itemID = txReceipt.events[0].args._itemID;
    });

    it("Should revert when trying to execute the request and the challenge period as not passed yet", async () => {
      await expectRevert(gtcr.connect(governor).executeRequest(itemID), "Time to challenge the request must pass.");
    });

    it("Should successfully execute the request if it has not been challenged and fire the event", async () => {
      const oldBalance = await web3.eth.getBalance(requester.address);

      await time.increase(challengePeriodDuration + 1);
      const txExecute = await gtcr.connect(governor).executeRequest(itemID);
      let txExecuteReceipt = await txExecute.wait();
      const newBalance = await web3.eth.getBalance(requester.address);

      const item = await gtcr.items(itemID);
      assert.equal(item.status, 1, "Item should have status Registered");

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "Request should be resolved");

      assert.equal(txExecuteReceipt.events[0].event, "ItemStatusChange", "The event has not been created");
      assert.equal(txExecuteReceipt.events[0].args._itemID, itemID, "The event has wrong item ID");

      assert(
        new BN(newBalance).eq(new BN(oldBalance).add(new BN(submitterTotalCost))),
        "The requester was not reimbursed correctly"
      );

      assert.equal(item.sumDeposit.toNumber(), 0, "sumDeposit should be 0");
    });
  });

  describe("When the dispute is appealable", () => {
    let tx;
    let itemID;
    let loserAppealFee;
    let winnerAppealFee;

    beforeEach("Request to add item", async () => {
      tx = await gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
        value: submitterTotalCost,
      });
      let txReceipt = await tx.wait();
      itemID = txReceipt.events[0].args._itemID;
      // Appeal fee is the same as arbitration fee for this arbitrator.
      loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;
      winnerAppealFee = arbitrationCost + (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
        value: submissionChallengeTotalCost,
      });

      await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);
    });

    it("Should revert when trying to fund an appeal for an unexistent dispute", async () => {
      await expectRevert(
        gtcr.connect(challenger).fundAppeal("0x0000000000000000000000000000000000000000000000000000000000000000", 2, {
          value:"2000000000000000000",
        }),
        "The item must have a pending request."
      );
    });

    it("Should revert when trying to fund an invalid side", async () => {
      await expectRevert(
        gtcr.connect(challenger).fundAppeal(itemID, PARTY.NONE, {
          value: loserAppealFee,
        }),
        "Invalid side."
      );
    });

    it("Should revert when trying to fund an already fully-funded side", async () => {
      await gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, { value: loserAppealFee });

      await expectRevert(
        gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, {
          value:"1000000000000000000",
        }),
        "Side already fully funded."
      );
    });

    it("Should reimburse the contributor when there is an overpayment", async () => {
      const overpayment = 1e18;
      const contribution = loserAppealFee + overpayment;
      const oldBalanceRequester = await web3.eth.getBalance(requester.address);

      await gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, {
        value: contribution.toString(),
      });

      const newBalanceRequester = await web3.eth.getBalance(requester.address);
      const balanceChange = new BN(oldBalanceRequester).sub(new BN(newBalanceRequester));

      assert(balanceChange.lt(new BN(String(overpayment))), "Contributor was not properly reimbursed");
    });

    it("Should revert when the loser side tries to fund the appeal after the first half of the appeal period has passed", async () => {
      time.increase(appealTimeOut / 2 + 1);
      await expectRevert(
        gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, { value: loserAppealFee }),
        "The loser must contribute during the first half of the appeal period."
      );
    });

    it("Should be possible for the winner side to fund the appeal after the first half of the appeal period has passed", async () => {
      time.increase(appealTimeOut / 2 + 1);

      await gtcr.connect(challenger).fundAppeal(itemID, PARTY.CHALLENGER, { value: winnerAppealFee });

      const request = await gtcr.getRequestInfo(itemID, 0);
      const roundInfo = await gtcr.getRoundInfo(itemID, 0, request.numberOfRounds - 1);

      assert.equal(roundInfo.hasPaid[PARTY.CHALLENGER], true, "Failed to register the party has paid");
    });

    it("Should demand correct appeal fees and register that appeal fee has been paid", async () => {
      let roundInfo;

      await gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, { value: loserAppealFee });

      roundInfo = await gtcr.getRoundInfo(itemID, 0, 1);

      assert.equal(
        roundInfo.amountPaid[PARTY.REQUESTER].toNumber(),
        loserAppealFee,
        "Registered fee of the requester is incorrect"
      );
      assert.equal(
        roundInfo.hasPaid[PARTY.REQUESTER],
        true,
        "Did not register that the requester successfully paid his fees"
      );

      assert.equal(
        roundInfo.amountPaid[PARTY.CHALLENGER].toNumber(),
        0,
        "Should not register any payments for challenger"
      );
      assert.equal(
        roundInfo.hasPaid[PARTY.CHALLENGER],
        false,
        "Should not register that challenger successfully paid fees"
      );
      assert.equal(roundInfo.feeRewards.toNumber(), loserAppealFee, "Incorrect FeeRewards value");

      // Increase time to make sure winner can pay in 2nd half.
      await time.increase(appealTimeOut / 2 + 1);

      await gtcr.connect(challenger).fundAppeal(itemID, 2, {
        value: winnerAppealFee - 1,
      }); // Underpay to see if it's registered correctly

      roundInfo = await gtcr.getRoundInfo(itemID, 0, 1);

      assert.equal(
        roundInfo.amountPaid[PARTY.CHALLENGER].toNumber(),
        winnerAppealFee - 1,
        "Registered partial fee of the challenger is incorrect"
      );
      assert.equal(
        roundInfo.hasPaid[PARTY.CHALLENGER],
        false,
        "Should not register that the challenger successfully paid his fees after partial payment"
      );

      assert.equal(
        roundInfo[3].toNumber(),
        loserAppealFee + winnerAppealFee - 1,
        "Incorrect FeeRewards value after partial payment"
      );

      await gtcr.connect(challenger).fundAppeal(itemID, PARTY.CHALLENGER, {value: "5000000000000000000" });

      roundInfo = await gtcr.getRoundInfo(itemID, 0, 1);

      assert.equal(
        roundInfo.amountPaid[PARTY.CHALLENGER].toNumber(),
        winnerAppealFee,
        "Registered fee of challenger is incorrect"
      );
      assert.equal(
        roundInfo.hasPaid[PARTY.CHALLENGER],
        true,
        "Did not register that challenger successfully paid his fees"
      );

      assert.equal(
        roundInfo[3].toNumber(),
        winnerAppealFee + loserAppealFee - arbitrationCost,
        "Incorrect fee rewards value"
      );
    });

    it("Should create a new round when an appeal is successfully funded by both sides", async () => {
      await gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, {value: loserAppealFee });
      await gtcr.connect(challenger).fundAppeal(itemID, PARTY.CHALLENGER, { value: winnerAppealFee });

      // If both sides pay their fees it starts new appeal round. Check that both sides have their value set to default.
      const roundInfo = await gtcr.getRoundInfo(itemID, 0, 2);

      assert.equal(
        roundInfo.hasPaid[PARTY.REQUESTER],
        false,
        "Appeal fee payment for requester should not be registered in the new round"
      );
      assert.equal(
        roundInfo.hasPaid[PARTY.CHALLENGER],
        false,
        "Appeal fee payment for challenger should not be registered in the new round"
      );
    });
  });

  describe("When the dispute is ruled", () => {
    let tx;
    let itemID;
    let loserAppealFee;

    beforeEach("Request to add item", async () => {
      tx = await gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
        value: submitterTotalCost,
      });
      txReceipt = await tx.wait();
      itemID = txReceipt.events[0].args._itemID;
      // Appeal fee is the same as arbitration fee for this arbitrator.
      loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
        value: submissionChallengeTotalCost,
      });

      assert.equal(
        (await web3.eth.getBalance(gtcr.address)).toString(),
        (submitterTotalCost + submissionChallengeTotalCost - arbitrationCost).toString(),
        "Incorrect contract balance."
      );
    });

    it("Should reimburse the requuester and the challenger of half of the remaining deposit when arbitrator refused to rule", async () => {
      const balanceRequesterBefore = await web3.eth.getBalance(requester.address);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger.address);

      await arbitrator.connect(governor).giveRuling(1, PARTY.NONE);
      await time.increase(appealTimeOut + 1);
      await arbitrator.connect(governor).giveRuling(1, PARTY.NONE);

      const balanceRequesterAfter = await web3.eth.getBalance(requester.address);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger.address);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const item = await gtcr.items(itemID);
      assert.equal(item.status, 0, "Item should have status Absent");

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling, PARTY.NONE, "Request has incorrect ruling");

      const availableReward = new BN(submitterTotalCost + submissionChallengeTotalCost - arbitrationCost);

      const requesterBalanceChange = new BN(balanceRequesterAfter).sub(new BN(balanceRequesterBefore));
      const challengerBalanceChange = new BN(balanceChallengerAfter).sub(new BN(balanceChallengerBefore));

      assert(
        // Account for rounding errors.
        requesterBalanceChange.sub(availableReward.div(new BN(2))).lte(new BN(1)),
        "Requester was not properly reimbursed"
      );
      assert(
        // Account for rounding errors.
        challengerBalanceChange.sub(availableReward.div(new BN(2))).lte(new BN(1)),
        "Challenger was not properly reimbursed"
      );

      // Account for rounding errors.
      assert(new BN(GTCRBalanceAfter).lte(new BN(1)), "Invalid contract balance");
    });

    it("Should pay all parties correctly and set correct values when requester wins", async () => {
      const balanceRequesterBefore = await web3.eth.getBalance(requester.address);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger.address);

      await arbitrator.connect(governor).giveRuling(1, PARTY.REQUESTER);
      await time.increase(appealTimeOut + 1);
      await arbitrator.connect(governor).giveRuling(1, PARTY.REQUESTER);

      const balanceRequesterAfter = await web3.eth.getBalance(requester.address);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger.address);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling, PARTY.REQUESTER, "Request has incorrect ruling");

      const availableReward = new BN(submitterTotalCost + submissionChallengeTotalCost - arbitrationCost);

      const requesterBalanceChange = new BN(balanceRequesterAfter).sub(new BN(balanceRequesterBefore));
      const challengerBalanceChange = new BN(balanceChallengerAfter).sub(new BN(balanceChallengerBefore));

      assert.equal(
        requesterBalanceChange.toString(),
        availableReward.toString(),
        "Requester was not properly reimbursed"
      );

      assert.equal(challengerBalanceChange.toString(), "0", "Challenger balance unexpectedly changed");

      assert.equal(GTCRBalanceAfter, "0", "Invalid contract balance");
    });

    it("Should pay all parties correctly and set correct values when challenger wins", async () => {
      const balanceRequesterBefore = await web3.eth.getBalance(requester.address);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger.address);

      await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);
      await time.increase(appealTimeOut + 1);
      await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

      const balanceRequesterAfter = await web3.eth.getBalance(requester.address);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger.address);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling, PARTY.CHALLENGER, "Request has incorrect ruling");

      const availableReward = new BN(submitterTotalCost + submissionChallengeTotalCost - arbitrationCost);

      const requesterBalanceChange = new BN(balanceRequesterAfter).sub(new BN(balanceRequesterBefore));
      const challengerBalanceChange = new BN(balanceChallengerAfter).sub(new BN(balanceChallengerBefore));

      assert.equal(
        challengerBalanceChange.toString(),
        availableReward.toString(),
        "Challenger was not properly reimbursed"
      );

      assert.equal(requesterBalanceChange.toString(), "0", "Requester balance unexpectedly changed");

      // Account for rounding errors.
      assert.equal(GTCRBalanceAfter, "0", "Invalid contract balance");
    });

    it("Should change the ruling if the loser paid appeal fee while winner did not", async () => {
      await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

      // Invert the ruling so the requester should win
      await gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, {
        value: loserAppealFee,
      });

      const balanceRequesterBefore = await web3.eth.getBalance(requester.address);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger.address);

      await time.increase(appealTimeOut + 1);
      await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

      const balanceRequesterAfter = await web3.eth.getBalance(requester.address);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger.address);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling, PARTY.REQUESTER, "Request has incorrect ruling");

      const availableReward = new BN(submitterTotalCost + submissionChallengeTotalCost - arbitrationCost);

      const requesterBalanceChange = new BN(balanceRequesterAfter).sub(new BN(balanceRequesterBefore));
      const challengerBalanceChange = new BN(balanceChallengerAfter).sub(new BN(balanceChallengerBefore));

      assert.equal(
        requesterBalanceChange.toString(),
        availableReward.toString(),
        "Requester was not properly reimbursed"
      );

      assert.equal(challengerBalanceChange.toString(), "0", "Challenger balance unexpectedly changed");

      // Fees and rewards have not been withdrawn yet.
      assert.equal(GTCRBalanceAfter, String(loserAppealFee), "Invalid contract balance");
    });
  });

  describe("When withdrawing appeal fees and rewards", () => {
    let tx;
    let itemID;
    let loserAppealFee;

    beforeEach("Request to add item", async () => {
      tx = await gtcr.connect(requester).addItem("/ipfs/Qwabdaa", {
        value: submitterTotalCost,
      });
      let txReceipt = await tx.wait();
      itemID = txReceipt.events[0].args._itemID;
      // Appeal fee is the same as arbitration fee for this arbitrator.
      loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
        value: submissionChallengeTotalCost,
      });
    });

    it("Should withdraw correct fees if dispute had winner/loser", async () => {
      await arbitrator.connect(governor).giveRuling(1, PARTY.REQUESTER);

      // 1st appeal round.
      await gtcr.connect(challenger).fundAppeal(itemID, 2, {
        value: loserAppealFee * 0.2,
      });
      await gtcr.connect(challenger).fundAppeal(itemID, 2, {
        value: loserAppealFee * 0.3,
      });
      await gtcr.connect(other).fundAppeal(itemID, 2, { value: loserAppealFee * 5 });

      const winnerAppealFee = arbitrationCost + (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.connect(other).fundAppeal(itemID, 1, {
        value: winnerAppealFee * 0.8,
      });
      await gtcr.connect(requester).fundAppeal(itemID, 1, {
        value: winnerAppealFee * 0.8,
      });

      await arbitrator.connect(governor).giveRuling(2, PARTY.CHALLENGER); // Change the ruling to see that logic doesn't break.

      // 2nd appeal round.

      // Check that can't withdraw if request is unresolved
      await expectRevert(
        gtcr.connect(governor).withdrawFeesAndRewards(requester.address, itemID, 0, 1),
        "Request must be resolved."
      );

      await gtcr.connect(requester).fundAppeal(itemID, 1, {
        value: winnerAppealFee,
      }); // WinnerAppealFee should not be enough because requester is now loser.

      await time.increase(appealTimeOut + 1);
      await arbitrator.connect(governor).giveRuling(2, PARTY.CHALLENGER);

      const oldBalanceRequester = await web3.eth.getBalance(requester.address);
      await gtcr.connect(governor).withdrawFeesAndRewards(requester.address, itemID, 0, 0);
      let newBalanceRequester = await web3.eth.getBalance(requester.address);
      assert(
        new BN(newBalanceRequester).eq(new BN(oldBalanceRequester)),
        "The balance of the requester should stay the same after withdrawing from the first round"
      );

      await gtcr.connect(governor).withdrawFeesAndRewards(requester.address, itemID, 0, 2);
      newBalanceRequester = await web3.eth.getBalance(requester.address);
      assert(
        new BN(newBalanceRequester).eq(new BN(oldBalanceRequester).add(new BN(winnerAppealFee))),
        "The requester should be reimbursed what he paid in the 2nd appeal round"
      );

      const oldBalanceChallenger = await web3.eth.getBalance(challenger.address);
      await gtcr.connect(governor).withdrawFeesAndRewards(challenger.address, itemID, 0, 1);
      const newBalanceChallenger = await web3.eth.getBalance(challenger.address);
      assert(
        new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger).add(new BN(1000))), // Challenger paid a half of his fees so he geth the half of feeRewards
        "The challenger was not reimbursed correctly"
      );

      const oldBalanceCrowdfunder = await web3.eth.getBalance(other.address);
      await gtcr.connect(governor).withdrawFeesAndRewards(other.address, itemID, 0, 1);
      const newBalanceCrowdfunder = await web3.eth.getBalance(other.address);
      assert(
        new BN(newBalanceCrowdfunder).eq(new BN(oldBalanceCrowdfunder).add(new BN(1000))), // Crowdfunder paid only half of the fees as well
        "The crowdfunder was not reimbursed correctly"
      );
    });

    it("Should withdraw correct fees if arbitrator refused to arbitrate", async () => {
      await arbitrator.connect(governor).giveRuling(1, PARTY.NONE);

      // 1st appeal round.
      const sharedAppealFee = arbitrationCost + (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.connect(requester).fundAppeal(itemID, 1, {
        value: sharedAppealFee * 0.4,
      });
      await gtcr.connect(challenger).fundAppeal(itemID, 2, {
        value: sharedAppealFee * 0.6,
      });

      await gtcr.connect(other).fundAppeal(itemID, 1, { value: sharedAppealFee });
      await gtcr.connect(other).fundAppeal(itemID, 2, {value: sharedAppealFee });

      await arbitrator.connect(governor).giveRuling(2, PARTY.NONE);
      await time.increase(appealTimeOut + 1);
      await arbitrator.connect(governor).giveRuling(2, PARTY.NONE);

      const oldBalanceRequester = await web3.eth.getBalance(requester.address);
      await gtcr.connect(governor).withdrawFeesAndRewards(requester.address, itemID, 0, 1);
      const newBalanceRequester = await web3.eth.getBalance(requester.address);
      assert(
        new BN(newBalanceRequester).eq(new BN(oldBalanceRequester).add(new BN(400))), // Gets 1/5 of total reward
        "The requester was not reimbursed correctly"
      );

      const oldBalanceChallenger = await web3.eth.getBalance(challenger.address);
      await gtcr.connect(governor).withdrawFeesAndRewards(challenger.address, itemID, 0, 1);
      const newBalanceChallenger = await web3.eth.getBalance(challenger.address);
      assert(
        new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger).add(new BN(600))), /// Gets 3/10 of total reward
        "The challenger was not reimbursed correctly"
      );

      const oldBalanceCrowdfunder = await web3.eth.getBalance(other.address);
      await gtcr.connect(governor).withdrawFeesAndRewards(other.address, itemID, 0, 1);
      const newBalanceCrowdfunder = await web3.eth.getBalance(other.address);

      assert(
        new BN(newBalanceCrowdfunder).eq(new BN(oldBalanceCrowdfunder).add(new BN(1000))), // Gets half of the total reward
        "The crowdfunder was not reimbursed correctly after withdrawing from the first round"
      );
    });
  });

  it("Check various cases of status requirements and the removing request", async () => {
    // 1st request.
    const tx = await gtcr.connect(requester).addItem("0xaabbaa", {
      value: submitterTotalCost,
    });
    let txReceipt = await tx.wait();
    const itemID = txReceipt.events[0].args._itemID;
    await time.increase(challengePeriodDuration + 1);
    await gtcr.connect(governor).executeRequest(itemID);

    // 2th request.
    await gtcr.connect(requester).removeItem(itemID, "", {
      value: removalTotalCost,
    });

    await gtcr.connect(challenger).challengeRequest(itemID, "evidence", {
      value: removalChallengeTotalCost,
    });

    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);
    await gtcr.connect(challenger).fundAppeal(itemID, 2, { value: 1 }); // Just check that appeal works, the value is irrelevant.
    await time.increase(appealTimeOut + 1);
    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

    let item = await gtcr.getItemInfo(itemID);
    assert.equal(item[0], 1, "Item should have status Registered");

    // 3th request.
    await gtcr.connect(requester).removeItem(itemID, "", {
      value: removalTotalCost,
    });
    await time.increase(challengePeriodDuration + 1);

    await gtcr.connect(governor).executeRequest(itemID);
    item = await gtcr.getItemInfo(itemID);
    assert.equal(item[0], 0, "Item should have status Absent");
    assert.equal(item[1], 3, "The total number of requests is incorrect");

    await gtcr.connect(requester).addItem("0x1221", { value: submitterTotalCost });
  });

  it("Only the governor should be allowed to change state variables", async () => {
    await expectRevert(gtcr.connect(other).changeChallengePeriodDuration(11), "The caller must be the governor.");
    await gtcr.connect(governor).changeChallengePeriodDuration(11);
    assert.equal((await gtcr.challengePeriodDuration()).toNumber(), 11, "Incorrect challengePeriodDuration value");

    await expectRevert(gtcr.connect(other).changeSubmissionBaseDeposit(22), "The caller must be the governor.");
    await gtcr.connect(governor).changeSubmissionBaseDeposit(22);
    assert.equal((await gtcr.submissionBaseDeposit()).toNumber(), 22, "Incorrect submissionBaseDeposit value");

    await expectRevert(gtcr.connect(other).changeRemovalBaseDeposit(23), "The caller must be the governor.");
    await gtcr.connect(governor).changeRemovalBaseDeposit(23);
    assert.equal((await gtcr.removalBaseDeposit()).toNumber(), 23, "Incorrect removalBaseDeposit value");

    await expectRevert(
      gtcr.connect(other).changeSubmissionChallengeBaseDeposit(44),
      "The caller must be the governor."
    );
    await gtcr.connect(governor).changeSubmissionChallengeBaseDeposit(44);
    assert.equal(
      (await gtcr.submissionChallengeBaseDeposit()).toNumber(),
      44,
      "Incorrect submissionChallengeBaseDeposit value"
    );

    await expectRevert(gtcr.connect(other).changeRemovalChallengeBaseDeposit(55), "The caller must be the governor.");
    await gtcr.connect(governor).changeRemovalChallengeBaseDeposit(55);
    assert.equal(
      (await gtcr.removalChallengeBaseDeposit()).toNumber(),
      55,
      "Incorrect removalChallengeBaseDeposit value"
    );

    await expectRevert(gtcr.connect(governor2).changeGovernor(governor2.address), "The caller must be the governor.");
    await gtcr.connect(governor).changeGovernor(governor2.address);
    assert.equal(await gtcr.governor(), governor2.address, "Incorrect governor address");

    await expectRevert(gtcr.connect(governor).changeSharedStakeMultiplier(44), "The caller must be the governor.");
    await gtcr.connect(governor2).changeSharedStakeMultiplier(44);
    assert.equal((await gtcr.sharedStakeMultiplier()).toNumber(), 44, "Incorrect sharedStakeMultiplier value");

    await expectRevert(gtcr.connect(other).changeWinnerStakeMultiplier(55), "The caller must be the governor.");
    await gtcr.connect(governor2).changeWinnerStakeMultiplier(55);
    assert.equal((await gtcr.winnerStakeMultiplier()).toNumber(), 55, "Incorrect winnerStakeMultiplier value");

    await expectRevert(gtcr.connect(other).changeLoserStakeMultiplier(66), "The caller must be the governor.");
    await gtcr.connect(governor2).changeLoserStakeMultiplier(66);
    assert.equal((await gtcr.loserStakeMultiplier()).toNumber(), 66, "Incorrect loserStakeMultiplier value");

    await expectRevert(
      gtcr.connect(other).changeArbitrationParams(other.address, "0xff", "/ipfs/Qmfoo", "/ipfs/Qmbar"),
      "The caller must be the governor."
    );
    await gtcr.connect(governor2).changeArbitrationParams(other.address, "0xff", "/ipfs/Qmfoo", "/ipfs/Qmbar");
    assert.equal(await gtcr.arbitrator(), other.address, "Incorrect arbitrator address");
    assert.equal(await gtcr.arbitratorExtraData(), "0xff", "Incorrect extraData value");

    await expectRevert(gtcr.connect(other).changeConnectedTCR(other.address), "The caller must be the governor.");

    // Ensure `changeConnectedTCR` emits an event with the new address.
    const txChangeConnected = await gtcr.connect(governor2).changeConnectedTCR(governor2.address);
    let txChangeConnectedReceipt = await txChangeConnected.wait();
    assert.equal(
        txChangeConnectedReceipt.events[0].args._connectedTCR,
      governor2.address,
      "The event has the wrong connectedTCR address"
    );

    await expectRevert(gtcr.connect(other).changeRelayerContract(other.address), "The caller must be the governor.");
    await gtcr.connect(governor2).changeRelayerContract(other.address);
    assert.equal(await gtcr.relayerContract(), other.address, "Incorrect relayerContract address");
  });

  describe("When using the relayer to modify the registry", () => {
    it("Should correctly add an item directly", async () => {
      await expectRevert(gtcr.connect(other).addItemDirectly("/ipfs/Qwabdaa"), "The caller must be the relay.");

      await relay.add(gtcr.address, "/ipfs/Qwabdaa");
      const itemID = soliditySha3("/ipfs/Qwabdaa");
      assert.equal(itemID, soliditySha3("/ipfs/Qwabdaa"), "Item ID has not been set up properly");

      const item = await gtcr.getItemInfo(itemID);
      assert.equal(item[0], 1, "Item status should be Registered");

      await expectRevert(relay.add(gtcr.address, "/ipfs/Qwabdaa"), "Item must be absent to be added.");
    });

    it("Should correctly remove an item directly", async () => {
      await relay.add(gtcr.address, "/ipfs/Qwadddggbdaa");
      const itemID = soliditySha3("/ipfs/Qwadddggbdaa");

      await expectRevert(gtcr.connect(other).removeItemDirectly(itemID), "The caller must be the relay.");

      await relay.remove(gtcr.address, itemID);

      const item = await gtcr.getItemInfo(itemID);
      assert.equal(item[0], 0, "Item status should be Absent");
      assert.equal(item[1], 0, "Item has incorrect number of requests"); // Direct adds don't generate requests.

      await expectRevert(relay.remove(gtcr.address, itemID), "Item must be registered to be removed.");
    });
  });

  describe("When updating arbitration params", () => {
    let newParams;
    let updateTx;
    let updateTxReceipt;
    const expectedRegistrationMetaEvidenceID = 2;
    const expectedClearingMetaEvidenceID = 3;

    beforeEach("Update arbitration params", async () => {
      newParams = {
        arbitrator: newArbitrator.address,
        arbitratorExtraData: "0x20",
        registrationMetaEvidence: "/ipfs/Qmfoo",
        clearingMetaEvidence: "/ipfs/Qmbar",
      };

      updateTx = await gtcr.connect(governor).changeArbitrationParams(
        newParams.arbitrator,
        newParams.arbitratorExtraData,
        newParams.registrationMetaEvidence,
        newParams.clearingMetaEvidence,
      );
     updateTxReceipt = await updateTx.wait();
      await time.increase(600);
    });
    it("Should emit the correct MetaEvidence events", async () => {

      assert.equal(updateTxReceipt.events[0].args._metaEvidenceID.toString(),expectedRegistrationMetaEvidenceID.toString(),"incorrect MetaEvidenceId");
      assert.equal(updateTxReceipt.events[0].args._evidence.toString(),newParams.registrationMetaEvidence.toString(),"incorrect Evidence");

      assert.equal(updateTxReceipt.events[1].args._metaEvidenceID.toString(),expectedClearingMetaEvidenceID.toString(),"incorrect MetaEvidenceId");
      assert.equal(updateTxReceipt.events[1].args._evidence.toString(),newParams.clearingMetaEvidence.toString(),"incorrect Evidence");
     
    });

    describe("When registering an item", () => {
      let addTx;
      let itemID;
      let evidenceGroupID;

      beforeEach("Add item request", async () => {
        addTx = await gtcr.connect(requester).addItem("0xaabbaa", {
          value: submitterTotalCost,
        });
        let addTxReceipt =await addTx.wait();
        itemID = addTxReceipt.events[0].args._itemID;
        evidenceGroupID = new BN(soliditySha3(itemID, 0).slice(2), 16);
      assert.equal(addTxReceipt.events[1].args._itemID.toString(),itemID.toString(),"incorrect ItemId");
     // assert.equal(addTxReceipt.events[1].args._evidenceGroupID,evidenceGroupID,"incorrect EvidenceGroupId");
      
      //   expectEvent(addTxReceipt.events[0], "RequestSubmitted", {
      //     _itemID: itemID,
      //     _evidenceGroupID: evidenceGroupID,
      //   });
      });

      it("Should use the updated arbitration params for the request", async () => {
        const requestInfo = await gtcr.getRequestInfo(itemID, 0);

        assert.equal(requestInfo.requestArbitrator, newParams.arbitrator, "Invalid arbitrator");
        assert.equal(
          requestInfo.requestArbitratorExtraData,
          newParams.arbitratorExtraData,
          "Invalid arbitrator extra data"
        );
        // Registration metadata
        assert.equal(
          requestInfo.metaEvidenceID.toNumber(),
          expectedRegistrationMetaEvidenceID,
          "Invalid MetaEvidence ID"
        );
      });

      it("Should use the updated arbitration params when challenging the request", async () => {
        const txChallenge = await gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
          value: submissionChallengeTotalCost
        });
        let txChallengeReceipt = await txChallenge.wait();
      assert.equal(txChallengeReceipt.events[2].args._arbitrator,newParams.arbitrator,"incorrect arbitrator");
      assert.equal(txChallengeReceipt.events[2].args._disputeID.toString(),"0","incorrect disputeId");
      assert.equal(txChallengeReceipt.events[2].args._metaEvidenceID.toString(),expectedRegistrationMetaEvidenceID.toString(),"incorrect metaEvidenceId");
      assert.equal(txChallengeReceipt.events[2].args._evidenceGroupID.toString(),evidenceGroupID.toString(),"incorrect evidenceGroupId");
      });
    });

    describe("When removing an item", () => {
      let removeTx;
      let itemID;
      let evidenceGroupID;

      beforeEach("Add item and request the removal", async () => {
        const addTx = await gtcr.connect(requester).addItem("0xaabbaa", {
          value: submitterTotalCost,
        });
        let addTxReceipt = await addTx.wait();
        itemID = addTxReceipt.events[0].args._itemID;

        await time.increase(challengePeriodDuration + 1);
        await gtcr.connect(governor).executeRequest(itemID);

        removeTx = await gtcr.connect(requester).removeItem(itemID, "", {
          value: removalTotalCost,
        });
        let removeTxReceipt = await removeTx.wait();
        evidenceGroupID = new BN(soliditySha3(itemID, 1).slice(2), 16);
      assert.equal(removeTxReceipt.events[0].args._itemID.toString(),itemID.toString(),"incorrect itemId");
      assert.equal(removeTxReceipt.events[0].args._evidenceGroupID.toString(),evidenceGroupID.toString(),"incorrect evidenceGroupId");
      
        // expectEvent(removeTx, "RequestSubmitted", {
        //   _itemID: itemID,
        //   _evidenceGroupID: evidenceGroupID,
        // });
      });

      it("Should use the updated arbitration params for the request", async () => {
        const requestInfo = await gtcr.getRequestInfo(itemID, 1);

        assert.equal(requestInfo.requestArbitrator, newParams.arbitrator, "Invalid arbitrator");
        assert.equal(
          requestInfo.requestArbitratorExtraData,
          newParams.arbitratorExtraData,
          "Invalid arbitrator extra data"
        );
        // Clearing metadata
        assert.equal(requestInfo.metaEvidenceID.toNumber(), expectedClearingMetaEvidenceID, "Invalid MetaEvidence ID");
      });

      it("Should use the updated arbitration params when challenging the request", async () => {
        const txChallenge = await gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
          value: submissionChallengeTotalCost,
        });
        let txChallengeReceipt = await txChallenge.wait();
      assert.equal(txChallengeReceipt.events[2].args._arbitrator,newParams.arbitrator,"incorrect arbitrator");
      assert.equal(txChallengeReceipt.events[2].args._disputeID.toString(),"0","incorrect itemId");
      assert.equal(txChallengeReceipt.events[2].args._metaEvidenceID.toString(),expectedClearingMetaEvidenceID.toString(),"incorrect itemId");
      assert.equal(txChallengeReceipt.events[2].args._evidenceGroupID.toString(),evidenceGroupID.toString(),"incorrect itemId");
      
        // await expectEvent(txChallenge, "Dispute", {
        //   _arbitrator: newParams.arbitrator,
        //   _disputeID: "0",
        //   _metaEvidenceID: String(expectedClearingMetaEvidenceID),
        //   _evidenceGroupID: evidenceGroupID,
        // });
      });
    });
  });

  describe("When updating arbitration params multiple times", () => {
    it("Should get the right arbitration params for an item in the middle of several updates #regression", async () => {
      const changes = Array(10)
        .fill()
        .map((_, i) => ({
          arbitrator: newArbitrator.address,
          arbitratorExtraData: "0x" + Number(i).toString(16).padStart(2, "0"),
          registrationMetaEvidence: "/ipfs/Qmfoo-" + Number(i).toString(16).padStart(2, "0"),
          clearingMetaEvidence: "/ipfs/Qmbar-" + Number(i).toString(16).padStart(2, "0"),
        }));
      const changesBefore = 5;
      const expectedRegistrationMetaEvidenceID = 12;

      for (let i = 0; i <= changesBefore; i++) {
        await gtcr.connect(governor).changeArbitrationParams(
          changes[i].arbitrator,
          changes[i].arbitratorExtraData,
          changes[i].registrationMetaEvidence,
          changes[i].clearingMetaEvidence
        );
        await time.increase(5);
      }

      const addTx = await gtcr.connect(requester).addItem("0xaabbaa", {
        value: submitterTotalCost,
      });
      let addTxReceipt = await addTx.wait();
      const itemID = addTxReceipt.events[0].args._itemID;

      for (let i = changesBefore + 1; i < changes.lenght; i++) {
        await gtcr.connect(governor).changeArbitrationParams(
          changes[i].arbitrator,
          changes[i].arbitratorExtraData,
          changes[i].registrationMetaEvidence,
          changes[i].clearingMetaEvidence
        );
        await time.increase(5);
      }

      const requestInfo = await gtcr.getRequestInfo(itemID, 0);

      assert.equal(requestInfo.requestArbitratorExtraData, changes[changesBefore].arbitratorExtraData);
      assert.equal(requestInfo.metaEvidenceID.toNumber(), expectedRegistrationMetaEvidenceID);
    });
  });

  describe("When there is a pending request before updating arbitration params", () => {
    let newParams;

    let addTx;
    let itemID;

    const originalRegistrationMetaEvidenceID = 0;
    const updatedClearingMetaEvidenceID = 3;

    beforeEach("Add item and update arbitration params", async () => {
      newParams = {
        arbitrator: newArbitrator.address,
        arbitratorExtraData: "0x20",
        registrationMetaEvidence: "/ipfs/Qmfoo",
        clearingMetaEvidence: "/ipfs/Qmbar",
      };

      addTx = await gtcr.connect(requester).addItem("0xaabbaa", {
        value: submitterTotalCost,
      });
      let addTxReceipt = await addTx.wait();
      itemID = addTxReceipt.events[0].args._itemID;

      await gtcr.connect(governor).changeArbitrationParams(
        newParams.arbitrator,
        newParams.arbitratorExtraData,
        newParams.registrationMetaEvidence,
        newParams.clearingMetaEvidence
      );

      await time.increase(challengePeriodDuration / 2);
    });

    it("Should use the original arbitration params for the existing request", async () => {
      const requestInfo = await gtcr.getRequestInfo(itemID, 0);

      assert.equal(requestInfo.requestArbitrator, arbitrator.address, "Invalid arbitrator");
      assert.equal(requestInfo.requestArbitratorExtraData, arbitratorExtraData, "Invalid arbitrator extra data");
      // Clearing metadata
      assert.equal(
        requestInfo.metaEvidenceID.toNumber(),
        originalRegistrationMetaEvidenceID,
        "Invalid MetaEvidence ID"
      );
    });

    it("Should use the original arbitration params for appeals regarding the existing request", async () => {
      // Appeal fee is the same as arbitration fee for this arbitrator.
      const loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;
      const winnerAppealFee = arbitrationCost + (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR;
      await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
        value: submissionChallengeTotalCost,
      });

      await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

      await gtcr.connect(requester).fundAppeal(itemID, PARTY.REQUESTER, {  value: loserAppealFee });
      const appealTx = await gtcr.connect(requester).fundAppeal(itemID, PARTY.CHALLENGER, { value: winnerAppealFee });
      expect(appealTx).to.emit(arbitrator, "AppealDecision").withArgs("1", gtcr.address);
    });

    it("Should use the updated arbitration params for the subsequent requests for the same item", async () => {
      await time.increase(challengePeriodDuration);
      await gtcr.connect(governor).executeRequest(itemID);

      await gtcr.connect(requester).removeItem(itemID, "/ipfs/Qmfoo", {
        value: removalTotalCost,
      });

      const requestInfo = await gtcr.getRequestInfo(itemID, 1);

      assert.equal(requestInfo.requestArbitrator, newParams.arbitrator, "Invalid arbitrator");
      assert.equal(
        requestInfo.requestArbitratorExtraData,
        newParams.arbitratorExtraData,
        "Invalid arbitrator extra data"
      );
      // Clearing metadata
      assert.equal(requestInfo.metaEvidenceID.toNumber(), updatedClearingMetaEvidenceID, "Invalid MetaEvidence ID");
    });
  });
});
