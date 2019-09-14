/**
 *  @authors: [@mtsalenc]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.5.11;
pragma experimental ABIEncoderV2;

import { GeneralizedTCR, Arbitrator } from "../GeneralizedTCR.sol";
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
        uint numberOfRequests;
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

    /** @dev Fetch arbitrable TCR data in a single call.
     *  @param _address The address of the Generalized TCR to query.
     *  @return The latest data on an arbitrable TCR contract.
     */
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

    /** @dev Fetch the latest data on an item in a single call.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The item data.
     */
    function getItem(address _address, bytes32 _itemID) public view returns (QueryResult memory result) {
        RoundData memory round = getLatestRoundRequestData(_address, _itemID);
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
            disputeStatus: Arbitrator.DisputeStatus.Waiting,
            numberOfRequests: round.request.item.numberOfRequests
        });
        if (round.request.disputed && round.request.arbitrator.disputeStatus(result.disputeID) == Arbitrator.DisputeStatus.Appealable) {
            result.currentRuling = GeneralizedTCR.Party(round.request.arbitrator.currentRuling(result.disputeID));
            result.disputeStatus = round.request.arbitrator.disputeStatus(result.disputeID);
            (result.appealStart, result.appealEnd) = round.request.arbitrator.appealPeriod(result.disputeID);
            result.appealCost = round.request.arbitrator.appealCost(result.disputeID, result.arbitratorExtraData);
        }
    }

    /** @dev Fetch all requests for an item.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The items requests.
     */
    function getItemRequests(address _address, bytes32 _itemID) external view returns (SimpleRequest[] memory requests) {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        ItemData memory itemData = getItemData(_address, _itemID);
        requests = new SimpleRequest[](itemData.numberOfRequests);

        for (uint i = 0; i < itemData.numberOfRequests; i) {
            // Sort requests by newest first.
            requests[itemData.numberOfRequests - i - 1] = getSimpleRequest(_address, _itemID, i);
        }
    }

    /** @dev Find an item by matching column values. TODO: Update this to iterate a limited number of items per call.
     *  - Example:
     *  Item [18, 'PNK', 'Pinakion', '0xca35b7d915458ef540ade6068dfe2f44e8fa733c']
     *  RLP encoded: 0xe383504e4b128850696e616b696f6e94ca35b7d915458ef540ade6068dfe2f44e8fa733c
     *  Input for remix: ["0xe3","0x83","0x50","0x4e","0x4b","0x12","0x88","0x50","0x69","0x6e","0x61","0x6b","0x69","0x6f","0x6e","0x94","0xca","0x35","0xb7","0xd9","0x15","0x45","0x8e","0xf5","0x40","0xad","0xe6","0x06","0x8d","0xfe","0x2f","0x44","0xe8","0xfa","0x73","0x3c"]
     *  @param _address The address of the Generalized TCR to query.
     *  @param _rlpEncodedMatch The RLP encoded item to match against the items on the list.
     *  @param _cursor The index from where to start looking for matches.
     *  @param _count The number of items to iterate while searching.
     *  @return An array with items that match the query.
     */
    function findItem(
        address _address,
        bytes memory _rlpEncodedMatch,
        uint _cursor,
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

    /** @dev Find the starting position the first item of a page of items for a given filter.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _targets The targets to use for the query. Each element of the array in sequence means:
     *  - The page to search;
     *  - The number of items per page;
     *  - The number of items to iterate when searching;
     *  - The position from where to start iterating.
     *  @param _filter The filter to use. Each element of the array in sequence means:
     *  - Include absent items in result;
     *  - Include registered items in result;
     *  - Include items with registration requests that are not disputed in result;
     *  - Include items with clearing requests that are not disputed in result;
     *  - Include disputed items with registration requests in result;
     *  - Include disputed items with clearing requests in result;
     *  - Include items with a request by _party;
     *  - Include items challenged by _party.
     *  - Whether to sort from oldest to the newest item.
     *  @param _party The address to use if checking for items with a request or challenged by a specific party.
     *  @return The query result:
     *  - Index of the page, if it was found;
     *  - Whether there are more items to iterate;
     *  - If the index of the page we are searching was found.
     */
    function findIndexForPage(
        address _address,
        uint[4] calldata _targets,
        bool[9] calldata _filter,
        address _party
    )
        external
        view
        returns (uint index, bool hasMore, bool indexFound)
    {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        uint count = _targets[2];
        uint currPage = 1;
        uint itemsMatched = 0;

        if (gtcr.itemCount() == 0) return (0, false, true);

        // Start iterating from the end if the _cursorIndex is 0 and _oldestFirst is false.
        // Keep the cursor as is otherwise.
        uint i = _filter[8] ? _targets[3] : _targets[3] == 0 ? gtcr.itemCount() - 1 : _targets[3];

        for(; _filter[8] ? i < gtcr.itemCount() && count > 0 : i >= 0 && count > 0; ) {
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
                    if (currPage == _targets[0]){
                        if ((i == 0 && !_filter[8]) || (i == gtcr.itemCount() - 1 && _filter[8])) hasMore = false;
                        return (_filter[8] ? i + 1 : i - 1, hasMore, true);
                    }
                }
            }
            count--;
            if (count == 0 || (i == 0 && !_filter[8]) || (i == gtcr.itemCount() - 1 && _filter[8])) {
                hasMore = _filter[8] ? i < gtcr.itemCount() - 1 : i > 0;
                break;
            }
            // Move cursor to the left or right depending on _oldestFirst.
            // Also prevents underflow if the cursor is at the first item.
            i = _filter[8] ? i + 1 : i == 0 ? 0 : i - 1;
        }

        return (i, hasMore, false);
    }

    /** @dev Count the number of items for a given filter.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _cursorIndex The index of the items from which to start iterating. To start from either the oldest or newest item.
     *  @param _count The number of items to return.
     *  @param _filter The filter to use. Each element of the array in sequence means:
     *  - Include absent items in result;
     *  - Include registered items in result;
     *  - Include items with registration requests that are not disputed in result;
     *  - Include items with clearing requests that are not disputed in result;
     *  - Include disputed items with registration requests in result;
     *  - Include disputed items with clearing requests in result;
     *  - Include items with a request by _party;
     *  - Include items challenged by _party.
     *  @param _party The address to use if checking for items with a request or challenged by a specific party.
     *  @return The query result:
     *  - The number of items found for the filter;
     *  - Whether there are more items to iterate;
     *  - The index of the last item of the query. Useful as a starting point for the next query if counting in multiple steps.
     */
    function countWithFilter(address _address, uint _cursorIndex, uint _count, bool[8] calldata _filter, address _party)
        external
        view
        returns (uint count, bool hasMore, uint)
    {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        if (gtcr.itemCount() == 0) return (0, false, 0);

        uint iterations = 0;
        for (uint i = _cursorIndex; iterations <= _count && i < gtcr.itemCount(); i++) {
            bytes32 itemID = gtcr.itemList(i);
            QueryResult memory item = getItem(_address, itemID);
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
                count++;
                if (iterations >= _count) {
                    return (count, true, i);
                }
            }
            iterations++;
        }
    }

    /** @dev Return the values of the items the query finds. This function is O(n), where n is the number of items. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _address The address of the GTCR to query.
     *  @param _cursorIndex The index of the items from which to start iterating. To start from either the oldest or newest item.
     *  @param _count The number of items to return.
     *  @param _filter The filter to use. Each element of the array in sequence means:
     *  - Include absent items in result;
     *  - Include registered items in result;
     *  - Include items with registration requests that are not disputed in result;
     *  - Include items with clearing requests that are not disputed in result;
     *  - Include disputed items with registration requests in result;
     *  - Include disputed items with clearing requests in result;
     *  - Include items with a request by _party;
     *  - Include items challenged by _party.
     *  @param _oldestFirst Whether to sort from oldest to the newest item.
     *  @param _party The address to use if checking for items with a request or challenged by a specific party.
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


    // Functions and structs below used mainly to avoid stack limit.
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
        GeneralizedTCR.Status requestType;
    }

    struct SimpleRequest {
        uint disputeID;
        uint submissionTime;
        address payable[3] parties;
        Arbitrator arbitrator;
        bytes arbitratorExtraData;
        GeneralizedTCR.Status requestType;
    }

    struct RoundData {
        RequestData request;
        bool appealed;
        uint[3] paidFees;
        bool[3] hasPaid;
        uint feeRewards;
    }

    /** @dev Fetch data of the an item and return a struct.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The round data.
     */
    function getItemData(address _address, bytes32 _itemID) public view returns(ItemData memory item) {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        (
            bytes memory data,
            GeneralizedTCR.Status status,
            uint numberOfRequests
        ) = gtcr.getItemInfo(_itemID);
        item = ItemData(data, status, numberOfRequests);
    }

    /** @dev Fetch the a request of an item.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The round data.
     */
    function getSimpleRequest(address _address, bytes32 _itemID, uint _request) public view returns (SimpleRequest memory request)  {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);

        // Using arrays to get around stack limit.
        // targets[0]: disputeID
        // targets[1]: submissionTime
        uint[] memory targets = new uint[](2);
        address payable[3] memory parties;
        GeneralizedTCR.Party ruling;
        Arbitrator arbitrator;
        bytes memory arbitratorExtraData;
        GeneralizedTCR.Status requestType;
        (
            ,
            targets[0],
            targets[1],
            ,
            parties,
            ,
            ,
            arbitrator,
            arbitratorExtraData,
            requestType
        ) = gtcr.getRequestInfo(_itemID, _request);

        request = SimpleRequest({
            disputeID: targets[0],
            submissionTime: targets[1],
            parties: parties,
            arbitrator: arbitrator,
            arbitratorExtraData: arbitratorExtraData,
            requestType: requestType
        });
    }

    /** @dev Fetch the latest request of item.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The round data.
     */
    function getLatestRequestData(address _address, bytes32 _itemID) public view returns (RequestData memory request)  {
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
            bytes memory arbitratorExtraData,
            GeneralizedTCR.Status requestType
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
            arbitratorExtraData,
            requestType
        );
    }

    /** @dev Fetch the latest round of the latest request of an item.
     *  @param _address The address of the Generalized TCR to query.
     *  @param _itemID The ID of the item to query.
     *  @return The round data.
     */
    function getLatestRoundRequestData(address _address, bytes32 _itemID) public view returns (RoundData memory round)  {
        GeneralizedTCR gtcr = GeneralizedTCR(_address);
        RequestData memory request = getLatestRequestData(_address, _itemID);
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