const { web3, deployments, ethers } = require("hardhat");
const { expectRevert, time } = require("@openzeppelin/test-helpers");
const { soliditySha3 } = require("web3-utils");
const { BN } = require("bn.js");

describe("GTCR", async () => {
  const PARTY = {
    NONE: 0,
    REQUESTER: 1,
    CHALLENGER: 2,
  };
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
  const arbitratorExtraData = "0x85";
  const arbitrationCost = 1000;
  let governor;
  let requester;
  let challenger;
  let other;
  let governor2;
  let gtcr;
  let arbitrator;
  let gtcrFactory;
  let MULTIPLIER_DIVISOR, submitterTotalCost, removalTotalCost, submissionChallengeTotalCost, removalChallengeTotalCost;
  before("setup accounts", async () => {
    [governor, requester, challenger, governor2, other] = await ethers.getSigners();
  });
  beforeEach("contract setup", async function () {
    await deployments.fixture(["gtcrContracts"], {
      fallbackToGlobal: true,
      keepExistingDeployments: false,
    });
    arbitrator = await ethers.getContract("EnhancedAppealableArbitrator");
    await arbitrator.connect(governor).changeArbitrator(arbitrator.address);
    await arbitrator.connect(other).createDispute(3, arbitratorExtraData, {
      value: arbitrationCost,
    });
    gtcrFactory = await ethers.getContract("GTCRFactory");
    await gtcrFactory
      .connect(governor)
      .deploy(
        arbitrator.address,
        arbitratorExtraData,
        other.address,
        registrationMetaEvidence,
        clearingMetaEvidence,
        governor.address,
        submissionBaseDeposit,
        removalBaseDeposit,
        submissionChallengeBaseDeposit,
        removalChallengeBaseDeposit,
        challengePeriodDuration,
        [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier]
      );
    let gtcrAddress = await gtcrFactory.instances(0);
    gtcr = await ethers.getContractAt("GeneralizedTCR", gtcrAddress);
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
  });

  it("Should set the correct values and fire the event when requesting registration", async () => {
    await expectRevert(
      gtcr.connect(requester).addItem("0xffb43c480000000000000000000000000000000000000000000000000000000000002222", {
        value: submitterTotalCost - 1,
      }),
      "You must fully fund your side."
    );
    const txAddItem = await gtcr
      .connect(requester)
      .addItem("0xffb43c480000000000000000000000000000000000000000000000000000000000002222", {
        value: submitterTotalCost,
      });
    let txAddItemreceipt = await txAddItem.wait();
    await expectRevert(
      gtcr.connect(requester).addItem("0xffb43c480000000000000000000000000000000000000000000000000000000000002222", {
        value: submitterTotalCost,
      }),
      "Item must be absent to be added."
    );

    const itemID = await gtcr.itemList(0);
    assert.equal(
      itemID,
      soliditySha3("0xffb43c480000000000000000000000000000000000000000000000000000000000002222"),
      "Item ID has not been set up properly"
    );

    const item = await gtcr.items(itemID);
    assert.equal(
      item[0],
      "0xffb43c480000000000000000000000000000000000000000000000000000000000002222",
      "Item data has not been set up properly"
    );
    assert.equal(item[1], 2, "Item status has not been set up properly");
    const request = await gtcr.getRequestInfo(itemID, 0);
    assert.equal(request[4][1], requester.address, "Requester has not been set up properly");
    assert.equal(request[7], arbitrator.address, "Request arbitrator has not been set up properly");
    assert.equal(request[8], arbitratorExtraData, "Request extra data has not been set up properly");

    const round = await gtcr.getRoundInfo(itemID, 0, 0);
    assert.equal(round[1][1], submitterTotalCost, "Requester paidFees has not been registered correctly");
    assert.equal(round[2][1], true, "Should register that requester paid his fees");
    assert.equal(round[3], submitterTotalCost, "FeeRewards has not been registered correctly");
    const contribution = await gtcr.getContributions(itemID, 0, 0, requester.address);

    assert.equal(contribution[1], submitterTotalCost, "Requester contribution has not been registered correctly");

    assert.equal(txAddItemreceipt.events[1].event, "ItemStatusChange", "The event has not been created");
    assert.equal(txAddItemreceipt.events[1].args._itemID, itemID, "The event has wrong item ID");

    assert.equal(txAddItemreceipt.events[1].args._requestIndex, 0, "The event has wrong request index");
    assert.equal(txAddItemreceipt.events[1].args._roundIndex, 0, "The event has wrong round index");
  });

  it("Should set the correct values and create a dispute after the item is challenged and fire 2 events", async () => {
    await gtcr
      .connect(requester)
      .addItem("0xffb43c480000000000000000000000000000000000000000000000000000000000002222", {
        value: submitterTotalCost,
      });
    const itemID = await gtcr.itemList(0);

    await expectRevert(
      gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
        value: submissionChallengeTotalCost - 1,
      }),
      "You must fully fund your side."
    );

    const txChallenge = await gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
      value: submissionChallengeTotalCost,
    });
    const txChallengeReceipt = await txChallenge.wait();
    const request = await gtcr.getRequestInfo(itemID, 0);
    assert.equal(request[4][2], challenger.address, "Challenger has not been set up properly");
    assert.equal(request[0], true, "The request should have status disputed");
    assert.equal(request[1].toNumber(), 1, "Dispute ID has not been set up properly");
    assert.equal(request[5].toNumber(), 2, "Number of rounds should have been incremented");

    const arbitratorDisputeIDToItem = await gtcr.arbitratorDisputeIDToItem(arbitrator.address, 1);
    assert.equal(arbitratorDisputeIDToItem, itemID, "Incorrect arbitratorDisputeIDToItem value");

    const round = await gtcr.getRoundInfo(itemID, 0, 0);
    assert.equal(
      round[1][2].toNumber(),
      submissionChallengeTotalCost,
      "Challenger paidFees has not been registered correctly"
    );
    assert.equal(round[2][2], true, "Should register that challenger paid his fees");
    assert.equal(
      round[3].toNumber(),
      submitterTotalCost + submissionChallengeTotalCost - arbitrationCost,
      "FeeRewards has not been registered correctly"
    );

    const dispute = await arbitrator.disputes(1);
    assert.equal(dispute[0], gtcr.address, "Arbitrable not set up properly");
    assert.equal(dispute[1].toNumber(), 2, "Number of choices not set up properly");

    const evidenceGroupID = parseInt(soliditySha3(itemID, 0), 16);
    assert.equal(txChallengeReceipt.events[1].event, "Dispute", "The event Dispute has not been created");
    assert.equal(txChallengeReceipt.events[1].args._arbitrator, arbitrator.address, "The event has wrong arbitrator");
    assert.equal(txChallengeReceipt.events[1].args._disputeID.toNumber(), 1, "The event has wrong dispute ID");
    assert.equal(
      txChallengeReceipt.events[1].args._metaEvidenceID.toNumber(),
      0,
      "The event has wrong metaevidence ID"
    );
    assert.equal(
      txChallengeReceipt.events[1].args._evidenceGroupID,
      evidenceGroupID,
      "The event has wrong evidenceGroup ID"
    );

    assert.equal(txChallengeReceipt.events[2].event, "Evidence", "The event Evidence has not been created");
    assert.equal(txChallengeReceipt.events[2].args._arbitrator, arbitrator.address, "The event has wrong arbitrator");
    assert.equal(
      txChallengeReceipt.events[2].args._evidenceGroupID,
      evidenceGroupID,
      "The event has wrong evidenceGroup ID"
    );
    assert.equal(txChallengeReceipt.events[2].args._party, challenger.address, "The event has wrong party");
    assert.equal(txChallengeReceipt.events[2].args._evidence, "Evidence.json", "The event has wrong evidence");

    await expectRevert(
      gtcr.connect(other).challengeRequest(itemID, "Evidence2.json", {
        value: submissionChallengeTotalCost,
      }),
      "The request should not have already been disputed."
    );

    await time.increase(challengePeriodDuration + 1);
    await expectRevert(gtcr.connect(governor).executeRequest(itemID), "The request should not be disputed.");
  });

  it("Should not be possibe to challenge after timeout", async () => {
    await gtcr.connect(requester).addItem("0xaabbaa", {
      value: submitterTotalCost,
    });
    const itemID = await gtcr.itemList(0);

    await time.increase(challengePeriodDuration + 1);

    await expectRevert(
      gtcr.connect(challenger).challengeRequest(itemID, "Evidence.json", {
        value: submissionChallengeTotalCost,
      }),
      "Challenges must occur during the challenge period."
    );
  });

  it("Should successfully execute the request if it has not been challenged and fire the event", async () => {
    await gtcr
      .connect(requester)
      .addItem("0xffb43c480000000000000000000000000000000000000000000000000000000000002222", {
        value: submitterTotalCost,
      });
    const itemID = await gtcr.itemList(0);
    const oldBalance = await web3.eth.getBalance(requester.address);

    await expectRevert(gtcr.connect(governor).executeRequest(itemID), "Time to challenge the request must pass.");

    await time.increase(challengePeriodDuration + 1);
    const txExecute = await gtcr.connect(governor).executeRequest(itemID);
    const txExecuteReceipt = await txExecute.wait();
    const newBalance = await web3.eth.getBalance(requester.address);

    const item = await gtcr.items(itemID);
    assert.equal(item[1], 1, "Item should have status Registered");

    const request = await gtcr.getRequestInfo(itemID, 0);
    assert.equal(request[3], true, "Request should be resolved");

    assert.equal(txExecuteReceipt.events[0].event, "ItemStatusChange", "The event has not been created");
    assert.equal(txExecuteReceipt.events[0].args._itemID, itemID, "The event has wrong item ID");
    assert.equal(txExecuteReceipt.events[0].args._requestIndex.toNumber(), 0, "The event has wrong request index");
    assert.equal(txExecuteReceipt.events[0].args._roundIndex.toNumber(), 0, "The event has wrong round index");

    assert(
      new BN(newBalance).eq(new BN(oldBalance).add(new BN(submitterTotalCost))),
      "The requester was not reimbursed correctly"
    );

    const contribution = await gtcr.getContributions(itemID, 0, 0, requester.address);
    assert.equal(contribution[1].toNumber(), 0, "Contribution of the requester should be 0");
  });

  it("Should demand correct appeal fees and register that appeal fee has been paid", async () => {
    let roundInfo;
    await gtcr.connect(requester).addItem("0x1111", { value: submitterTotalCost });
    const itemID = await gtcr.itemList(0);
    await expectRevert(
      gtcr.connect(challenger).fundAppeal(itemID, 2, { value: "2000000000000000000" }),
      "A dispute must have been raised to fund an appeal."
    );

    await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
      value: submissionChallengeTotalCost,
    });

    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

    // Appeal fee is the same as arbitration fee for this arbitrator.
    const loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;

    await expectRevert.unspecified(
      gtcr.connect(challenger).fundAppeal(itemID, 0, { value: loserAppealFee }) // Check that not possible to fund 0 side.
    );

    // Deliberately overpay to check that only required fee amount will be registered.
    await gtcr.connect(requester).fundAppeal(itemID, 1, { value: "3000000000000000000" });

    // Fund appeal again to see if it doesn't cause anything.
    await gtcr.connect(requester).fundAppeal(itemID, 1, { value: "1000000000000000000" });

    roundInfo = await gtcr.getRoundInfo(itemID, 0, 1);

    assert.equal(roundInfo[1][1].toNumber(), loserAppealFee, "Registered fee of the requester is incorrect");
    assert.equal(roundInfo[2][1], true, "Did not register that the requester successfully paid his fees");

    assert.equal(roundInfo[1][2].toNumber(), 0, "Should not register any payments for challenger");
    assert.equal(roundInfo[2][2], false, "Should not register that challenger successfully paid fees");
    assert.equal(roundInfo[3].toNumber(), loserAppealFee, "Incorrect FeeRewards value");

    const winnerAppealFee = arbitrationCost + (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR;

    // Increase time to make sure winner can pay in 2nd half.
    await time.increase(appealTimeOut / 2 + 1);

    await gtcr.connect(challenger).fundAppeal(itemID, 2, {
      value: winnerAppealFee - 1,
    }); // Underpay to see if it's registered correctly

    roundInfo = await gtcr.getRoundInfo(itemID, 0, 1);

    assert.equal(
      roundInfo[1][2].toNumber(),
      winnerAppealFee - 1,
      "Registered partial fee of the challenger is incorrect"
    );
    assert.equal(
      roundInfo[2][2],
      false,
      "Should not register that the challenger successfully paid his fees after partial payment"
    );

    assert.equal(
      roundInfo[3].toNumber(),
      loserAppealFee + winnerAppealFee - 1,
      "Incorrect FeeRewards value after partial payment"
    );

    await gtcr.connect(challenger).fundAppeal(itemID, 2, { value: "5000000000000000000" });

    roundInfo = await gtcr.getRoundInfo(itemID, 0, 1);

    assert.equal(roundInfo[1][2].toNumber(), winnerAppealFee, "Registered fee of challenger is incorrect");
    assert.equal(roundInfo[2][2], true, "Did not register that challenger successfully paid his fees");

    assert.equal(
      roundInfo[3].toNumber(),
      winnerAppealFee + loserAppealFee - arbitrationCost,
      "Incorrect fee rewards value"
    );

    // If both sides pay their fees it starts new appeal round. Check that both sides have their value set to default.
    roundInfo = await gtcr.getRoundInfo(itemID, 0, 2);
    assert.equal(roundInfo[2][1], false, "Appeal fee payment for requester should not be registered in the new round");
    assert.equal(roundInfo[2][2], false, "Appeal fee payment for challenger should not be registered in the new round");
  });

  it("Should not be possible for loser to fund appeal if first half of appeal period has passed", async () => {
    await gtcr.connect(requester).addItem("0x1111", { value: submitterTotalCost });
    const itemID = await gtcr.itemList(0);

    await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
      value: submissionChallengeTotalCost,
    });

    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

    const loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;
    time.increase(appealTimeOut / 2 + 1);
    await expectRevert(
      gtcr.connect(requester).fundAppeal(itemID, 1, { value: loserAppealFee }),
      "The loser must contribute during the first half of the appeal period."
    );
  });

  it("Should not be possible for winner to fund appeal if appeal period has passed", async () => {
    await gtcr.connect(requester).addItem("0x1111", { value: submitterTotalCost });
    const itemID = await gtcr.itemList(0);

    await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
      value: submissionChallengeTotalCost,
    });

    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

    const winnerAppealFee = arbitrationCost + (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR;
    time.increase(appealTimeOut + 1);
    await expectRevert(
      gtcr.connect(challenger).fundAppeal(itemID, 2, { value: winnerAppealFee }),
      "Contributions must be made within the appeal period."
    );
  });

  it("Should pay all parties correctly and set correct values when arbitrator refused to rule", async () => {
    const initialGTCRBalance = await web3.eth.getBalance(gtcr.address);
    const oldBalanceRequester = await web3.eth.getBalance(requester.address);
    const oldBalanceChallenger = await web3.eth.getBalance(challenger.address);

    await gtcr.connect(requester).addItem("0x1111", { value: submitterTotalCost });
    const itemID = await gtcr.itemList(0);
    const addTxCost = new BN(oldBalanceRequester)
      .sub(new BN(await web3.eth.getBalance(requester.address)))
      .sub(new BN(submitterTotalCost));

    assert.equal(
      (await web3.eth.getBalance(gtcr.address)).toString(),
      (arbitrationCost + submissionBaseDeposit).toString(),
      "Incorrect contract balance."
    );

    await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
      value: submissionChallengeTotalCost,
    });

    const challengeTxCost = new BN(oldBalanceChallenger)
      .sub(new BN(await web3.eth.getBalance(challenger.address)))
      .sub(new BN(submissionChallengeTotalCost));

    assert.equal(
      (await web3.eth.getBalance(gtcr.address)).toString(),
      (arbitrationCost + submissionBaseDeposit + submissionChallengeBaseDeposit).toString(),
      "Incorrect contract balance."
    );

    await arbitrator.connect(governor).giveRuling(1, PARTY.NONE);
    await time.increase(appealTimeOut + 1);
    await arbitrator.connect(governor).giveRuling(1, PARTY.NONE);

    const item = await gtcr.items(itemID);
    assert.equal(item[1], 0, "Item should have status Absent");

    const request = await gtcr.getRequestInfo(itemID, 0);
    assert.equal(request[3], true, "The request should be resolved");
    assert.equal(request[6], PARTY.NONE, "Request has incorrect ruling");

    const newBalanceRequester = await web3.eth.getBalance(requester.address);
    const newBalanceChallenger = await web3.eth.getBalance(challenger.address);

    const submitterExpectedPay = new BN(submitterTotalCost)
      .mul(new BN(MULTIPLIER_DIVISOR))
      .div(new BN(submissionChallengeTotalCost).add(new BN(submitterTotalCost)))
      .mul(new BN(arbitrationCost))
      .div(new BN(MULTIPLIER_DIVISOR));

    const challengerExpectedPay = new BN(submissionChallengeTotalCost)
      .mul(new BN(MULTIPLIER_DIVISOR))
      .div(new BN(submissionChallengeTotalCost).add(new BN(submitterTotalCost)))
      .mul(new BN(arbitrationCost))
      .div(new BN(MULTIPLIER_DIVISOR));

    assert.equal(
      new BN(oldBalanceRequester)
        .sub(new BN(newBalanceRequester))
        .sub(addTxCost)
        .sub(new BN("1")) // Account for rounding error
        .toString(),
      submitterExpectedPay.toString(),
      "Requester did not pay the expected share of arbitration fees."
    );
    assert.equal(
      new BN(oldBalanceChallenger)
        .sub(new BN(newBalanceChallenger))
        .sub(challengeTxCost)
        .sub(new BN("1")) // Account for rounding error
        .toString(),
      challengerExpectedPay.toString(),
      "Challengers did not pay the expected share of arbitration fees."
    );

    const gtcrBalanceAfter = await web3.eth.getBalance(gtcr.address);
    assert.equal(
      (gtcrBalanceAfter - 1).toString(), // Subtract 1 wei to account for rounding error.
      initialGTCRBalance,
      "Contract should not have remaining ETH from this request."
    );
  });

  it("Should paid to all parties correctly and set correct values when requester wins", async () => {
    const initialRequesterBalance = await web3.eth.getBalance(requester.address);
    await gtcr.connect(requester).addItem("0x1111", { value: submitterTotalCost });
    const itemID = await gtcr.itemList(0);
    const addTxCost = new BN(initialRequesterBalance)
      .sub(new BN(await web3.eth.getBalance(requester.address)))
      .sub(new BN(submitterTotalCost));

    await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
      value: submissionChallengeTotalCost,
    });

    const oldBalanceChallenger = await web3.eth.getBalance(challenger.address);

    await arbitrator.connect(governor).giveRuling(1, PARTY.REQUESTER);
    await time.increase(appealTimeOut + 1);
    await arbitrator.connect(governor).giveRuling(1, PARTY.REQUESTER);

    const item = await gtcr.items(itemID);
    assert.equal(item[1], 1, "Item should have status Registered");

    const request = await gtcr.getRequestInfo(itemID, 0);
    assert.equal(request[3], true, "The request should be resolved");
    assert.equal(request[6], 1, "Request has incorrect ruling");

    const newBalanceRequester = await web3.eth.getBalance(requester.address);
    const newBalanceChallenger = await web3.eth.getBalance(challenger.address);

    // Requester should be paid the whole feeRewards pot.
    assert.equal(
      newBalanceRequester,
      new BN(initialRequesterBalance).sub(new BN(addTxCost)).add(new BN(submissionChallengeBaseDeposit)).toString(),
      "The requester was not reimbursed and awarded correctly"
    );

    assert(
      new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger)),
      "The balance of the challenger should stay the same"
    );
  });

  it("Should paid to all parties correctly and set correct values when challenger wins", async () => {
    await gtcr.connect(requester).addItem("0x1111224411", {
      value: submitterTotalCost,
    });
    const itemID = await gtcr.itemList(0);

    const initialChallengerBalance = await web3.eth.getBalance(challenger.address);
    await gtcr.connect(challenger).challengeRequest(itemID, "testEvidence11", {
      value: submissionChallengeTotalCost,
    });
    const challengeTxCost = new BN(initialChallengerBalance)
      .sub(new BN(await web3.eth.getBalance(challenger.address)))
      .sub(new BN(submissionChallengeTotalCost));

    const oldBalanceRequester = await web3.eth.getBalance(requester.address);

    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);
    await time.increase(appealTimeOut + 1);
    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

    const item = await gtcr.items(itemID);
    assert.equal(item[1], 0, "Item should have status Absent");

    const request = await gtcr.getRequestInfo(itemID, 0);
    assert.equal(request[3], true, "The request should be resolved");
    assert.equal(request[6], 2, "Request has incorrect ruling");

    const newBalanceRequester = await web3.eth.getBalance(requester.address);
    const newBalanceChallenger = await web3.eth.getBalance(challenger.address);

    assert(
      new BN(newBalanceRequester).eq(new BN(oldBalanceRequester)),
      "The balance of the requester should stay the same"
    );

    // Challenger should be paid the whole feeRewards pot (9000)
    assert.equal(
      newBalanceChallenger.toString(),
      new BN(initialChallengerBalance).sub(new BN(challengeTxCost)).add(new BN(submissionBaseDeposit)).toString(),
      "The challenger was not reimbursed and awarded correctly"
    );
  });

  it("Should change the ruling if the loser paid appeal fee while winner did not", async () => {
    const initialRequesterBalance = await web3.eth.getBalance(requester.address);
    await gtcr.connect(requester).addItem("0x1111224411ffaa2eaf1111224411ffaa2eaf1111224411ffaa2eaf", {
      value: submitterTotalCost,
    });
    const itemID = await gtcr.itemList(0);
    const addTxCost = new BN(initialRequesterBalance)
      .sub(new BN(await web3.eth.getBalance(requester.address)))
      .sub(new BN(submitterTotalCost));

    await gtcr.connect(challenger).challengeRequest(itemID, "E", {
      value: submissionChallengeTotalCost,
    });

    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

    const loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;

    const requesterBalBeforeAppeal = await web3.eth.getBalance(requester.address);
    // Invert the ruling so the requester should win

    await gtcr.connect(requester).fundAppeal(itemID, 1, {
      value: loserAppealFee,
    });

    const fundAppealTxCost = new BN(requesterBalBeforeAppeal)
      .sub(new BN(await web3.eth.getBalance(requester.address)))
      .sub(new BN(loserAppealFee));

    const oldBalanceChallenger = await web3.eth.getBalance(challenger.address);

    await time.increase(appealTimeOut + 1);
    await arbitrator.connect(governor).giveRuling(1, PARTY.CHALLENGER);

    const item = await gtcr.items(itemID);
    assert.equal(item[1], 1, "Item should have status Registered");

    const request = await gtcr.getRequestInfo(itemID, 0);
    assert.equal(request[3], true, "The request should be resolved");
    assert.equal(request[6], 1, "Request has incorrect ruling");

    const newBalanceRequester = await web3.eth.getBalance(requester.address);
    const newBalanceChallenger = await web3.eth.getBalance(challenger.address);

    assert.equal(
      newBalanceRequester,
      new BN(initialRequesterBalance)
        .sub(new BN(addTxCost))
        .sub(new BN(fundAppealTxCost))
        .add(new BN(submissionChallengeBaseDeposit))
        .sub(new BN(loserAppealFee)) // The appeal fees paid in the last round must be withdrawn in another tx.
        .toString(),
      "The requester was not reimbursed and awarded correctly"
    );

    assert(
      new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger)),
      "The balance of the challenger should stay the same"
    );
  });

  it("Should withdraw correct fees if dispute had winner/loser", async () => {
    await gtcr.connect(requester).addItem("0x1111", { value: submitterTotalCost });
    const itemID = await gtcr.itemList(0);

    await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
      value: submissionChallengeTotalCost,
    });

    await arbitrator.connect(governor).giveRuling(1, PARTY.REQUESTER);

    // 1st appeal round.
    const loserAppealFee = arbitrationCost + (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR;

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
    await expectRevert.unspecified(gtcr.connect(governor).withdrawFeesAndRewards(requester.address, itemID, 0, 1));

    await gtcr.connect(requester).fundAppeal(itemID, 1, {
      value: winnerAppealFee,
    }); // WinnerAppealFee should not be enough because requester is now loser.

    await time.increase(appealTimeOut + 1);
    await arbitrator.connect(governor).giveRuling(2, PARTY.CHALLENGER);

    const oldBalanceRequester = await web3.eth.getBalance(requester.address);
    await gtcr.connect(governor).withdrawFeesAndRewards(requester.address, itemID, 0, 1);
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
    await gtcr.connect(requester).addItem("0x1111", { value: submitterTotalCost });
    const itemID = await gtcr.itemList(0);

    await gtcr.connect(challenger).challengeRequest(itemID, "aaa", {
      value: submissionChallengeTotalCost,
    });

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
    await gtcr.connect(other).fundAppeal(itemID, 2, { value: sharedAppealFee });

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

  it("Check various cases of status requirements and the removing request", async () => {
    // 1st request.
    await gtcr.connect(requester).addItem("0xaabbaa", {
      value: submitterTotalCost,
    });
    const itemID = await gtcr.itemList(0);
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
    assert.equal(item[1], 1, "Item should have status Registered");

    // 3th request.
    await gtcr.connect(requester).removeItem(itemID, "", {
      value: removalTotalCost,
    });
    await time.increase(challengePeriodDuration + 1);

    await gtcr.connect(governor).executeRequest(itemID);
    item = await gtcr.getItemInfo(itemID);
    assert.equal(item[1], 0, "Item should have status Absent");
    assert.equal(item[2], 3, "The total number of requests is incorrect");

    await gtcr.connect(requester).addItem("0x1221", { value: submitterTotalCost });
    const count = await gtcr.itemCount();
    assert.equal(count.toNumber(), 2, "The total number of items is incorrect");
  });

  it("Only the governor should be allowed to change state variables", async () => {
    await expectRevert(gtcr.connect(other).changeTimeToChallenge(11), "The caller must be the governor.");
    await gtcr.connect(governor).changeTimeToChallenge(11);
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

    await expectRevert(gtcr.connect(other).changeArbitrator(other.address, "0xff"), "The caller must be the governor.");
    await gtcr.connect(governor2).changeArbitrator(other.address, "0xff");
    assert.equal(await gtcr.arbitrator(), other.address, "Incorrect arbitrator address");
    assert.equal(await gtcr.arbitratorExtraData(), "0xff", "Incorrect extraData value");

    await expectRevert(gtcr.connect(other).changeConnectedTCR(other.address), "The caller must be the governor.");

    // Ensure `changeConnectedTCR` emits an event with the new address.
    const txChangeConnected = await gtcr.connect(governor2).changeConnectedTCR(governor2.address);
    const txChangeConnectedReceipt = await txChangeConnected.wait();
    assert.equal(
      txChangeConnectedReceipt.events[0].args._connectedTCR,
      governor2.address,
      "The event has the wrong connectedTCR address"
    );
    await expectRevert(
      gtcr.connect(other).changeMetaEvidence("_registrationMetaEvidence", "_clearingMetaEvidence"),
      "The caller must be the governor."
    );
    await gtcr.connect(governor2).changeMetaEvidence("_registrationMetaEvidence", "_clearingMetaEvidence");
    assert.equal((await gtcr.metaEvidenceUpdates()).toNumber(), 1, "Incorrect metaEvidenceUpdates value");
  });

  it("Should not be possibe to submit evidence to resolved dispute", async () => {
    await gtcr.connect(requester).addItem("0xaabbaa", {
      value: submitterTotalCost,
    });
    const itemID = await gtcr.itemList(0);

    await time.increase(challengePeriodDuration + 1);
    await gtcr.connect(governor).executeRequest(itemID);

    await expectRevert(
      gtcr.connect(other).submitEvidence(itemID, "Evidence2"),
      "The dispute must not already be resolved."
    );
  });
});
