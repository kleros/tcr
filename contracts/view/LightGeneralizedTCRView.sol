/**
 *  @authors: [@mtsalenc]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import {LightGeneralizedTCR, IArbitrator} from "../LightGeneralizedTCR.sol";

/* solium-disable max-len */
/* solium-disable security/no-block-members */
/* solium-disable security/no-send */
// It is the user responsibility to accept ETH.

/**
 *  @title LightGeneralizedTCRView
 *  A view contract to fetch, batch, parse and return GTCR contract data efficiently.
 *  This contract includes functions that can halt execution due to out-of-gas exceptions. Because of this it should never be relied upon by other contracts.
 */
contract LightGeneralizedTCRView {
    struct QueryResult {
        bytes32 ID;
        LightGeneralizedTCR.Status status;
        bool disputed;
        bool resolved;
        uint256 disputeID;
        uint256 appealCost;
        bool appealed;
        uint256 appealStart;
        uint256 appealEnd;
        LightGeneralizedTCR.Party ruling;
        address requester;
        address challenger;
        address arbitrator;
        bytes arbitratorExtraData;
        LightGeneralizedTCR.Party currentRuling;
        bool[3] hasPaid;
        uint256 feeRewards;
        uint256 submissionTime;
        uint256[3] amountPaid;
        IArbitrator.DisputeStatus disputeStatus;
        uint256 numberOfRequests;
    }

    struct ArbitrableData {
        address governor;
        address arbitrator;
        bytes arbitratorExtraData;
        uint256 submissionBaseDeposit;
        uint256 removalBaseDeposit;
        uint256 submissionChallengeBaseDeposit;
        uint256 removalChallengeBaseDeposit;
        uint256 challengePeriodDuration;
        uint256 metaEvidenceUpdates;
        uint256 winnerStakeMultiplier;
        uint256 loserStakeMultiplier;
        uint256 sharedStakeMultiplier;
        uint256 MULTIPLIER_DIVISOR;
        uint256 arbitrationCost;
    }

    /** @dev Fetch arbitrable TCR data in a single call.
     *  @param _address The address of the LightGeneralized TCR to query.
     *  @return The latest data on an arbitrable TCR contract.
     */
    function fetchArbitrable(address _address) external view returns (ArbitrableData memory result) {
        LightGeneralizedTCR tcr = LightGeneralizedTCR(_address);
        result.governor = tcr.governor();
        result.arbitrator = address(tcr.arbitrator());
        result.arbitratorExtraData = tcr.arbitratorExtraData();
        result.submissionBaseDeposit = tcr.submissionBaseDeposit();
        result.removalBaseDeposit = tcr.removalBaseDeposit();
        result.submissionChallengeBaseDeposit = tcr.submissionChallengeBaseDeposit();
        result.removalChallengeBaseDeposit = tcr.removalChallengeBaseDeposit();
        result.challengePeriodDuration = tcr.challengePeriodDuration();
        result.metaEvidenceUpdates = tcr.metaEvidenceUpdates();
        result.winnerStakeMultiplier = tcr.winnerStakeMultiplier();
        result.loserStakeMultiplier = tcr.loserStakeMultiplier();
        result.sharedStakeMultiplier = tcr.sharedStakeMultiplier();
        result.MULTIPLIER_DIVISOR = tcr.MULTIPLIER_DIVISOR();
        result.arbitrationCost = IArbitrator(result.arbitrator).arbitrationCost(result.arbitratorExtraData);
    }

    /** @dev Fetch the latest data on an item in a single call.
     *  @param _address The address of the LightGeneralized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The item data.
     */
    function getItem(address _address, bytes32 _itemID) public view returns (QueryResult memory result) {
        RoundData memory round = getLatestRoundRequestData(_address, _itemID);
        result = QueryResult({
            ID: _itemID,
            status: round.request.item.status,
            disputed: round.request.disputed,
            resolved: round.request.resolved,
            disputeID: round.request.disputeID,
            appealCost: 0,
            appealed: round.appealed,
            appealStart: 0,
            appealEnd: 0,
            ruling: round.request.ruling,
            requester: round.request.parties[uint256(LightGeneralizedTCR.Party.Requester)],
            challenger: round.request.parties[uint256(LightGeneralizedTCR.Party.Challenger)],
            arbitrator: address(round.request.arbitrator),
            arbitratorExtraData: round.request.arbitratorExtraData,
            currentRuling: LightGeneralizedTCR.Party.None,
            hasPaid: round.hasPaid,
            feeRewards: round.feeRewards,
            submissionTime: round.request.submissionTime,
            amountPaid: round.amountPaid,
            disputeStatus: IArbitrator.DisputeStatus.Waiting,
            numberOfRequests: round.request.item.numberOfRequests
        });
        if (
            round.request.disputed &&
            round.request.arbitrator.disputeStatus(result.disputeID) == IArbitrator.DisputeStatus.Appealable
        ) {
            result.currentRuling = LightGeneralizedTCR.Party(round.request.arbitrator.currentRuling(result.disputeID));
            result.disputeStatus = round.request.arbitrator.disputeStatus(result.disputeID);
            (result.appealStart, result.appealEnd) = round.request.arbitrator.appealPeriod(result.disputeID);
            result.appealCost = round.request.arbitrator.appealCost(result.disputeID, result.arbitratorExtraData);
        }
    }

    struct ItemRequest {
        bool disputed;
        uint256 disputeID;
        uint256 submissionTime;
        bool resolved;
        address requester;
        address challenger;
        address arbitrator;
        bytes arbitratorExtraData;
        uint256 metaEvidenceID;
    }

    /** @dev Fetch all requests for an item.
     *  @param _address The address of the LightGeneralized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The items requests.
     */
    function getItemRequests(address _address, bytes32 _itemID) external view returns (ItemRequest[] memory requests) {
        LightGeneralizedTCR gtcr = LightGeneralizedTCR(_address);
        ItemData memory itemData = getItemData(_address, _itemID);
        requests = new ItemRequest[](itemData.numberOfRequests);
        for (uint256 i = 0; i < itemData.numberOfRequests; i++) {
            (
                bool disputed,
                uint256 disputeID,
                uint256 submissionTime,
                bool resolved,
                address payable[3] memory parties,
                ,
                ,
                IArbitrator arbitrator,
                bytes memory arbitratorExtraData,
                uint256 metaEvidenceID
            ) = gtcr.getRequestInfo(_itemID, i);

            // Sort requests by newest first.
            requests[itemData.numberOfRequests - i - 1] = ItemRequest({
                disputed: disputed,
                disputeID: disputeID,
                submissionTime: submissionTime,
                resolved: resolved,
                requester: parties[uint256(LightGeneralizedTCR.Party.Requester)],
                challenger: parties[uint256(LightGeneralizedTCR.Party.Challenger)],
                arbitrator: address(arbitrator),
                arbitratorExtraData: arbitratorExtraData,
                metaEvidenceID: metaEvidenceID
            });
        }
    }

    /** @dev Return the withdrawable rewards for a contributor.
     *  @param _address The address of the LightGeneralized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @param _contributor The address of the contributor.
     *  @return The amount withdrawable per round per request.
     */
    function availableRewards(
        address _address,
        bytes32 _itemID,
        address _contributor
    ) external view returns (uint256 rewards) {
        LightGeneralizedTCR gtcr = LightGeneralizedTCR(_address);

        // Using arrays to avoid stack limit.
        uint256[2] memory requestRoundCount = [uint256(0), uint256(0)];
        uint256[2] memory indexes = [uint256(0), uint256(0)]; // Request index and round index.

        (, requestRoundCount[0], ) = gtcr.getItemInfo(_itemID);
        for (indexes[0]; indexes[0] < requestRoundCount[0]; indexes[0]++) {
            LightGeneralizedTCR.Party ruling;
            bool resolved;
            (, , , resolved, , requestRoundCount[1], ruling, , , ) = gtcr.getRequestInfo(_itemID, indexes[0]);
            if (!resolved) continue;
            for (indexes[1]; indexes[1] < requestRoundCount[1]; indexes[1]++) {
                (, uint256[3] memory amountPaid, bool[3] memory hasPaid, uint256 feeRewards) = gtcr.getRoundInfo(
                    _itemID,
                    indexes[0],
                    indexes[1]
                );

                uint256[3] memory roundContributions = gtcr.getContributions(
                    _itemID,
                    indexes[0],
                    indexes[1],
                    _contributor
                );
                if (
                    !hasPaid[uint256(LightGeneralizedTCR.Party.Requester)] ||
                    !hasPaid[uint256(LightGeneralizedTCR.Party.Challenger)]
                ) {
                    // Amount reimbursable if not enough fees were raised to appeal the ruling.
                    rewards +=
                        roundContributions[uint256(LightGeneralizedTCR.Party.Requester)] +
                        roundContributions[uint256(LightGeneralizedTCR.Party.Challenger)];
                } else if (ruling == LightGeneralizedTCR.Party.None) {
                    // Reimbursable fees proportional if there aren't a winner and loser.
                    rewards += amountPaid[uint256(LightGeneralizedTCR.Party.Requester)] > 0
                        ? (roundContributions[uint256(LightGeneralizedTCR.Party.Requester)] * feeRewards) /
                            (amountPaid[uint256(LightGeneralizedTCR.Party.Challenger)] +
                                amountPaid[uint256(LightGeneralizedTCR.Party.Requester)])
                        : 0;
                    rewards += amountPaid[uint256(LightGeneralizedTCR.Party.Challenger)] > 0
                        ? (roundContributions[uint256(LightGeneralizedTCR.Party.Challenger)] * feeRewards) /
                            (amountPaid[uint256(LightGeneralizedTCR.Party.Challenger)] +
                                amountPaid[uint256(LightGeneralizedTCR.Party.Requester)])
                        : 0;
                } else {
                    // Contributors to the winner take the rewards.
                    rewards += amountPaid[uint256(ruling)] > 0
                        ? (roundContributions[uint256(ruling)] * feeRewards) / amountPaid[uint256(ruling)]
                        : 0;
                }
            }
            indexes[1] = 0;
        }
    }

    // Functions and structs below used mainly to avoid stack limit.
    struct ItemData {
        LightGeneralizedTCR.Status status;
        uint256 numberOfRequests;
    }

    struct RequestData {
        ItemData item;
        bool disputed;
        uint256 disputeID;
        uint256 submissionTime;
        bool resolved;
        address payable[3] parties;
        uint256 numberOfRounds;
        LightGeneralizedTCR.Party ruling;
        IArbitrator arbitrator;
        bytes arbitratorExtraData;
    }

    struct RoundData {
        RequestData request;
        bool appealed;
        uint256[3] amountPaid;
        bool[3] hasPaid;
        uint256 feeRewards;
    }

    /** @dev Fetch data of the an item and return a struct.
     *  @param _address The address of the LightGeneralized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The round data.
     */
    function getItemData(address _address, bytes32 _itemID) public view returns (ItemData memory item) {
        LightGeneralizedTCR gtcr = LightGeneralizedTCR(_address);
        (LightGeneralizedTCR.Status status, uint256 numberOfRequests, ) = gtcr.getItemInfo(_itemID);
        item = ItemData(status, numberOfRequests);
    }

    /** @dev Fetch the latest request of item.
     *  @param _address The address of the LightGeneralized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The round data.
     */
    function getLatestRequestData(address _address, bytes32 _itemID) public view returns (RequestData memory request) {
        LightGeneralizedTCR gtcr = LightGeneralizedTCR(_address);
        ItemData memory item = getItemData(_address, _itemID);
        (
            bool disputed,
            uint256 disputeID,
            uint256 submissionTime,
            bool resolved,
            address payable[3] memory parties,
            uint256 numberOfRounds,
            LightGeneralizedTCR.Party ruling,
            IArbitrator arbitrator,
            bytes memory arbitratorExtraData,

        ) = gtcr.getRequestInfo(_itemID, item.numberOfRequests - 1);
        request = RequestData(
            item,
            disputed,
            disputeID,
            submissionTime,
            resolved,
            parties,
            numberOfRounds,
            ruling,
            arbitrator,
            arbitratorExtraData
        );
    }

    /** @dev Fetch the latest round of the latest request of an item.
     *  @param _address The address of the LightGeneralized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The round data.
     */
    function getLatestRoundRequestData(address _address, bytes32 _itemID) public view returns (RoundData memory round) {
        LightGeneralizedTCR gtcr = LightGeneralizedTCR(_address);
        (, , uint256 sumDeposit) = gtcr.getItemInfo(_itemID);
        RequestData memory request = getLatestRequestData(_address, _itemID);

        if (request.disputed) {
            (bool appealed, uint256[3] memory amountPaid, bool[3] memory hasPaid, uint256 feeRewards) = gtcr
                .getRoundInfo(_itemID, request.item.numberOfRequests - 1, request.numberOfRounds - 1);

            round = RoundData(request, appealed, amountPaid, hasPaid, feeRewards);
        } else {
            round = RoundData(request, false, [0, sumDeposit, 0], [false, true, false], sumDeposit);
        }
    }
}
