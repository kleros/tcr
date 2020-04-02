/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { BN, expectRevert, time } = require('openzeppelin-test-helpers')
const { soliditySha3 } = require('web3-utils')

const GTCR = artifacts.require('./GeneralizedTCR.sol')
const Arbitrator = artifacts.require('EnhancedAppealableArbitrator')

contract('GTCR', function(accounts) {
  const governor = accounts[0]
  const requester = accounts[1]
  const challenger = accounts[2]
  const other = accounts[3]
  const governor2 = accounts[4]
  const arbitratorExtraData = '0x85'
  const arbitrationCost = 1000

  const appealTimeOut = 180
  const submissionBaseDeposit = 2000
  const removalBaseDeposit = 1300
  const submissionChallengeBaseDeposit = 5000
  const removalChallengeBaseDeposit = 1200
  const challengePeriodDuration = 600
  const sharedStakeMultiplier = 5000
  const winnerStakeMultiplier = 2000
  const loserStakeMultiplier = 8000
  const registrationMetaEvidence = 'registrationMetaEvidence.json'
  const clearingMetaEvidence = 'clearingMetaEvidence.json'

  const gasPrice = 5000000000

  let arbitrator
  let MULTIPLIER_DIVISOR
  let submitterTotalCost
  let submissionChallengeTotalCost
  beforeEach('initialize the contract', async function() {
    arbitrator = await Arbitrator.new(
      arbitrationCost,
      governor,
      arbitratorExtraData,
      appealTimeOut,
      { from: governor }
    )

    await arbitrator.changeArbitrator(arbitrator.address)
    await arbitrator.createDispute(3, arbitratorExtraData, {
      from: other,
      value: arbitrationCost
    }) // Create a dispute so the index in tests will not be a default value.

    gtcr = await GTCR.new(
      arbitrator.address,
      arbitratorExtraData,
      other, // Temporarily set connectedTCR to 'other' account for test purposes.
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor,
      submissionBaseDeposit,
      removalBaseDeposit,
      submissionChallengeBaseDeposit,
      removalChallengeBaseDeposit,
      challengePeriodDuration,
      [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
      { from: governor }
    )

    MULTIPLIER_DIVISOR = (await gtcr.MULTIPLIER_DIVISOR()).toNumber()
    submitterTotalCost =
      arbitrationCost +
      (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_DIVISOR +
      submissionBaseDeposit
    removalTotalCost =
      arbitrationCost +
      (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_DIVISOR +
      removalBaseDeposit
    submissionChallengeTotalCost =
      arbitrationCost +
      (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_DIVISOR +
      submissionChallengeBaseDeposit
    removalChallengeTotalCost =
      arbitrationCost +
      (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_DIVISOR +
      removalChallengeBaseDeposit
  })

  it('Should set the correct values in constructor', async () => {
    assert.equal(await gtcr.arbitrator(), arbitrator.address)
    assert.equal(await gtcr.arbitratorExtraData(), arbitratorExtraData)
    assert.equal(await gtcr.governor(), governor)
    assert.equal(await gtcr.submissionBaseDeposit(), submissionBaseDeposit)
    assert.equal(
      await gtcr.submissionChallengeBaseDeposit(),
      submissionChallengeBaseDeposit
    )
    assert.equal(await gtcr.challengePeriodDuration(), challengePeriodDuration)
    assert.equal(await gtcr.sharedStakeMultiplier(), sharedStakeMultiplier)
    assert.equal(await gtcr.winnerStakeMultiplier(), winnerStakeMultiplier)
    assert.equal(await gtcr.loserStakeMultiplier(), loserStakeMultiplier)
  })

  it('Should set the correct values and fire the event when requesting registration', async () => {
    await expectRevert(
      gtcr.addItem(
        '0xffb43c480000000000000000000000000000000000000000000000000000000000002222',
        { from: requester, value: submitterTotalCost - 1 }
      ),
      'You must fully fund your side.'
    )

    const txAddItem = await gtcr.addItem(
      '0xffb43c480000000000000000000000000000000000000000000000000000000000002222',
      { from: requester, value: submitterTotalCost }
    )

    await expectRevert(
      gtcr.addItem(
        '0xffb43c480000000000000000000000000000000000000000000000000000000000002222',
        { from: requester, value: submitterTotalCost }
      ),
      'Item must be absent to be added.'
    )

    const itemID = await gtcr.itemList(0)
    assert.equal(
      itemID,
      soliditySha3(
        '0xffb43c480000000000000000000000000000000000000000000000000000000000002222'
      ),
      'Item ID has not been set up properly'
    )

    const item = await gtcr.items(itemID)
    assert.equal(
      item[0],
      '0xffb43c480000000000000000000000000000000000000000000000000000000000002222',
      'Item data has not been set up properly'
    )
    assert.equal(
      item[1].toNumber(),
      2,
      'Item status has not been set up properly'
    )

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(
      request[4][1],
      requester,
      'Requester has not been set up properly'
    )
    assert.equal(
      request[7],
      arbitrator.address,
      'Request arbitrator has not been set up properly'
    )
    assert.equal(
      request[8],
      arbitratorExtraData,
      'Request extra data has not been set up properly'
    )
    assert.equal(
      request[9].toNumber(),
      2,
      'Request type has not been set up properly'
    )

    const round = await gtcr.getRoundInfo(itemID, 0, 0)
    assert.equal(
      round[1][1].toNumber(),
      submitterTotalCost,
      'Requester paidFees has not been registered correctly'
    )
    assert.equal(
      round[2][1],
      true,
      'Should register that requester paid his fees'
    )
    assert.equal(
      round[3].toNumber(),
      submitterTotalCost,
      'FeeRewards has not been registered correctly'
    )

    const contribution = await gtcr.getContributions(itemID, 0, 0, requester)
    assert.equal(
      contribution[1].toNumber(),
      submitterTotalCost,
      'Requester contribution has not been registered correctly'
    )

    assert.equal(
      txAddItem.logs[1].event,
      'ItemStatusChange',
      'The event has not been created'
    )
    assert.equal(
      txAddItem.logs[1].args._itemID,
      itemID,
      'The event has wrong item ID'
    )
    assert.equal(
      txAddItem.logs[1].args._requestIndex.toNumber(),
      0,
      'The event has wrong request index'
    )
    assert.equal(
      txAddItem.logs[1].args._roundIndex.toNumber(),
      0,
      'The event has wrong round index'
    )
  })

  it('Should set the correct values and create a dispute after the item is challenged and fire 2 events', async () => {
    await gtcr.addItem(
      '0xffb43c480000000000000000000000000000000000000000000000000000000000002222',
      { from: requester, value: submitterTotalCost }
    )
    const itemID = await gtcr.itemList(0)

    await expectRevert(
      gtcr.challengeRequest(itemID, 'Evidence.json', {
        from: challenger,
        value: submissionChallengeTotalCost - 1
      }),
      'You must fully fund your side.'
    )

    txChallenge = await gtcr.challengeRequest(itemID, 'Evidence.json', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(
      request[4][2],
      challenger,
      'Challenger has not been set up properly'
    )
    assert.equal(request[0], true, 'The request should have status disputed')
    assert.equal(
      request[1].toNumber(),
      1,
      'Dispute ID has not been set up properly'
    )
    assert.equal(
      request[5].toNumber(),
      2,
      'Number of rounds should have been incremented'
    )

    const arbitratorDisputeIDToItem = await gtcr.arbitratorDisputeIDToItem(
      arbitrator.address,
      1
    )
    assert.equal(
      arbitratorDisputeIDToItem,
      itemID,
      'Incorrect arbitratorDisputeIDToItem value'
    )

    const round = await gtcr.getRoundInfo(itemID, 0, 0)
    assert.equal(
      round[1][2].toNumber(),
      submissionChallengeTotalCost,
      'Challenger paidFees has not been registered correctly'
    )
    assert.equal(
      round[2][2],
      true,
      'Should register that challenger paid his fees'
    )
    assert.equal(
      round[3].toNumber(),
      submitterTotalCost + submissionChallengeTotalCost - arbitrationCost,
      'FeeRewards has not been registered correctly'
    )

    const dispute = await arbitrator.disputes(1)
    assert.equal(dispute[0], gtcr.address, 'Arbitrable not set up properly')
    assert.equal(
      dispute[1].toNumber(),
      2,
      'Number of choices not set up properly'
    )

    const evidenceGroupID = parseInt(soliditySha3(itemID, 0), 16)
    assert.equal(
      txChallenge.logs[0].event,
      'Dispute',
      'The event Dispute has not been created'
    )
    assert.equal(
      txChallenge.logs[0].args._arbitrator,
      arbitrator.address,
      'The event has wrong arbitrator'
    )
    assert.equal(
      txChallenge.logs[0].args._disputeID.toNumber(),
      1,
      'The event has wrong dispute ID'
    )
    assert.equal(
      txChallenge.logs[0].args._metaEvidenceID.toNumber(),
      0,
      'The event has wrong metaevidence ID'
    )
    assert.equal(
      txChallenge.logs[0].args._evidenceGroupID,
      evidenceGroupID,
      'The event has wrong evidenceGroup ID'
    )

    assert.equal(
      txChallenge.logs[1].event,
      'Evidence',
      'The event Evidence has not been created'
    )
    assert.equal(
      txChallenge.logs[1].args._arbitrator,
      arbitrator.address,
      'The event has wrong arbitrator'
    )
    assert.equal(
      txChallenge.logs[1].args._evidenceGroupID,
      evidenceGroupID,
      'The event has wrong evidenceGroup ID'
    )
    assert.equal(
      txChallenge.logs[1].args._party,
      challenger,
      'The event has wrong party'
    )
    assert.equal(
      txChallenge.logs[1].args._evidence,
      'Evidence.json',
      'The event has wrong evidence'
    )

    await expectRevert(
      gtcr.challengeRequest(itemID, 'Evidence2.json', {
        from: other,
        value: submissionChallengeTotalCost
      }),
      'The request should not have already been disputed.'
    )

    await time.increase(challengePeriodDuration + 1)
    await expectRevert(
      gtcr.executeRequest(itemID, { from: governor }),
      'The request should not be disputed.'
    )
  })

  it('Should not be possibe to challenge after timeout', async () => {
    await gtcr.addItem('0xaabbaa', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = await gtcr.itemList(0)

    await time.increase(challengePeriodDuration + 1)

    await expectRevert(
      gtcr.challengeRequest(itemID, 'Evidence.json', {
        from: challenger,
        value: submissionChallengeTotalCost
      }),
      'Challenges must occur during the challenge period.'
    )
  })

  it('Should successfully execute the request if it has not been challenged and fire the event', async () => {
    await gtcr.addItem(
      '0xffb43c480000000000000000000000000000000000000000000000000000000000002222',
      { from: requester, value: submitterTotalCost }
    )
    const itemID = await gtcr.itemList(0)
    const oldBalance = await web3.eth.getBalance(requester)

    await expectRevert(
      gtcr.executeRequest(itemID, { from: governor }),
      'Time to challenge the request must pass.'
    )

    await time.increase(challengePeriodDuration + 1)
    txExecute = await gtcr.executeRequest(itemID, { from: governor })
    const newBalance = await web3.eth.getBalance(requester)

    const item = await gtcr.items(itemID)
    assert.equal(item[1].toNumber(), 1, 'Item should have status Registered')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'Request should be resolved')

    assert.equal(
      txExecute.logs[0].event,
      'ItemStatusChange',
      'The event has not been created'
    )
    assert.equal(
      txExecute.logs[0].args._itemID,
      itemID,
      'The event has wrong item ID'
    )
    assert.equal(
      txExecute.logs[0].args._requestIndex.toNumber(),
      0,
      'The event has wrong request index'
    )
    assert.equal(
      txExecute.logs[0].args._roundIndex.toNumber(),
      0,
      'The event has wrong round index'
    )

    assert(
      new BN(newBalance).eq(new BN(oldBalance).add(new BN(submitterTotalCost))),
      'The requester was not reimbursed correctly'
    )

    const contribution = await gtcr.getContributions(itemID, 0, 0, requester)
    assert.equal(
      contribution[1].toNumber(),
      0,
      'Contribution of the requester should be 0'
    )
  })

  it('Should demand correct appeal fees and register that appeal fee has been paid', async () => {
    let roundInfo
    await gtcr.addItem('0x1111', { from: requester, value: submitterTotalCost })
    const itemID = await gtcr.itemList(0)
    await expectRevert(
      gtcr.fundAppeal(itemID, 2, { from: challenger, value: 2e18 }),
      'A dispute must have been raised to fund an appeal.'
    )

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, 2)

    // Appeal fee is the same as arbitration fee for this arbitrator.
    const loserAppealFee =
      arbitrationCost +
      (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR

    await expectRevert.unspecified(
      gtcr.fundAppeal(itemID, 0, { from: challenger, value: loserAppealFee }) // Check that not possible to fund 0 side.
    )

    // Deliberately overpay to check that only required fee amount will be registered.
    await gtcr.fundAppeal(itemID, 1, { from: requester, value: 3e18 })

    // Fund appeal again to see if it doesn't cause anything.
    await gtcr.fundAppeal(itemID, 1, { from: requester, value: 1e18 })

    roundInfo = await gtcr.getRoundInfo(itemID, 0, 1)

    assert.equal(
      roundInfo[1][1].toNumber(),
      loserAppealFee,
      'Registered fee of the requester is incorrect'
    )
    assert.equal(
      roundInfo[2][1],
      true,
      'Did not register that the requester successfully paid his fees'
    )

    assert.equal(
      roundInfo[1][2].toNumber(),
      0,
      'Should not register any payments for challenger'
    )
    assert.equal(
      roundInfo[2][2],
      false,
      'Should not register that challenger successfully paid fees'
    )
    assert.equal(
      roundInfo[3].toNumber(),
      loserAppealFee,
      'Incorrect FeeRewards value'
    )

    const winnerAppealFee =
      arbitrationCost +
      (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR

    // Increase time to make sure winner can pay in 2nd half.
    await time.increase(appealTimeOut / 2 + 1)

    await gtcr.fundAppeal(itemID, 2, {
      from: challenger,
      value: winnerAppealFee - 1
    }) // Underpay to see if it's registered correctly

    roundInfo = await gtcr.getRoundInfo(itemID, 0, 1)

    assert.equal(
      roundInfo[1][2].toNumber(),
      winnerAppealFee - 1,
      'Registered partial fee of the challenger is incorrect'
    )
    assert.equal(
      roundInfo[2][2],
      false,
      'Should not register that the challenger successfully paid his fees after partial payment'
    )

    assert.equal(
      roundInfo[3].toNumber(),
      loserAppealFee + winnerAppealFee - 1,
      'Incorrect FeeRewards value after partial payment'
    )

    await gtcr.fundAppeal(itemID, 2, { from: challenger, value: 5e18 })

    roundInfo = await gtcr.getRoundInfo(itemID, 0, 1)

    assert.equal(
      roundInfo[1][2].toNumber(),
      winnerAppealFee,
      'Registered fee of challenger is incorrect'
    )
    assert.equal(
      roundInfo[2][2],
      true,
      'Did not register that challenger successfully paid his fees'
    )

    assert.equal(
      roundInfo[3].toNumber(),
      winnerAppealFee + loserAppealFee - arbitrationCost,
      'Incorrect fee rewards value'
    )

    // If both sides pay their fees it starts new appeal round. Check that both sides have their value set to default.
    roundInfo = await gtcr.getRoundInfo(itemID, 0, 2)
    assert.equal(
      roundInfo[2][1],
      false,
      'Appeal fee payment for requester should not be registered in the new round'
    )
    assert.equal(
      roundInfo[2][2],
      false,
      'Appeal fee payment for challenger should not be registered in the new round'
    )
  })

  it('Should not be possible for loser to fund appeal if first half of appeal period has passed', async () => {
    await gtcr.addItem('0x1111', { from: requester, value: submitterTotalCost })
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, 2)

    const loserAppealFee =
      arbitrationCost +
      (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR
    time.increase(appealTimeOut / 2 + 1)
    await expectRevert(
      gtcr.fundAppeal(itemID, 1, { from: requester, value: loserAppealFee }),
      'The loser must contribute during the first half of the appeal period.'
    )
  })

  it('Should not be possible for winner to fund appeal if appeal period has passed', async () => {
    await gtcr.addItem('0x1111', { from: requester, value: submitterTotalCost })
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, 2)

    const winnerAppealFee =
      arbitrationCost +
      (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR
    time.increase(appealTimeOut + 1)
    await expectRevert(
      gtcr.fundAppeal(itemID, 2, { from: challenger, value: winnerAppealFee }),
      'Contributions must be made within the appeal period.'
    )
  })

  it('Should pay all parties correctly and set correct values when arbitrator refused to rule', async () => {
    const initialGTCRBalance = await web3.eth.getBalance(gtcr.address)
    const oldBalanceRequester = await web3.eth.getBalance(requester)
    const oldBalanceChallenger = await web3.eth.getBalance(challenger)

    await gtcr.addItem('0x1111', { from: requester, value: submitterTotalCost })
    const requestGasCost = new BN(oldBalanceRequester)
      .sub(new BN(await web3.eth.getBalance(requester)))
      .sub(new BN(submitterTotalCost))
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })
    const challengeGasCost = new BN(oldBalanceChallenger)
      .sub(new BN(await web3.eth.getBalance(challenger)))
      .sub(new BN(submissionChallengeTotalCost))

    await arbitrator.giveRuling(1, 0)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 0)

    const item = await gtcr.items(itemID)
    assert.equal(item[1].toNumber(), 0, 'Item should have status Absent')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(request[6].toNumber(), 0, 'Request has incorrect ruling')

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    // In the case that the arbitrator refused to rule and no one
    // appealed, the reimbursements should look like this:
    //
    // The arbitration cost is split between the two parties 50% 50%
    // Both parties should receive their deposits fully.
    // There should be no ETH left in the GTCR contract.
    assert.equal(
      newBalanceRequester,
      new BN(oldBalanceRequester)
        .sub(new BN(arbitrationCost).div(new BN(2)))
        .sub(requestGasCost)
        .toString(),
      'Requester should have only paid half of the arbitrarion fees.'
    )
    assert.equal(
      newBalanceChallenger,
      new BN(oldBalanceChallenger)
        .sub(new BN(arbitrationCost).div(new BN(2)))
        .sub(challengeGasCost)
        .toString(),
      'Challengers should have only paid half of the arbitrarion fees.'
    )

    const gtcrBalanceAfter = await web3.eth.getBalance(gtcr.address)
    assert.equal(
      gtcrBalanceAfter,
      initialGTCRBalance,
      'Contract should not have remaining ETH from this request.'
    )
  })

  it('Should paid to all parties correctly and set correct values when requester wins', async () => {
    await gtcr.addItem('0x1111', { from: requester, value: submitterTotalCost })
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    const oldBalanceRequester = await web3.eth.getBalance(requester)
    const oldBalanceChallenger = await web3.eth.getBalance(challenger)

    await arbitrator.giveRuling(1, 1)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 1)

    const item = await gtcr.items(itemID)
    assert.equal(item[1].toNumber(), 1, 'Item should have status Registered')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(request[6].toNumber(), 1, 'Request has incorrect ruling')

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    assert(
      new BN(newBalanceRequester).eq(
        new BN(oldBalanceRequester).add(new BN(9000))
      ), // Requester should be paid the whole feeRewards pot (9000)
      'The requester was not reimbursed correctly'
    )

    assert(
      new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger)),
      'The balance of the challenger should stay the same'
    )
  })

  it('Should paid to all parties correctly and set correct values when challenger wins', async () => {
    await gtcr.addItem('0x1111224411', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'testEvidence11', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    const oldBalanceRequester = await web3.eth.getBalance(requester)
    const oldBalanceChallenger = await web3.eth.getBalance(challenger)

    await arbitrator.giveRuling(1, 2)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 2)

    const item = await gtcr.items(itemID)
    assert.equal(item[1].toNumber(), 0, 'Item should have status Absent')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(request[6].toNumber(), 2, 'Request has incorrect ruling')

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    assert(
      new BN(newBalanceRequester).eq(new BN(oldBalanceRequester)),
      'The balance of the requester should stay the same'
    )

    assert(
      new BN(newBalanceChallenger).eq(
        new BN(oldBalanceChallenger).add(new BN(9000))
      ), // Challenger should be paid the whole feeRewards pot (9000)
      'The challenger was not reimbursed correctly'
    )
  })

  it('Should change the ruling if the loser paid appeal fee while winner did not', async () => {
    await gtcr.addItem(
      '0x1111224411ffaa2eaf1111224411ffaa2eaf1111224411ffaa2eaf',
      { from: requester, value: submitterTotalCost }
    )
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'E', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, 2)

    const loserAppealFee =
      arbitrationCost +
      (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR

    // Invert the ruling so the requester should win
    await gtcr.fundAppeal(itemID, 1, {
      from: requester,
      value: loserAppealFee * 2
    })

    const oldBalanceRequester = await web3.eth.getBalance(requester)
    const oldBalanceChallenger = await web3.eth.getBalance(challenger)

    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 2)

    const item = await gtcr.items(itemID)
    assert.equal(item[1].toNumber(), 1, 'Item should have status Registered')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(request[6].toNumber(), 1, 'Request has incorrect ruling')

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    assert(
      new BN(newBalanceRequester).eq(
        new BN(oldBalanceRequester).add(new BN(9000))
      ),
      'The requester was not reimbursed correctly'
    )

    assert(
      new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger)),
      'The balance of the challenger should stay the same'
    )
  })

  it('Should withdraw correct fees if dispute had winner/loser', async () => {
    await gtcr.addItem('0x1111', { from: requester, value: submitterTotalCost })
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, 1)

    // 1st appeal round.
    const loserAppealFee =
      arbitrationCost +
      (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR

    await gtcr.fundAppeal(itemID, 2, {
      from: challenger,
      value: loserAppealFee * 0.2
    })
    await gtcr.fundAppeal(itemID, 2, {
      from: challenger,
      value: loserAppealFee * 0.3
    })
    await gtcr.fundAppeal(itemID, 2, { from: other, value: loserAppealFee * 5 })

    const winnerAppealFee =
      arbitrationCost +
      (arbitrationCost * winnerStakeMultiplier) / MULTIPLIER_DIVISOR

    await gtcr.fundAppeal(itemID, 1, {
      from: other,
      value: winnerAppealFee * 0.8
    })
    await gtcr.fundAppeal(itemID, 1, {
      from: requester,
      value: winnerAppealFee * 0.8
    })

    await arbitrator.giveRuling(2, 2) // Change the ruling to see that logic doesn't break.

    // 2nd appeal round.

    // Check that can't withdraw if request is unresolved
    await expectRevert.unspecified(
      gtcr.withdrawFeesAndRewards(requester, itemID, 0, 1, { from: governor })
    )

    await gtcr.fundAppeal(itemID, 1, {
      from: requester,
      value: winnerAppealFee
    }) // WinnerAppealFee should not be enough because requester is now loser.

    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(2, 2)

    const oldBalanceRequester = await web3.eth.getBalance(requester)
    await gtcr.withdrawFeesAndRewards(requester, itemID, 0, 1, {
      from: governor
    })
    let newBalanceRequester = await web3.eth.getBalance(requester)
    assert(
      new BN(newBalanceRequester).eq(new BN(oldBalanceRequester)),
      'The balance of the requester should stay the same after withdrawing from the first round'
    )

    await gtcr.withdrawFeesAndRewards(requester, itemID, 0, 2, {
      from: governor
    })
    newBalanceRequester = await web3.eth.getBalance(requester)
    assert(
      new BN(newBalanceRequester).eq(
        new BN(oldBalanceRequester).add(new BN(winnerAppealFee))
      ),
      'The requester should be reimbursed what he paid in the 2nd appeal round'
    )

    const oldBalanceChallenger = await web3.eth.getBalance(challenger)
    await gtcr.withdrawFeesAndRewards(challenger, itemID, 0, 1, {
      from: governor
    })
    const newBalanceChallenger = await web3.eth.getBalance(challenger)
    assert(
      new BN(newBalanceChallenger).eq(
        new BN(oldBalanceChallenger).add(new BN(1000))
      ), // Challenger paid a half of his fees so he geth the half of feeRewards
      'The challenger was not reimbursed correctly'
    )

    const oldBalanceCrowdfunder = await web3.eth.getBalance(other)
    await gtcr.withdrawFeesAndRewards(other, itemID, 0, 1, { from: governor })
    const newBalanceCrowdfunder = await web3.eth.getBalance(other)
    assert(
      new BN(newBalanceCrowdfunder).eq(
        new BN(oldBalanceCrowdfunder).add(new BN(1000))
      ), // Crowdfunder paid only half of the fees as well
      'The crowdfunder was not reimbursed correctly'
    )
  })

  it('Should withdraw correct fees if arbitrator refused to arbitrate', async () => {
    await gtcr.addItem('0x1111', { from: requester, value: submitterTotalCost })
    const itemID = await gtcr.itemList(0)

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, 0)

    // 1st appeal round.
    const sharedAppealFee =
      arbitrationCost +
      (arbitrationCost * sharedStakeMultiplier) / MULTIPLIER_DIVISOR

    await gtcr.fundAppeal(itemID, 1, {
      from: requester,
      value: sharedAppealFee * 0.4
    })
    await gtcr.fundAppeal(itemID, 2, {
      from: challenger,
      value: sharedAppealFee * 0.6
    })

    await gtcr.fundAppeal(itemID, 1, { from: other, value: sharedAppealFee })
    await gtcr.fundAppeal(itemID, 2, { from: other, value: sharedAppealFee })

    await arbitrator.giveRuling(2, 0)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(2, 0)

    const oldBalanceRequester = await web3.eth.getBalance(requester)
    await gtcr.withdrawFeesAndRewards(requester, itemID, 0, 1, {
      from: governor
    })
    const newBalanceRequester = await web3.eth.getBalance(requester)
    assert(
      new BN(newBalanceRequester).eq(
        new BN(oldBalanceRequester).add(new BN(400))
      ), // Gets 1/5 of total reward
      'The requester was not reimbursed correctly'
    )

    const oldBalanceChallenger = await web3.eth.getBalance(challenger)
    await gtcr.withdrawFeesAndRewards(challenger, itemID, 0, 1, {
      from: governor
    })
    const newBalanceChallenger = await web3.eth.getBalance(challenger)
    assert(
      new BN(newBalanceChallenger).eq(
        new BN(oldBalanceChallenger).add(new BN(600))
      ), /// Gets 3/10 of total reward
      'The challenger was not reimbursed correctly'
    )

    const oldBalanceCrowdfunder = await web3.eth.getBalance(other)
    await gtcr.withdrawFeesAndRewards(other, itemID, 0, 1, { from: governor })
    const newBalanceCrowdfunder = await web3.eth.getBalance(other)

    assert(
      new BN(newBalanceCrowdfunder).eq(
        new BN(oldBalanceCrowdfunder).add(new BN(1000))
      ), // Gets half of the total reward
      'The crowdfunder was not reimbursed correctly after withdrawing from the first round'
    )
  })

  it('Check various cases of status requirements and the removing request', async () => {
    // 1st request.
    await gtcr.addItem('0xaabbaa', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = await gtcr.itemList(0)
    await time.increase(challengePeriodDuration + 1)
    await gtcr.executeRequest(itemID, { from: governor })

    // 2th request.
    await gtcr.removeItem(itemID, '', {
      from: requester,
      value: removalTotalCost
    })

    await gtcr.challengeRequest(itemID, 'evidence', {
      from: challenger,
      value: removalChallengeTotalCost
    })

    await arbitrator.giveRuling(1, 2)
    await gtcr.fundAppeal(itemID, 2, { from: challenger, value: 1 }) // Just check that appeal works, the value is irrelevant.
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, 2)

    item = await gtcr.getItemInfo(itemID)
    assert.equal(item[1].toNumber(), 1, 'Item should have status Registered')

    // 3th request.
    await gtcr.removeItem(itemID, '', {
      from: requester,
      value: removalTotalCost
    })
    await time.increase(challengePeriodDuration + 1)

    await gtcr.executeRequest(itemID, { from: governor })
    item = await gtcr.getItemInfo(itemID)
    assert.equal(item[1].toNumber(), 0, 'Item should have status Absent')
    assert.equal(
      item[2].toNumber(),
      3,
      'The total number of requests is incorrect'
    )

    await gtcr.addItem('0x1221', { from: requester, value: submitterTotalCost })
    const count = await gtcr.itemCount()
    assert.equal(count.toNumber(), 2, 'The total number of items is incorrect')
  })

  it('Only the governor should be allowed to change state variables', async () => {
    await expectRevert(
      gtcr.changeTimeToChallenge(11, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeTimeToChallenge(11, { from: governor })
    assert.equal(
      (await gtcr.challengePeriodDuration()).toNumber(),
      11,
      'Incorrect challengePeriodDuration value'
    )

    await expectRevert(
      gtcr.changeSubmissionBaseDeposit(22, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeSubmissionBaseDeposit(22, { from: governor })
    assert.equal(
      (await gtcr.submissionBaseDeposit()).toNumber(),
      22,
      'Incorrect submissionBaseDeposit value'
    )

    await expectRevert(
      gtcr.changeRemovalBaseDeposit(23, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeRemovalBaseDeposit(23, { from: governor })
    assert.equal(
      (await gtcr.removalBaseDeposit()).toNumber(),
      23,
      'Incorrect removalBaseDeposit value'
    )

    await expectRevert(
      gtcr.changeSubmissionChallengeBaseDeposit(44, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeSubmissionChallengeBaseDeposit(44, { from: governor })
    assert.equal(
      (await gtcr.submissionChallengeBaseDeposit()).toNumber(),
      44,
      'Incorrect submissionChallengeBaseDeposit value'
    )

    await expectRevert(
      gtcr.changeRemovalChallengeBaseDeposit(55, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeRemovalChallengeBaseDeposit(55, { from: governor })
    assert.equal(
      (await gtcr.removalChallengeBaseDeposit()).toNumber(),
      55,
      'Incorrect removalChallengeBaseDeposit value'
    )

    await expectRevert(
      gtcr.changeGovernor(governor2, { from: governor2 }),
      'The caller must be the governor.'
    )
    await gtcr.changeGovernor(governor2, { from: governor })
    assert.equal(await gtcr.governor(), governor2, 'Incorrect governor address')

    await expectRevert(
      gtcr.changeSharedStakeMultiplier(44, { from: governor }),
      'The caller must be the governor.'
    )
    await gtcr.changeSharedStakeMultiplier(44, { from: governor2 })
    assert.equal(
      (await gtcr.sharedStakeMultiplier()).toNumber(),
      44,
      'Incorrect sharedStakeMultiplier value'
    )

    await expectRevert(
      gtcr.changeWinnerStakeMultiplier(55, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeWinnerStakeMultiplier(55, { from: governor2 })
    assert.equal(
      (await gtcr.winnerStakeMultiplier()).toNumber(),
      55,
      'Incorrect winnerStakeMultiplier value'
    )

    await expectRevert(
      gtcr.changeLoserStakeMultiplier(66, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeLoserStakeMultiplier(66, { from: governor2 })
    assert.equal(
      (await gtcr.loserStakeMultiplier()).toNumber(),
      66,
      'Incorrect loserStakeMultiplier value'
    )

    await expectRevert(
      gtcr.changeArbitrator(other, '0xff', { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeArbitrator(other, '0xff', { from: governor2 })
    assert.equal(await gtcr.arbitrator(), other, 'Incorrect arbitrator address')
    assert.equal(
      await gtcr.arbitratorExtraData(),
      '0xff',
      'Incorrect extraData value'
    )

    await expectRevert(
      gtcr.changeConnectedTCR(other, { from: other }),
      'The caller must be the governor.'
    )

    // Ensure `changeConnectedTCR` emits an event with the new address.
    const txChangeConnected = await gtcr.changeConnectedTCR(governor2, {
      from: governor2
    })
    assert.equal(
      txChangeConnected.logs[0].args._connectedTCR,
      governor2,
      'The event has the wrong connectedTCR address'
    )

    await expectRevert(
      gtcr.changeMetaEvidence(
        '_registrationMetaEvidence',
        '_clearingMetaEvidence',
        { from: other }
      ),
      'The caller must be the governor.'
    )
    await gtcr.changeMetaEvidence(
      '_registrationMetaEvidence',
      '_clearingMetaEvidence',
      { from: governor2 }
    )
    assert.equal(
      (await gtcr.metaEvidenceUpdates()).toNumber(),
      1,
      'Incorrect metaEvidenceUpdates value'
    )
  })

  it('Should not be possibe to submit evidence to resolved dispute', async () => {
    await gtcr.addItem('0xaabbaa', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = await gtcr.itemList(0)

    await time.increase(challengePeriodDuration + 1)
    await gtcr.executeRequest(itemID, { from: governor })

    await expectRevert(
      gtcr.submitEvidence(itemID, 'Evidence2', { from: other }),
      'The dispute must not already be resolved.'
    )
  })
})
