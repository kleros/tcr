/**
 *  @authors: [@mtsalenc]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.5.11;
pragma experimental ABIEncoderV2;

import { GeneralizedTCR } from "../GeneralizedTCR.sol";
import { Arbitrator } from "@kleros/erc-792/contracts/Arbitrator.sol";
import { BytesLib } from "solidity-bytes-utils/contracts/BytesLib.sol";
import { RLPReader } from "solidity-rlp/contracts/RLPReader.sol";


contract GeneralizedTCRView {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;
    using BytesLib for bytes;

    struct QueryResult {
        bytes32 ID;
        bytes data;
        GeneralizedTCR.Status status;
        bool disputed;
        bool resolved;
        uint disputeID;
        uint appealCost;
        bool appealed;
        uint appealStart;
        uint appealEnd;
        GeneralizedTCR.Party ruling;
        address requester;
        address challenger;
        address arbitrator;
        bytes arbitratorExtraData;
        GeneralizedTCR.Party currentRuling;
        bool[3] hasPaid;
        uint feeRewards;
        uint submissionTime;
        uint[3] paidFees;
        Arbitrator.DisputeStatus disputeStatus;
    }

    struct ArbitrableData {
        address governor;
        address arbitrator;
        bytes arbitratorExtraData;
        uint requesterBaseDeposit;
        uint challengerBaseDeposit;
        uint challengePeriodDuration;
        uint metaEvidenceUpdates;
        uint winnerStakeMultiplier;
        uint loserStakeMultiplier;
        uint sharedStakeMultiplier;
        uint MULTIPLIER_DIVISOR;
    }

    function fetchArbitrable(address _address) external view returns (ArbitrableData memory result) {
        GeneralizedTCR tcr = GeneralizedTCR(_address);
        result.governor = tcr.governor();
        result.arbitrator = address(tcr.arbitrator());
        result.arbitratorExtraData = tcr.arbitratorExtraData();
        result.requesterBaseDeposit = tcr.requesterBaseDeposit();
        result.challengerBaseDeposit = tcr.challengerBaseDeposit();
        result.challengePeriodDuration = tcr.challengePeriodDuration();
        result.metaEvidenceUpdates = tcr.metaEvidenceUpdates();
        result.winnerStakeMultiplier = tcr.winnerStakeMultiplier();
        result.loserStakeMultiplier = tcr.loserStakeMultiplier();
        result.sharedStakeMultiplier = tcr.sharedStakeMultiplier();
        result.MULTIPLIER_DIVISOR = tcr.MULTIPLIER_DIVISOR();
    }

    function getItem(address _address, bytes32 _itemID) public view returns (QueryResult memory result) {
        RoundData memory round = getRoundData(_address, _itemID);
        result = QueryResult({
            ID: _itemID,
            data: round.request.item.data,
            status: round.request.item.status,
            disputed: round.request.disputed,
            resolved: round.request.resolved,
            disputeID: round.request.disputeID,
            appealCost: 0,
            appealed: round.appealed,
            appealStart: 0,
            appealEnd: 0,
            ruling: round.request.ruling,
            requester: round.request.parties[uint(GeneralizedTCR.Party.Requester)],
            challenger: round.request.parties[uint(GeneralizedTCR.Party.Challenger)],
            arbitrator: address(round.request.arbitrator),
            arbitratorExtraData: round.request.arbitratorExtraData,
            currentRuling: GeneralizedTCR.Party.None,
            hasPaid: round.hasPaid,
            feeRewards: round.feeRewards,
            submissionTime: round.request.submissionTime,
            paidFees: round.paidFees,
            disputeStatus: Arbitrator.DisputeStatus.Waiting
        });
        if (round.request.disputed && round.request.arbitrator.disputeStatus(result.disputeID) == Arbitrator.DisputeStatus.Appealable) {
            result.currentRuling = GeneralizedTCR.Party(round.request.arbitrator.currentRuling(result.disputeID));
            result.disputeStatus = round.request.arbitrator.disputeStatus(result.disputeID);
            (result.appealStart, result.appealEnd) = round.request.arbitrator.appealPeriod(result.disputeID);
            result.appealCost = round.request.arbitrator.appealCost(result.disputeID, result.arbitratorExtraData);
        }
    }

    /** @dev Find an item by matching column values. TODO: Update this to iterate a limited number of items per call.
     *  - Example:
     *  Item [18, 'PNK', 'Pinakion', '0xca35b7d915458ef540ade6068dfe2f44e8fa733c']
     *  RLP encoded: 0xe383504e4b128850696e616b696f6e94ca35b7d915458ef540ade6068dfe2f44e8fa733c
     *  Input for remix: ["0xe3","0x83","0x50","0x4e","0x4b","0x12","0x88","0x50","0x69","0x6e","0x61","0x6b","0x69","0x6f","0x6e","0x94","0xca","0x35","0xb7","0xd9","0x15","0x45","0x8e","0xf5","0x40","0xad","0xe6","0x06","0x8d","0xfe","0x2f","0x44","0xe8","0xfa","0x73","0x3c"]
     *  @param _address The address of the GTCR to query.
     *  @param _rlpEncodedMatch The RLP encoded item to match against the items on the list.
     *  @param _cursor The index from where to start looking for matches.
     *  @param _returnCount The size of the array to return with matching values.
     *  @param _count The number of items to iterate while searching.
     *  @return An array with items that match the query.
     */
    function findItem(
        address _address,
        bytes memory _rlpEncodedMatch,
        uint _cursor,
        uint _returnCount,
        uint _count
    )
        public
        view
        returns (bytes[] memory)
    {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        RLPReader.RLPItem[] memory matchItem = _rlpEncodedMatch.toRlpItem().toList();
        bytes[] memory results = new bytes[](_count);
        uint itemsFound;

        for(uint i = _cursor; i < (_count == 0 ? gtcr.itemCount() : _count); i++) { // Iterate over every item in storage.
            (bytes memory itemBytes,,) = gtcr.getItemInfo(gtcr.itemList(i));
            RLPReader.RLPItem[] memory item = itemBytes.toRlpItem().toList();
            for (uint j = 0; j < matchItem.length; j++) { // Iterate over every column.
                if (item[j].toBytes().equal(matchItem[j].toBytes())) {
                    results[itemsFound] = itemBytes;
                    itemsFound++;
                    break;
                }
            }
        }

        return results;
    }

    function findIndexForPage(
        address _address,
        uint[4] calldata _targets, // targets[0] == _page, targest[1] == _itemsPerPage, targets[2] == _count, targets[3] = _cursor
        bool[8] calldata _filter,
        bool _oldestFirst,
        address _party
    )
        external
        view
        returns (uint index, bool hasMore)
    {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        uint index = 0;
        uint count = _targets[2];
        uint currPage = 1;
        uint itemsMatched = 0;

        if (gtcr.itemCount() == 0) return (0, false);

        // Start iterating from the end if the _cursorIndex is 0 and _oldestFirst is false.
        // Keep the cursor as is otherwise.
        uint i = _oldestFirst ? _targets[3] : _targets[3] == 0 ? gtcr.itemCount() - 1 : _targets[3];

        for(; _oldestFirst ? i < gtcr.itemCount() && count > 0 : i >= 0 && count > 0; ) {
            bytes32 itemID = gtcr.itemList(i);
            QueryResult memory item = getItem(_address, itemID);
            hasMore = true;
            if (
                (_filter[0] && item.status == GeneralizedTCR.Status.Absent) ||
                (_filter[1] && item.status == GeneralizedTCR.Status.Registered) ||
                (_filter[2] && item.status == GeneralizedTCR.Status.RegistrationRequested && !item.disputed) ||
                (_filter[3] && item.status == GeneralizedTCR.Status.ClearingRequested && !item.disputed) ||
                (_filter[4] && item.status == GeneralizedTCR.Status.RegistrationRequested && item.disputed) ||
                (_filter[5] && item.status == GeneralizedTCR.Status.ClearingRequested && item.disputed) ||
                (_filter[6] && item.requester == _party) ||
                (_filter[7] && item.challenger == _party)
            ) {
                itemsMatched++;
                if (itemsMatched % _targets[1] == 0) {
                    currPage++;
                    if (currPage == _targets[0]) return (_oldestFirst ? i + 1 : i - 1, hasMore);
                }
            }
            count--;
            if (count == 0 || (i == 0 && !_oldestFirst) || (i == gtcr.itemCount() - 1 && _oldestFirst)) {
                hasMore = _oldestFirst ? i < gtcr.itemCount() - 1 : i > 0;
                break;
            }
            // Move cursor to the left or right depending on _oldestFirst.
            // Also prevents underflow if the cursor is at the first item.
            i = _oldestFirst ? i + 1 : i == 0 ? 0 : i - 1;
        }
    }

    /** @dev Return the values of the items the query finds. This function is O(n), where n is the number of items. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _address The address of the GTCR to query.
     *  @param _cursorIndex The index of the items from which to start iterating. To start from either the oldest or newest item.
     *  @param _count The number of items to return.
     *  @param _filter The filter to use. Each element of the array in sequence means:
     *  - Include absent items in result.
     *  - Include registered items in result.
     *  - Include items with registration requests that are not disputed in result.
     *  - Include items with clearing requests that are not disputed in result.
     *  - Include disputed items with registration requests in result.
     *  - Include disputed items with clearing requests in result.
     *  - Include items submitted by _party.
     *  - Include items challenged by _party.
     *  @param _oldestFirst Whether to sort from oldest to the newest item.
     *  @param _party The address to use if checking for items submitted or challenged by a specific party.
     *  @return The data of the items found and whether there are more items for the current filter and sort.
     */
    function queryItems(
        address _address,
        uint _cursorIndex,
        uint _count,
        bool[8] calldata _filter,
        bool _oldestFirst,
        address _party
    )
        external
        view
        returns (QueryResult[] memory results, bool hasMore)
    {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        results = new QueryResult[](_count);
        uint index = 0;
        uint count = _count;

        if (gtcr.itemCount() == 0) return (results, false);

        // Start iterating from the end if the _cursorIndex is 0 and _oldestFirst is false.
        // Keep the cursor as is otherwise.
        uint i = _oldestFirst ? _cursorIndex : _cursorIndex == 0 ? gtcr.itemCount() - 1 : _cursorIndex;

        for(; _oldestFirst ? i < gtcr.itemCount() && count > 0 : i >= 0 && count > 0; ) {
            bytes32 itemID = gtcr.itemList(i);
            QueryResult memory item = getItem(_address, itemID);
            hasMore = true;
            if (
                (_filter[0] && item.status == GeneralizedTCR.Status.Absent) ||
                (_filter[1] && item.status == GeneralizedTCR.Status.Registered) ||
                (_filter[2] && item.status == GeneralizedTCR.Status.RegistrationRequested && !item.disputed) ||
                (_filter[3] && item.status == GeneralizedTCR.Status.ClearingRequested && !item.disputed) ||
                (_filter[4] && item.status == GeneralizedTCR.Status.RegistrationRequested && item.disputed) ||
                (_filter[5] && item.status == GeneralizedTCR.Status.ClearingRequested && item.disputed) ||
                (_filter[6] && item.requester == _party) ||
                (_filter[7] && item.challenger == _party)
            ) {
                results[index] = item;
                index++;
            }
            count--;
            if (count == 0 || (i == 0 && !_oldestFirst) || (i == gtcr.itemCount() - 1 && _oldestFirst)) {
                hasMore = _oldestFirst ? i < gtcr.itemCount() - 1 : i > 0;
                break;
            }
            // Move cursor to the left or right depending on _oldestFirst.
            // Also prevents underflow if the cursor is at the first item.
            i = _oldestFirst ? i + 1 : i == 0 ? 0 : i - 1;
        }
    }

    // Internal
    // The structs and internal methods below are used to get around solidity stack limit.

    struct ItemData {
        bytes data;
        GeneralizedTCR.Status status;
        uint numberOfRequests;
    }

    struct RequestData {
        ItemData item;
        bool disputed;
        uint disputeID;
        uint submissionTime;
        bool resolved;
        address payable[3] parties;
        uint numberOfRounds;
        GeneralizedTCR.Party ruling;
        Arbitrator arbitrator;
        bytes arbitratorExtraData;
    }

    struct RoundData {
        RequestData request;
        bool appealed;
        uint[3] paidFees;
        bool[3] hasPaid;
        uint feeRewards;
    }

    function getItemData(address _address, bytes32 _itemID) internal view returns(ItemData memory item) {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        (
            bytes memory data,
            GeneralizedTCR.Status status,
            uint numberOfRequests
        ) = gtcr.getItemInfo(_itemID);
        item = ItemData(data, status, numberOfRequests);
    }

    function getRequestData(address _address, bytes32 _itemID) internal view returns (RequestData memory request)  {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        ItemData memory item = getItemData(_address, _itemID);
        (
            bool disputed,
            uint disputeID,
            uint submissionTime,
            bool resolved,
            address payable[3] memory parties,
            uint numberOfRounds,
            GeneralizedTCR.Party ruling,
            Arbitrator arbitrator,
            bytes memory arbitratorExtraData
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

    function getRoundData(address _address, bytes32 _itemID) internal view returns (RoundData memory round)  {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        RequestData memory request = getRequestData(_address, _itemID);
        (
            bool appealed,
            uint[3] memory paidFees,
            bool[3] memory hasPaid,
            uint feeRewards
        ) = gtcr.getRoundInfo(_itemID, request.item.numberOfRequests - 1, request.numberOfRounds - 1);
        round = RoundData(
            request,
            appealed,
            paidFees,
            hasPaid,
            feeRewards
        );
    }

}
