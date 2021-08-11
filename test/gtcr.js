/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.
const { BN, expectRevert, time } = require('openzeppelin-test-helpers')
const { soliditySha3 } = require('web3-utils')

const GTCR = artifacts.require('./GeneralizedTCR.sol')
const GTCRFactory = artifacts.require('./GTCRFactory.sol')
const Arbitrator = artifacts.require('EnhancedAppealableArbitrator')

const RelayMock = artifacts.require('RelayMock')

const PARTY = {
  NONE: 0,
  REQUESTER: 1,
  CHALLENGER: 2
}

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

  let arbitrator
  let factory
  let gtcr
  let implementation
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

    relay = await RelayMock.new({ from: governor })

    await arbitrator.changeArbitrator(arbitrator.address)
    await arbitrator.createDispute(3, arbitratorExtraData, {
      from: other,
      value: arbitrationCost
    }) // Create a dispute so the index in tests will not be a default value.

    implementation = await GTCR.new() // This contract is going to be used with DELEGATECALL from each GTCR proxy.
    factory = await GTCRFactory.new(implementation.address)
    await factory.deploy(
      arbitrator.address,
      arbitratorExtraData,
      other, // Temporarily set connectedTCR to 'other' account for test purposes.
      registrationMetaEvidence,
      clearingMetaEvidence,
      governor,
      [
        submissionBaseDeposit,
        removalBaseDeposit,
        submissionChallengeBaseDeposit,
        removalChallengeBaseDeposit
      ],
      challengePeriodDuration,
      [sharedStakeMultiplier, winnerStakeMultiplier, loserStakeMultiplier],
      relay.address,
      { from: governor }
    )
    const proxyAddress = await factory.instances(new BN(0))
    gtcr = await GTCR.at(proxyAddress)

    MULTIPLIER_DIVISOR = (await gtcr.MULTIPLIER_DIVISOR()).toNumber()
    submitterTotalCost = arbitrationCost + submissionBaseDeposit
    removalTotalCost = arbitrationCost + removalBaseDeposit
    submissionChallengeTotalCost =
      arbitrationCost + submissionChallengeBaseDeposit
    removalChallengeTotalCost = arbitrationCost + removalChallengeBaseDeposit
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
    assert.equal(await gtcr.relayContract(), relay.address)
  })

  it('Should set the correct values and fire the event when requesting registration', async () => {
    await expectRevert(
      gtcr.addItem('/ipfs/Qwabdaa', {
        from: requester,
        value: submitterTotalCost - 1
      }),
      'You must fully fund your side.'
    )

    const txAddItem = await gtcr.addItem('/ipfs/Qwabdaa', {
      from: requester,
      value: submitterTotalCost
    })

    await expectRevert(
      gtcr.addItem('/ipfs/Qwabdaa', {
        from: requester,
        value: submitterTotalCost
      }),
      'Item must be absent to be added.'
    )

    const itemID = txAddItem.logs[0].args._itemID
    assert.equal(
      itemID,
      soliditySha3('/ipfs/Qwabdaa'),
      'Item ID has not been set up properly'
    )

    const item = await gtcr.items(itemID)
    assert.equal(item.toNumber(), 2, 'Item status has not been set up properly')

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
      txAddItem.logs[2].event,
      'RequestSubmitted',
      'The event has not been created'
    )
    assert.equal(
      txAddItem.logs[0].args._itemID,
      itemID,
      'The event has wrong item ID'
    )
  })

  it('Should set the correct values and create a dispute after the item is challenged and fire 2 events', async () => {
    const tx = await gtcr.addItem('/ipfs/Qwabdaa', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[0].args._itemID

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

    const arbitratorDisputeIDToItemID = await gtcr.arbitratorDisputeIDToItemID(
      arbitrator.address,
      1
    )
    assert.equal(
      arbitratorDisputeIDToItemID,
      itemID,
      'Incorrect arbitratorDisputeIDToItemID value'
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
      txChallenge.logs[1].event,
      'Dispute',
      'The event Dispute has not been created'
    )
    assert.equal(
      txChallenge.logs[1].args._arbitrator,
      arbitrator.address,
      'The event has wrong arbitrator'
    )
    assert.equal(
      txChallenge.logs[1].args._disputeID.toNumber(),
      1,
      'The event has wrong dispute ID'
    )
    assert.equal(
      txChallenge.logs[1].args._metaEvidenceID.toNumber(),
      0,
      'The event has wrong metaevidence ID'
    )
    assert.equal(
      txChallenge.logs[1].args._evidenceGroupID,
      evidenceGroupID,
      'The event has wrong evidenceGroup ID'
    )

    assert.equal(
      txChallenge.logs[2].event,
      'Evidence',
      'The event Evidence has not been created'
    )
    assert.equal(
      txChallenge.logs[2].args._arbitrator,
      arbitrator.address,
      'The event has wrong arbitrator'
    )
    assert.equal(
      txChallenge.logs[2].args._evidenceGroupID,
      evidenceGroupID,
      'The event has wrong evidenceGroup ID'
    )
    assert.equal(
      txChallenge.logs[2].args._party,
      challenger,
      'The event has wrong party'
    )
    assert.equal(
      txChallenge.logs[2].args._evidence,
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
    const tx = await gtcr.addItem('0xaabbaa', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[0].args._itemID

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
    const tx = await gtcr.addItem('/ipfs/Qwabdaa', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[0].args._itemID
    const oldBalance = await web3.eth.getBalance(requester)

    await expectRevert(
      gtcr.executeRequest(itemID, { from: governor }),
      'Time to challenge the request must pass.'
    )

    await time.increase(challengePeriodDuration + 1)
    txExecute = await gtcr.executeRequest(itemID, { from: governor })
    const newBalance = await web3.eth.getBalance(requester)

    const item = await gtcr.items(itemID)
    assert.equal(item.toNumber(), 1, 'Item should have status Registered')

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
    const tx = await gtcr.addItem('0x1111', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[0].args._itemID
    await expectRevert(
      gtcr.fundAppeal(itemID, 2, { from: challenger, value: 2e18 }),
      'A dispute must have been raised to fund an appeal.'
    )

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, PARTY.CHALLENGER)

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
    const tx = await gtcr.addItem('0x1111', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[1].args._itemID

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, PARTY.CHALLENGER)

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
    const tx = await gtcr.addItem('0x1111', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[1].args._itemID

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, PARTY.CHALLENGER)

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

    const tx = await gtcr.addItem('0x1111', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[0].args._itemID
    const addTxCost = new BN(oldBalanceRequester)
      .sub(new BN(await web3.eth.getBalance(requester)))
      .sub(new BN(submitterTotalCost))

    assert.equal(
      (await web3.eth.getBalance(gtcr.address)).toString(),
      (arbitrationCost + submissionBaseDeposit).toString(),
      'Incorrect contract balance.'
    )

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    const challengeTxCost = new BN(oldBalanceChallenger)
      .sub(new BN(await web3.eth.getBalance(challenger)))
      .sub(new BN(submissionChallengeTotalCost))

    assert.equal(
      (await web3.eth.getBalance(gtcr.address)).toString(),
      (
        arbitrationCost +
        submissionBaseDeposit +
        submissionChallengeBaseDeposit
      ).toString(),
      'Incorrect contract balance.'
    )

    await arbitrator.giveRuling(1, PARTY.NONE)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, PARTY.NONE)

    const item = await gtcr.items(itemID)
    assert.equal(item.toNumber(), 0, 'Item should have status Absent')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(
      request[6].toNumber(),
      PARTY.NONE,
      'Request has incorrect ruling'
    )

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    const submitterExpectedPay = new BN(submitterTotalCost)
      .mul(new BN(MULTIPLIER_DIVISOR))
      .div(new BN(submissionChallengeTotalCost).add(new BN(submitterTotalCost)))
      .mul(new BN(arbitrationCost))
      .div(new BN(MULTIPLIER_DIVISOR))

    const challengerExpectedPay = new BN(submissionChallengeTotalCost)
      .mul(new BN(MULTIPLIER_DIVISOR))
      .div(new BN(submissionChallengeTotalCost).add(new BN(submitterTotalCost)))
      .mul(new BN(arbitrationCost))
      .div(new BN(MULTIPLIER_DIVISOR))

    assert.equal(
      new BN(oldBalanceRequester)
        .sub(new BN(newBalanceRequester))
        .sub(addTxCost)
        .sub(new BN('1')) // Account for rounding error
        .toString(),
      submitterExpectedPay.toString(),
      'Requester did not pay the expected share of arbitration fees.'
    )
    assert.equal(
      new BN(oldBalanceChallenger)
        .sub(new BN(newBalanceChallenger))
        .sub(challengeTxCost)
        .sub(new BN('1')) // Account for rounding error
        .toString(),
      challengerExpectedPay.toString(),
      'Challengers did not pay the expected share of arbitration fees.'
    )

    const gtcrBalanceAfter = await web3.eth.getBalance(gtcr.address)
    assert.equal(
      (gtcrBalanceAfter - 1).toString(), // Subtract 1 wei to account for rounding error.
      initialGTCRBalance,
      'Contract should not have remaining ETH from this request.'
    )
  })

  it('Should paid to all parties correctly and set correct values when requester wins', async () => {
    const initialRequesterBalance = await web3.eth.getBalance(requester)
    const tx = await gtcr.addItem('0x1111', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[1].args._itemID
    const addTxCost = new BN(initialRequesterBalance)
      .sub(new BN(await web3.eth.getBalance(requester)))
      .sub(new BN(submitterTotalCost))

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    const oldBalanceChallenger = await web3.eth.getBalance(challenger)

    await arbitrator.giveRuling(1, PARTY.REQUESTER)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, PARTY.REQUESTER)

    const item = await gtcr.items(itemID)
    assert.equal(item.toNumber(), 1, 'Item should have status Registered')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(request[6].toNumber(), 1, 'Request has incorrect ruling')

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    // Requester should be paid the whole feeRewards pot.
    assert.equal(
      newBalanceRequester,
      new BN(initialRequesterBalance)
        .sub(new BN(addTxCost))
        .add(new BN(submissionChallengeBaseDeposit))
        .toString(),
      'The requester was not reimbursed and awarded correctly'
    )

    assert(
      new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger)),
      'The balance of the challenger should stay the same'
    )
  })

  it('Should paid to all parties correctly and set correct values when challenger wins', async () => {
    const tx = await gtcr.addItem('0x1111224411', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[1].args._itemID

    const initialChallengerBalance = await web3.eth.getBalance(challenger)
    await gtcr.challengeRequest(itemID, 'testEvidence11', {
      from: challenger,
      value: submissionChallengeTotalCost
    })
    const challengeTxCost = new BN(initialChallengerBalance)
      .sub(new BN(await web3.eth.getBalance(challenger)))
      .sub(new BN(submissionChallengeTotalCost))

    const oldBalanceRequester = await web3.eth.getBalance(requester)

    await arbitrator.giveRuling(1, PARTY.CHALLENGER)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, PARTY.CHALLENGER)

    const item = await gtcr.items(itemID)
    assert.equal(item.toNumber(), 0, 'Item should have status Absent')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(request[6].toNumber(), 2, 'Request has incorrect ruling')

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    assert(
      new BN(newBalanceRequester).eq(new BN(oldBalanceRequester)),
      'The balance of the requester should stay the same'
    )

    // Challenger should be paid the whole feeRewards pot (9000)
    assert.equal(
      newBalanceChallenger,
      new BN(initialChallengerBalance)
        .sub(new BN(challengeTxCost))
        .add(new BN(submissionBaseDeposit))
        .toString(),
      'The challenger was not reimbursed and awarded correctly'
    )
  })

  it('Should change the ruling if the loser paid appeal fee while winner did not', async () => {
    const initialRequesterBalance = await web3.eth.getBalance(requester)
    const tx = await gtcr.addItem(
      '0x1111224411ffaa2eaf1111224411ffaa2eaf1111224411ffaa2eaf',
      { from: requester, value: submitterTotalCost }
    )
    const itemID = tx.logs[1].args._itemID

    const addTxCost = new BN(initialRequesterBalance)
      .sub(new BN(await web3.eth.getBalance(requester)))
      .sub(new BN(submitterTotalCost))

    await gtcr.challengeRequest(itemID, 'E', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, PARTY.CHALLENGER)

    const loserAppealFee =
      arbitrationCost +
      (arbitrationCost * loserStakeMultiplier) / MULTIPLIER_DIVISOR

    const requesterBalBeforeAppeal = await web3.eth.getBalance(requester)
    // Invert the ruling so the requester should win

    await gtcr.fundAppeal(itemID, 1, {
      from: requester,
      value: loserAppealFee
    })

    const fundAppealTxCost = new BN(requesterBalBeforeAppeal)
      .sub(new BN(await web3.eth.getBalance(requester)))
      .sub(new BN(loserAppealFee))

    const oldBalanceChallenger = await web3.eth.getBalance(challenger)

    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, PARTY.CHALLENGER)

    const item = await gtcr.items(itemID)
    assert.equal(item.toNumber(), 1, 'Item should have status Registered')

    const request = await gtcr.getRequestInfo(itemID, 0)
    assert.equal(request[3], true, 'The request should be resolved')
    assert.equal(request[6].toNumber(), 1, 'Request has incorrect ruling')

    const newBalanceRequester = await web3.eth.getBalance(requester)
    const newBalanceChallenger = await web3.eth.getBalance(challenger)

    assert.equal(
      newBalanceRequester,
      new BN(initialRequesterBalance)
        .sub(new BN(addTxCost))
        .sub(new BN(fundAppealTxCost))
        .add(new BN(submissionChallengeBaseDeposit))
        .sub(new BN(loserAppealFee)) // The appeal fees paid in the last round must be withdrawn in another tx.
        .toString(),
      'The requester was not reimbursed and awarded correctly'
    )

    assert(
      new BN(newBalanceChallenger).eq(new BN(oldBalanceChallenger)),
      'The balance of the challenger should stay the same'
    )
  })

  it('Should withdraw correct fees if dispute had winner/loser', async () => {
    const tx = await gtcr.addItem('0x1111', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[1].args._itemID

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, PARTY.REQUESTER)

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

    await arbitrator.giveRuling(2, PARTY.CHALLENGER) // Change the ruling to see that logic doesn't break.

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
    await arbitrator.giveRuling(2, PARTY.CHALLENGER)

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
    const tx = await gtcr.addItem('0x1111', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[1].args._itemID

    await gtcr.challengeRequest(itemID, 'aaa', {
      from: challenger,
      value: submissionChallengeTotalCost
    })

    await arbitrator.giveRuling(1, PARTY.NONE)

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

    await arbitrator.giveRuling(2, PARTY.NONE)
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(2, PARTY.NONE)

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
    const tx = await gtcr.addItem('0xaabbaa', {
      from: requester,
      value: submitterTotalCost
    })

    const itemID = tx.logs[0].args._itemID
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

    await arbitrator.giveRuling(1, PARTY.CHALLENGER)
    await gtcr.fundAppeal(itemID, 2, { from: challenger, value: 1 }) // Just check that appeal works, the value is irrelevant.
    await time.increase(appealTimeOut + 1)
    await arbitrator.giveRuling(1, PARTY.CHALLENGER)

    item = await gtcr.getItemInfo(itemID)
    assert.equal(item[0].toNumber(), 1, 'Item should have status Registered')

    // 3th request.
    await gtcr.removeItem(itemID, '', {
      from: requester,
      value: removalTotalCost
    })
    await time.increase(challengePeriodDuration + 1)

    await gtcr.executeRequest(itemID, { from: governor })
    item = await gtcr.getItemInfo(itemID)
    assert.equal(item[0].toNumber(), 0, 'Item should have status Absent')
    assert.equal(
      item[1].toNumber(),
      3,
      'The total number of requests is incorrect'
    )

    await gtcr.addItem('0x1221', { from: requester, value: submitterTotalCost })
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

    await expectRevert(
      gtcr.changeRelayContract(other, { from: other }),
      'The caller must be the governor.'
    )
    await gtcr.changeRelayContract(other, { from: governor2 })
    assert.equal(
      await gtcr.relayContract(),
      other,
      'Incorrect relayContract address'
    )
  })

  it('Should not be possibe to submit evidence to resolved dispute', async () => {
    const tx = await gtcr.addItem('0xaabbaa', {
      from: requester,
      value: submitterTotalCost
    })
    const itemID = tx.logs[1].args._itemID

    await time.increase(challengePeriodDuration + 1)
    await gtcr.executeRequest(itemID, { from: governor })

    await expectRevert(
      gtcr.submitEvidence(itemID, 'Evidence2', { from: other }),
      'The dispute must not already be resolved.'
    )
  })

  it('Should correctly add an item directly', async () => {
    await expectRevert(
      gtcr.addItemDirectly('/ipfs/Qwabdaa', { from: other }),
      'The caller must be the relay.'
    )

    await relay.add(gtcr.address, '/ipfs/Qwabdaa')
    const itemID = soliditySha3('/ipfs/Qwabdaa')
    assert.equal(
      itemID,
      soliditySha3('/ipfs/Qwabdaa'),
      'Item ID has not been set up properly'
    )

    const item = await gtcr.getItemInfo(itemID)
    assert.equal(item[0].toNumber(), 1, 'Item status should be Registered')

    await expectRevert(
      relay.add(gtcr.address, '/ipfs/Qwabdaa'),
      'Item must be absent to be added.'
    )
  })

  it('Should correctly remove an item directly', async () => {
    await relay.add(gtcr.address, '/ipfs/Qwadddggbdaa')
    const itemID = soliditySha3('/ipfs/Qwadddggbdaa')

    await expectRevert(
      gtcr.removeItemDirectly(itemID, { from: other }),
      'The caller must be the relay.'
    )

    await relay.remove(gtcr.address, itemID)

    const item = await gtcr.getItemInfo(itemID)
    assert.equal(item[0].toNumber(), 0, 'Item status should be Absent')
    assert.equal(item[1].toNumber(), 0, 'Item has incorrect number of requests') // Direct adds don't generate requests.

    await expectRevert(
      relay.remove(gtcr.address, itemID),
      'Item must be registered to be removed.'
    )
  })
})
