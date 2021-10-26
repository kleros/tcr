const { web3 } = require("hardhat");
const { BN, expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const { soliditySha3 } = require("web3-utils");

const GTCR = artifacts.require("./LightGeneralizedTCR.sol");
const LightGTCRFactory = artifacts.require("./LightGTCRFactory.sol");
const Arbitrator = artifacts.require("EnhancedAppealableArbitrator");

const RelayMock = artifacts.require("RelayMock");

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
    const accounts = await web3.eth.getAccounts();

    governor = accounts[0];
    requester = accounts[1];
    challenger = accounts[2];
    other = accounts[3];
    governor2 = accounts[4];
    arbitratorExtraData = "0x85";
    arbitrationCost = 1000;
  });

  beforeEach("initialize the contract", async function () {
    arbitrator = await Arbitrator.new(arbitrationCost, governor, arbitratorExtraData, appealTimeOut, {
      from: governor,
    });
    newArbitrator = await Arbitrator.new(arbitrationCost, governor, arbitratorExtraData, appealTimeOut, {
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

    MULTIPLIER_DIVISOR = (await gtcr.MULTIPLIER_DIVISOR()).toNumber();
    submitterTotalCost = arbitrationCost + submissionBaseDeposit;
    removalTotalCost = arbitrationCost + removalBaseDeposit;
    submissionChallengeTotalCost = arbitrationCost + submissionChallengeBaseDeposit;
    removalChallengeTotalCost = arbitrationCost + removalChallengeBaseDeposit;
  });

  it("Should set the correct values in constructor", async () => {
    assert.equal(await gtcr.arbitrator(), arbitrator.address);
    assert.equal(await gtcr.arbitratorExtraData(), arbitratorExtraData);
    assert.equal(await gtcr.governor(), governor);
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
        gtcr.addItem("/ipfs/Qwabdaa", {
          from: requester,
          value: submitterTotalCost - 1,
        }),
        "You must fully fund the request."
      );
    });

    it("Should revert when there already is a request to add the same item", async () => {
      await gtcr.addItem("/ipfs/Qwabdaa", {
        from: requester,
        value: submitterTotalCost,
      });

      await expectRevert(
        gtcr.addItem("/ipfs/Qwabdaa", {
          from: requester,
          value: submitterTotalCost,
        }),
        "Item must be absent to be added."
      );
    });

    it("Should set the correct values and fire the event when requesting registration", async () => {
      const txAddItem = await gtcr.addItem("/ipfs/Qwabdaa", {
        from: requester,
        value: submitterTotalCost,
      });

      await expectRevert(
        gtcr.addItem("/ipfs/Qwabdaa", {
          from: requester,
          value: submitterTotalCost,
        }),
        "Item must be absent to be added."
      );

      const itemID = txAddItem.logs[0].args._itemID;
      assert.equal(itemID, soliditySha3("/ipfs/Qwabdaa"), "Item ID has not been set up properly");

      const item = await gtcr.items(itemID);
      assert.equal(item.status.toNumber(), 2, "Item status has not been set up properly");

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request[4][1], requester, "Requester has not been set up properly");
      assert.equal(request[7], arbitrator.address, "Request arbitrator has not been set up properly");
      assert.equal(request[8], arbitratorExtraData, "Request extra data has not been set up properly");

      assert.equal(
        item.sumDeposit.toNumber(),
        submitterTotalCost,
        "Requester paidFees has not been registered correctly"
      );

      assert.equal(txAddItem.logs[1].event, "RequestSubmitted", "The event has not been created");
      assert.equal(txAddItem.logs[0].args._itemID, itemID, "The event has wrong item ID");
    });
  });

  describe("When challenging a registration request", () => {
    let tx;
    let itemID;

    beforeEach("Request to add item", async () => {
      tx = await gtcr.addItem("/ipfs/Qwabdaa", {
        from: requester,
        value: submitterTotalCost,
      });
      itemID = tx.logs[0].args._itemID;
    });

    it("Should revert when the challenger do provide the full deposit", async () => {
      await expectRevert(
        gtcr.challengeRequest(itemID, "Evidence.json", {
          from: challenger,
          value: submissionChallengeTotalCost - 1,
        }),
        "You must fully fund the request."
      );
    });

    it("Should set the correct values and create a dispute after the item is challenged and fire 2 events", async () => {
      const txChallenge = await gtcr.challengeRequest(itemID, "Evidence.json", {
        from: challenger,
        value: submissionChallengeTotalCost,
      });

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.parties[2], challenger, "Challenger has not been set up properly");
      assert.equal(request.disputed, true, "The request should have status disputed");
      assert.equal(request.disputeID.toNumber(), 1, "Dispute ID has not been set up properly");
      assert.equal(request.numberOfRounds.toNumber(), 1, "Number of rounds should have been incremented");

      const arbitratorDisputeIDToItemID = await gtcr.arbitratorDisputeIDToItemID(arbitrator.address, 1);
      assert.equal(arbitratorDisputeIDToItemID, itemID, "Incorrect arbitratorDisputeIDToItemID value");

      const item = await gtcr.items(itemID);
      const expectedRemainingDeposit = submitterTotalCost + submissionChallengeTotalCost - arbitrationCost;
      assert.equal(item.sumDeposit.toNumber(), expectedRemainingDeposit);

      const dispute = await arbitrator.disputes(1);
      assert.equal(dispute[0], gtcr.address, "Arbitrable not set up properly");
      assert.equal(dispute[1].toNumber(), 2, "Number of choices not set up properly");

      const evidenceGroupID = parseInt(soliditySha3(itemID, 0), 16);
      assert.equal(txChallenge.logs[0].event, "Dispute", "The event Dispute has not been created");
      assert.equal(txChallenge.logs[0].args._arbitrator, arbitrator.address, "The event has wrong arbitrator");
      assert.equal(txChallenge.logs[0].args._disputeID.toNumber(), 1, "The event has wrong dispute ID");
      assert.equal(txChallenge.logs[0].args._metaEvidenceID.toNumber(), 0, "The event has wrong metaevidence ID");
      assert.equal(txChallenge.logs[0].args._evidenceGroupID, evidenceGroupID, "The event has wrong evidenceGroup ID");

      assert.equal(txChallenge.logs[1].event, "Evidence", "The event Evidence has not been created");
      assert.equal(txChallenge.logs[1].args._arbitrator, arbitrator.address, "The event has wrong arbitrator");
      assert.equal(txChallenge.logs[1].args._evidenceGroupID, evidenceGroupID, "The event has wrong evidenceGroup ID");
      assert.equal(txChallenge.logs[1].args._party, challenger, "The event has wrong party");
      assert.equal(txChallenge.logs[1].args._evidence, "Evidence.json", "The event has wrong evidence");

      await expectRevert(
        gtcr.challengeRequest(itemID, "Evidence2.json", {
          from: other,
          value: submissionChallengeTotalCost,
        }),
        "The request should not have already been disputed."
      );

      await time.increase(challengePeriodDuration + 1);
      await expectRevert(gtcr.executeRequest(itemID, { from: governor }), "The request should not be disputed.");
    });

    it("Should revert when challenge has passed", async () => {
      await time.increase(challengePeriodDuration + 1);

      await expectRevert(
        gtcr.challengeRequest(itemID, "Evidence.json", {
          from: challenger,
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
      tx = await gtcr.addItem("/ipfs/Qwabdaa", {
        from: requester,
        value: submitterTotalCost,
      });
      itemID = tx.logs[0].args._itemID;
    });

    it("Should revert when trying to execute the request and the challenge period as not passed yet", async () => {
      await expectRevert(gtcr.executeRequest(itemID, { from: governor }), "Time to challenge the request must pass.");
    });

    it("Should successfully execute the request if it has not been challenged and fire the event", async () => {
      const oldBalance = await web3.eth.getBalance(requester);

      await time.increase(challengePeriodDuration + 1);
      const txExecute = await gtcr.executeRequest(itemID, { from: governor });
      const newBalance = await web3.eth.getBalance(requester);

      const item = await gtcr.items(itemID);
      assert.equal(item.status.toNumber(), 1, "Item should have status Registered");

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "Request should be resolved");

      assert.equal(txExecute.logs[0].event, "ItemStatusChange", "The event has not been created");
      assert.equal(txExecute.logs[0].args._itemID, itemID, "The event has wrong item ID");

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
      tx = await gtcr.addItem("/ipfs/Qwabdaa", {
        from: requester,
        value: submitterTotalCost,
      });
      itemID = tx.logs[0].args._itemID;
      // Appeal fee is the same as arbitration fee for this arbitrator.
      loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;
      winnerAppealFee = arbitrationCost + (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.challengeRequest(itemID, "aaa", {
        from: challenger,
        value: submissionChallengeTotalCost,
      });

      await arbitrator.giveRuling(1, PARTY.CHALLENGER);
    });

    it("Should revert when trying to fund an appeal for an unexistent dispute", async () => {
      await expectRevert(
        gtcr.fundAppeal("0x0000000000000000000000000000000000000000000000000000000000000000", 2, {
          from: challenger,
          value: 2e18,
        }),
        "The item must have a pending request."
      );
    });

    it("Should revert when trying to fund an invalid side", async () => {
      await expectRevert(
        gtcr.fundAppeal(itemID, PARTY.NONE, {
          from: challenger,
          value: loserAppealFee,
        }),
        "Invalid side."
      );
    });

    it("Should revert when trying to fund an already fully-funded side", async () => {
      await gtcr.fundAppeal(itemID, PARTY.REQUESTER, { from: requester, value: loserAppealFee });

      await expectRevert(
        gtcr.fundAppeal(itemID, PARTY.REQUESTER, {
          from: requester,
          value: 1e18,
        }),
        "Side already fully funded."
      );
    });

    it("Should reimburse the contributor when there is an overpayment", async () => {
      const overpayment = 1e18;
      const contribution = loserAppealFee + overpayment;
      const oldBalanceRequester = await web3.eth.getBalance(requester);

      await gtcr.fundAppeal(itemID, PARTY.REQUESTER, {
        from: requester,
        value: contribution,
      });

      const newBalanceRequester = await web3.eth.getBalance(requester);
      const balanceChange = new BN(oldBalanceRequester).sub(new BN(newBalanceRequester));

      assert(balanceChange.lt(new BN(String(overpayment))), "Contributor was not properly reimbursed");
    });

    it("Should revert when the loser side tries to fund the appeal after the first half of the appeal period has passed", async () => {
      time.increase(appealTimeOut / 2 + 1);
      await expectRevert(
        gtcr.fundAppeal(itemID, PARTY.REQUESTER, { from: requester, value: loserAppealFee }),
        "The loser must contribute during the first half of the appeal period."
      );
    });

    it("Should be possible for the winner side to fund the appeal after the first half of the appeal period has passed", async () => {
      time.increase(appealTimeOut / 2 + 1);

      await gtcr.fundAppeal(itemID, PARTY.CHALLENGER, { from: challenger, value: winnerAppealFee });

      const request = await gtcr.getRequestInfo(itemID, 0);
      const roundInfo = await gtcr.getRoundInfo(itemID, 0, request.numberOfRounds - 1);

      assert.equal(roundInfo.hasPaid[PARTY.CHALLENGER], true, "Failed to register the party has paid");
    });

    it("Should demand correct appeal fees and register that appeal fee has been paid", async () => {
      let roundInfo;

      await gtcr.fundAppeal(itemID, PARTY.REQUESTER, { from: requester, value: loserAppealFee });

      roundInfo = await gtcr.getRoundInfo(itemID, 0, 0);

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

      await gtcr.fundAppeal(itemID, 2, {
        from: challenger,
        value: winnerAppealFee - 1,
      }); // Underpay to see if it's registered correctly

      roundInfo = await gtcr.getRoundInfo(itemID, 0, 0);

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

      await gtcr.fundAppeal(itemID, PARTY.CHALLENGER, { from: challenger, value: 5e18 });

      roundInfo = await gtcr.getRoundInfo(itemID, 0, 0);

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
      await gtcr.fundAppeal(itemID, PARTY.REQUESTER, { from: requester, value: loserAppealFee });
      await gtcr.fundAppeal(itemID, PARTY.CHALLENGER, { from: challenger, value: winnerAppealFee });

      // If both sides pay their fees it starts new appeal round. Check that both sides have their value set to default.
      const roundInfo = await gtcr.getRoundInfo(itemID, 0, 1);

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
      tx = await gtcr.addItem("/ipfs/Qwabdaa", {
        from: requester,
        value: submitterTotalCost,
      });
      itemID = tx.logs[0].args._itemID;
      // Appeal fee is the same as arbitration fee for this arbitrator.
      loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.challengeRequest(itemID, "aaa", {
        from: challenger,
        value: submissionChallengeTotalCost,
      });

      assert.equal(
        (await web3.eth.getBalance(gtcr.address)).toString(),
        (submitterTotalCost + submissionChallengeTotalCost - arbitrationCost).toString(),
        "Incorrect contract balance."
      );
    });

    it("Should reimburse the requuester and the challenger of half of the remaining deposit when arbitrator refused to rule", async () => {
      const balanceRequesterBefore = await web3.eth.getBalance(requester);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger);

      await arbitrator.giveRuling(1, PARTY.NONE);
      await time.increase(appealTimeOut + 1);
      await arbitrator.giveRuling(1, PARTY.NONE);

      const balanceRequesterAfter = await web3.eth.getBalance(requester);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const item = await gtcr.items(itemID);
      assert.equal(item.status.toNumber(), 0, "Item should have status Absent");

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling.toNumber(), PARTY.NONE, "Request has incorrect ruling");

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
      const balanceRequesterBefore = await web3.eth.getBalance(requester);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger);

      await arbitrator.giveRuling(1, PARTY.REQUESTER);
      await time.increase(appealTimeOut + 1);
      await arbitrator.giveRuling(1, PARTY.REQUESTER);

      const balanceRequesterAfter = await web3.eth.getBalance(requester);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling.toNumber(), PARTY.REQUESTER, "Request has incorrect ruling");

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
      const balanceRequesterBefore = await web3.eth.getBalance(requester);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger);

      await arbitrator.giveRuling(1, PARTY.CHALLENGER);
      await time.increase(appealTimeOut + 1);
      await arbitrator.giveRuling(1, PARTY.CHALLENGER);

      const balanceRequesterAfter = await web3.eth.getBalance(requester);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling.toNumber(), PARTY.CHALLENGER, "Request has incorrect ruling");

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
      await arbitrator.giveRuling(1, PARTY.CHALLENGER);

      // Invert the ruling so the requester should win
      await gtcr.fundAppeal(itemID, PARTY.REQUESTER, {
        from: requester,
        value: loserAppealFee,
      });

      const balanceRequesterBefore = await web3.eth.getBalance(requester);
      const balanceChallengerBefore = await web3.eth.getBalance(challenger);

      await time.increase(appealTimeOut + 1);
      await arbitrator.giveRuling(1, PARTY.CHALLENGER);

      const balanceRequesterAfter = await web3.eth.getBalance(requester);
      const balanceChallengerAfter = await web3.eth.getBalance(challenger);
      const GTCRBalanceAfter = await web3.eth.getBalance(gtcr.address);

      const request = await gtcr.getRequestInfo(itemID, 0);
      assert.equal(request.resolved, true, "The request should be resolved");
      assert.equal(request.ruling.toNumber(), PARTY.REQUESTER, "Request has incorrect ruling");

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
      tx = await gtcr.addItem("/ipfs/Qwabdaa", {
        from: requester,
        value: submitterTotalCost,
      });
      itemID = tx.logs[0].args._itemID;
      // Appeal fee is the same as arbitration fee for this arbitrator.
      loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.challengeRequest(itemID, "aaa", {
        from: challenger,
        value: submissionChallengeTotalCost,
      });
    });

    it("Should withdraw correct fees if dispute had winner/loser", async () => {
      await arbitrator.giveRuling(1, PARTY.REQUESTER);

      // 1st appeal round.
      await gtcr.fundAppeal(itemID, 2, {
        from: challenger,
        value: loserAppealFee * 0.2,
      });
      await gtcr.fundAppeal(itemID, 2, {
        from: challenger,
        value: loserAppealFee * 0.3,
      });
      await gtcr.fundAppeal(itemID, 2, { from: other, value: loserAppealFee * 5 });

      const winnerAppealFee = arbitrationCost + (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.fundAppeal(itemID, 1, {
        from: other,
        value: winnerAppealFee * 0.8,
      });
      await gtcr.fundAppeal(itemID, 1, {
        from: requester,
        value: winnerAppealFee * 0.8,
      });

      await arbitrator.giveRuling(2, PARTY.CHALLENGER); // Change the ruling to see that logic doesn't break.

      // 2nd appeal round.

      // Check that can't withdraw if request is unresolved
      await expectRevert(
        gtcr.withdrawFeesAndRewards(requester, itemID, 0, 1, { from: governor }),
        "Request must be resolved."
      );

      await gtcr.fundAppeal(itemID, 1, {
        from: requester,
        value: winnerAppealFee,
      }); // WinnerAppealFee should not be enough because requester is now loser.

      await time.increase(appealTimeOut + 1);
      await arbitrator.giveRuling(2, PARTY.CHALLENGER);

      const oldBalanceRequester = await web3.eth.getBalance(requester);
      await gtcr.withdrawFeesAndRewards(requester, itemID, 0, 0, {
        from: governor,
      });
      let newBalanceRequester = await web3.eth.getBalance(requester);
      assert(
        new BN(newBalanceRequester).eq(new BN(oldBalanceRequester)),
        "The balance of the requester should stay the same after withdrawing from the first round"
      );

      await gtcr.withdrawFeesAndRewards(requester, itemID, 0, 1, {
        from: governor,
      });
      newBalanceRequester = await web3.eth.getBalance(requester);
      assert(
        new BN(newBalanceRequester).eq(new BN(oldBalanceRequester).add(new BN(winnerAppealFee))),
        "The requester should be reimbursed what he paid in the 2nd appeal round"
      );

      const oldBalanceChallenger = await web3.eth.getBalance(challenger);
      await gtcr.withdrawFeesAndRewards(challenger, itemID, 0, 0, {
        from: governor,
      });
      const newBalanceChallenger = await web3.eth.getBalance(challenger);
      assert(
        new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger).add(new BN(1000))), // Challenger paid a half of his fees so he geth the half of feeRewards
        "The challenger was not reimbursed correctly"
      );

      const oldBalanceCrowdfunder = await web3.eth.getBalance(other);
      await gtcr.withdrawFeesAndRewards(other, itemID, 0, 0, { from: governor });
      const newBalanceCrowdfunder = await web3.eth.getBalance(other);
      assert(
        new BN(newBalanceCrowdfunder).eq(new BN(oldBalanceCrowdfunder).add(new BN(1000))), // Crowdfunder paid only half of the fees as well
        "The crowdfunder was not reimbursed correctly"
      );
    });

    it("Should withdraw correct fees if arbitrator refused to arbitrate", async () => {
      await arbitrator.giveRuling(1, PARTY.NONE);

      // 1st appeal round.
      const sharedAppealFee = arbitrationCost + (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_DIVISOR;

      await gtcr.fundAppeal(itemID, 1, {
        from: requester,
        value: sharedAppealFee * 0.4,
      });
      await gtcr.fundAppeal(itemID, 2, {
        from: challenger,
        value: sharedAppealFee * 0.6,
      });

      await gtcr.fundAppeal(itemID, 1, { from: other, value: sharedAppealFee });
      await gtcr.fundAppeal(itemID, 2, { from: other, value: sharedAppealFee });

      await arbitrator.giveRuling(2, PARTY.NONE);
      await time.increase(appealTimeOut + 1);
      await arbitrator.giveRuling(2, PARTY.NONE);

      const oldBalanceRequester = await web3.eth.getBalance(requester);
      await gtcr.withdrawFeesAndRewards(requester, itemID, 0, 0, {
        from: governor,
      });
      const newBalanceRequester = await web3.eth.getBalance(requester);
      assert(
        new BN(newBalanceRequester).eq(new BN(oldBalanceRequester).add(new BN(400))), // Gets 1/5 of total reward
        "The requester was not reimbursed correctly"
      );

      const oldBalanceChallenger = await web3.eth.getBalance(challenger);
      await gtcr.withdrawFeesAndRewards(challenger, itemID, 0, 0, {
        from: governor,
      });
      const newBalanceChallenger = await web3.eth.getBalance(challenger);
      assert(
        new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger).add(new BN(600))), /// Gets 3/10 of total reward
        "The challenger was not reimbursed correctly"
      );

      const oldBalanceCrowdfunder = await web3.eth.getBalance(other);
      await gtcr.withdrawFeesAndRewards(other, itemID, 0, 0, { from: governor });
      const newBalanceCrowdfunder = await web3.eth.getBalance(other);

      assert(
        new BN(newBalanceCrowdfunder).eq(new BN(oldBalanceCrowdfunder).add(new BN(1000))), // Gets half of the total reward
        "The crowdfunder was not reimbursed correctly after withdrawing from the first round"
      );
    });
  });

  it("Check various cases of status requirements and the removing request", async () => {
    // 1st request.
    const tx = await gtcr.addItem("0xaabbaa", {
      from: requester,
      value: submitterTotalCost,
    });

    const itemID = tx.logs[0].args._itemID;
    await time.increase(challengePeriodDuration + 1);
    await gtcr.executeRequest(itemID, { from: governor });

    // 2th request.
    await gtcr.removeItem(itemID, "", {
      from: requester,
      value: removalTotalCost,
    });

    await gtcr.challengeRequest(itemID, "evidence", {
      from: challenger,
      value: removalChallengeTotalCost,
    });

    await arbitrator.giveRuling(1, PARTY.CHALLENGER);
    await gtcr.fundAppeal(itemID, 2, { from: challenger, value: 1 }); // Just check that appeal works, the value is irrelevant.
    await time.increase(appealTimeOut + 1);
    await arbitrator.giveRuling(1, PARTY.CHALLENGER);

    let item = await gtcr.getItemInfo(itemID);
    assert.equal(item[0].toNumber(), 1, "Item should have status Registered");

    // 3th request.
    await gtcr.removeItem(itemID, "", {
      from: requester,
      value: removalTotalCost,
    });
    await time.increase(challengePeriodDuration + 1);

    await gtcr.executeRequest(itemID, { from: governor });
    item = await gtcr.getItemInfo(itemID);
    assert.equal(item[0].toNumber(), 0, "Item should have status Absent");
    assert.equal(item[1].toNumber(), 3, "The total number of requests is incorrect");

    await gtcr.addItem("0x1221", { from: requester, value: submitterTotalCost });
  });

  it("Only the governor should be allowed to change state variables", async () => {
    await expectRevert(gtcr.changeChallengePeriodDuration(11, { from: other }), "The caller must be the governor.");
    await gtcr.changeChallengePeriodDuration(11, { from: governor });
    assert.equal((await gtcr.challengePeriodDuration()).toNumber(), 11, "Incorrect challengePeriodDuration value");

    await expectRevert(gtcr.changeSubmissionBaseDeposit(22, { from: other }), "The caller must be the governor.");
    await gtcr.changeSubmissionBaseDeposit(22, { from: governor });
    assert.equal((await gtcr.submissionBaseDeposit()).toNumber(), 22, "Incorrect submissionBaseDeposit value");

    await expectRevert(gtcr.changeRemovalBaseDeposit(23, { from: other }), "The caller must be the governor.");
    await gtcr.changeRemovalBaseDeposit(23, { from: governor });
    assert.equal((await gtcr.removalBaseDeposit()).toNumber(), 23, "Incorrect removalBaseDeposit value");

    await expectRevert(
      gtcr.changeSubmissionChallengeBaseDeposit(44, { from: other }),
      "The caller must be the governor."
    );
    await gtcr.changeSubmissionChallengeBaseDeposit(44, { from: governor });
    assert.equal(
      (await gtcr.submissionChallengeBaseDeposit()).toNumber(),
      44,
      "Incorrect submissionChallengeBaseDeposit value"
    );

    await expectRevert(gtcr.changeRemovalChallengeBaseDeposit(55, { from: other }), "The caller must be the governor.");
    await gtcr.changeRemovalChallengeBaseDeposit(55, { from: governor });
    assert.equal(
      (await gtcr.removalChallengeBaseDeposit()).toNumber(),
      55,
      "Incorrect removalChallengeBaseDeposit value"
    );

    await expectRevert(gtcr.changeGovernor(governor2, { from: governor2 }), "The caller must be the governor.");
    await gtcr.changeGovernor(governor2, { from: governor });
    assert.equal(await gtcr.governor(), governor2, "Incorrect governor address");

    await expectRevert(gtcr.changeSharedStakeMultiplier(44, { from: governor }), "The caller must be the governor.");
    await gtcr.changeSharedStakeMultiplier(44, { from: governor2 });
    assert.equal((await gtcr.sharedStakeMultiplier()).toNumber(), 44, "Incorrect sharedStakeMultiplier value");

    await expectRevert(gtcr.changeWinnerStakeMultiplier(55, { from: other }), "The caller must be the governor.");
    await gtcr.changeWinnerStakeMultiplier(55, { from: governor2 });
    assert.equal((await gtcr.winnerStakeMultiplier()).toNumber(), 55, "Incorrect winnerStakeMultiplier value");

    await expectRevert(gtcr.changeLoserStakeMultiplier(66, { from: other }), "The caller must be the governor.");
    await gtcr.changeLoserStakeMultiplier(66, { from: governor2 });
    assert.equal((await gtcr.loserStakeMultiplier()).toNumber(), 66, "Incorrect loserStakeMultiplier value");

    await expectRevert(
      gtcr.changeArbitrationParams(other, "0xff", "/ipfs/Qmfoo", "/ipfs/Qmbar", { from: other }),
      "The caller must be the governor."
    );
    await gtcr.changeArbitrationParams(other, "0xff", "/ipfs/Qmfoo", "/ipfs/Qmbar", { from: governor2 });
    assert.equal(await gtcr.arbitrator(), other, "Incorrect arbitrator address");
    assert.equal(await gtcr.arbitratorExtraData(), "0xff", "Incorrect extraData value");

    await expectRevert(gtcr.changeConnectedTCR(other, { from: other }), "The caller must be the governor.");

    // Ensure `changeConnectedTCR` emits an event with the new address.
    const txChangeConnected = await gtcr.changeConnectedTCR(governor2, {
      from: governor2,
    });
    assert.equal(
      txChangeConnected.logs[0].args._connectedTCR,
      governor2,
      "The event has the wrong connectedTCR address"
    );

    await expectRevert(gtcr.changeRelayerContract(other, { from: other }), "The caller must be the governor.");
    await gtcr.changeRelayerContract(other, { from: governor2 });
    assert.equal(await gtcr.relayerContract(), other, "Incorrect relayerContract address");
  });

  describe("When using the relayer to modify the registry", () => {
    it("Should correctly add an item directly", async () => {
      await expectRevert(gtcr.addItemDirectly("/ipfs/Qwabdaa", { from: other }), "The caller must be the relay.");

      await relay.add(gtcr.address, "/ipfs/Qwabdaa");
      const itemID = soliditySha3("/ipfs/Qwabdaa");
      assert.equal(itemID, soliditySha3("/ipfs/Qwabdaa"), "Item ID has not been set up properly");

      const item = await gtcr.getItemInfo(itemID);
      assert.equal(item[0].toNumber(), 1, "Item status should be Registered");

      await expectRevert(relay.add(gtcr.address, "/ipfs/Qwabdaa"), "Item must be absent to be added.");
    });

    it("Should correctly remove an item directly", async () => {
      await relay.add(gtcr.address, "/ipfs/Qwadddggbdaa");
      const itemID = soliditySha3("/ipfs/Qwadddggbdaa");

      await expectRevert(gtcr.removeItemDirectly(itemID, { from: other }), "The caller must be the relay.");

      await relay.remove(gtcr.address, itemID);

      const item = await gtcr.getItemInfo(itemID);
      assert.equal(item[0].toNumber(), 0, "Item status should be Absent");
      assert.equal(item[1].toNumber(), 0, "Item has incorrect number of requests"); // Direct adds don't generate requests.

      await expectRevert(relay.remove(gtcr.address, itemID), "Item must be registered to be removed.");
    });
  });

  describe("When updating arbitration params", () => {
    let newParams;
    let updateTx;

    const expectedRegistrationMetaEvidenceID = 2;
    const expectedClearingMetaEvidenceID = 3;

    beforeEach("Update arbitration params", async () => {
      newParams = {
        arbitrator: newArbitrator.address,
        arbitratorExtraData: "0x20",
        registrationMetaEvidence: "/ipfs/Qmfoo",
        clearingMetaEvidence: "/ipfs/Qmbar",
      };

      updateTx = await gtcr.changeArbitrationParams(
        newParams.arbitrator,
        newParams.arbitratorExtraData,
        newParams.registrationMetaEvidence,
        newParams.clearingMetaEvidence,
        { from: governor }
      );

      await time.increase(600);
    });

    it("Should emit the correct MetaEvidence events", async () => {
      await expectEvent(updateTx, "MetaEvidence", {
        _metaEvidenceID: String(expectedRegistrationMetaEvidenceID),
        _evidence: newParams.registrationMetaEvidence,
      });
      await expectEvent(updateTx, "MetaEvidence", {
        _metaEvidenceID: String(expectedClearingMetaEvidenceID),
        _evidence: newParams.clearingMetaEvidence,
      });
    });

    describe("When registering an item", () => {
      let addTx;
      let itemID;
      let evidenceGroupID;

      beforeEach("Add item request", async () => {
        addTx = await gtcr.addItem("0xaabbaa", {
          from: requester,
          value: submitterTotalCost,
        });

        itemID = addTx.logs[0].args._itemID;
        evidenceGroupID = new BN(soliditySha3(itemID, 0).slice(2), 16);

        expectEvent(addTx, "RequestSubmitted", {
          _itemID: itemID,
          _evidenceGroupID: evidenceGroupID,
        });
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
        const txChallenge = await gtcr.challengeRequest(itemID, "Evidence.json", {
          from: challenger,
          value: submissionChallengeTotalCost,
        });

        await expectEvent(txChallenge, "Dispute", {
          _arbitrator: newParams.arbitrator,
          _disputeID: "0",
          _metaEvidenceID: String(expectedRegistrationMetaEvidenceID),
          _evidenceGroupID: evidenceGroupID,
        });
      });
    });

    describe("When removing an item", () => {
      let removeTx;
      let itemID;
      let evidenceGroupID;

      beforeEach("Add item and request the removal", async () => {
        const addTx = await gtcr.addItem("0xaabbaa", {
          from: requester,
          value: submitterTotalCost,
        });

        itemID = addTx.logs[0].args._itemID;

        await time.increase(challengePeriodDuration + 1);
        await gtcr.executeRequest(itemID, { from: governor });

        removeTx = await gtcr.removeItem(itemID, "", {
          from: requester,
          value: removalTotalCost,
        });
        evidenceGroupID = new BN(soliditySha3(itemID, 1).slice(2), 16);

        expectEvent(removeTx, "RequestSubmitted", {
          _itemID: itemID,
          _evidenceGroupID: evidenceGroupID,
        });
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
        const txChallenge = await gtcr.challengeRequest(itemID, "Evidence.json", {
          from: challenger,
          value: submissionChallengeTotalCost,
        });

        await expectEvent(txChallenge, "Dispute", {
          _arbitrator: newParams.arbitrator,
          _disputeID: "0",
          _metaEvidenceID: String(expectedClearingMetaEvidenceID),
          _evidenceGroupID: evidenceGroupID,
        });
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
        await gtcr.changeArbitrationParams(
          changes[i].arbitrator,
          changes[i].arbitratorExtraData,
          changes[i].registrationMetaEvidence,
          changes[i].clearingMetaEvidence,
          { from: governor }
        );
        await time.increase(5);
      }

      const addTx = await gtcr.addItem("0xaabbaa", {
        from: requester,
        value: submitterTotalCost,
      });

      const itemID = addTx.logs[0].args._itemID;

      for (let i = changesBefore + 1; i < changes.lenght; i++) {
        await gtcr.changeArbitrationParams(
          changes[i].arbitrator,
          changes[i].arbitratorExtraData,
          changes[i].registrationMetaEvidence,
          changes[i].clearingMetaEvidence,
          { from: governor }
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

      addTx = await gtcr.addItem("0xaabbaa", {
        from: requester,
        value: submitterTotalCost,
      });

      itemID = addTx.logs[0].args._itemID;

      await gtcr.changeArbitrationParams(
        newParams.arbitrator,
        newParams.arbitratorExtraData,
        newParams.registrationMetaEvidence,
        newParams.clearingMetaEvidence,
        { from: governor }
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
      await gtcr.challengeRequest(itemID, "aaa", {
        from: challenger,
        value: submissionChallengeTotalCost,
      });

      await arbitrator.giveRuling(1, PARTY.CHALLENGER);

      await gtcr.fundAppeal(itemID, PARTY.REQUESTER, { from: requester, value: loserAppealFee });
      const appealTx = await gtcr.fundAppeal(itemID, PARTY.CHALLENGER, { from: requester, value: winnerAppealFee });

      // Appeal should be made in the original arbitrator contract
      await expectEvent.inTransaction(appealTx.receipt.transactionHash, arbitrator, "AppealDecision", {
        _disputeID: "1",
        _arbitrable: gtcr.address,
      });
    });

    it("Should use the updated arbitration params for the subsequent requests for the same item", async () => {
      await time.increase(challengePeriodDuration);
      await gtcr.executeRequest(itemID, { from: governor });

      await gtcr.removeItem(itemID, "/ipfs/Qmfoo", {
        from: requester,
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
