/**
 *  @authors: [@mtsalenc]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.5.16;

import {LightGeneralizedTCR} from "./LightGeneralizedTCR.sol";

/**
 *  @title LightBatchWithdraw
 *  Withdraw fees and rewards from contributions to disputes rounds in batches.
 */
contract LightBatchWithdraw {
    /** @dev Withdraws rewards and reimbursements of multiple rounds at once. This function is O(n) where n is the number of rounds. This could exceed gas limits, therefore this function should be used only as a utility and not be relied upon by other contracts.
     *  @param _address The address of the LightGTCR.
     *  @param _contributor The address that made contributions to the request.
     *  @param _itemID The ID of the item with funds to be withdrawn.
     *  @param _request The request from which to withdraw contributions.
     *  @param _cursor The round from where to start withdrawing.
     *  @param _count The number of rounds to iterate. If set to 0 or a value larger than the number of rounds, iterates until the last round.
     */
    function batchRoundWithdraw(
        address _address,
        address payable _contributor,
        bytes32 _itemID,
        uint256 _request,
        uint256 _cursor,
        uint256 _count
    ) public {
        LightGeneralizedTCR gtcr = LightGeneralizedTCR(_address);
        (, , , , , uint256 numberOfRounds, , , , ) = gtcr.getRequestInfo(_itemID, _request);
        for (uint256 i = _cursor; i < numberOfRounds && (_count == 0 || i < _count); i++)
            gtcr.withdrawFeesAndRewards(_contributor, _itemID, _request, i);
    }

    /** @dev Withdraws rewards and reimbursements of multiple requests at once. This function is O(n*m) where n is the number of requests and m is the number of rounds to withdraw per request. This could exceed gas limits, therefore this function should be used only as a utility and not be relied upon by other contracts.
     *  @param _address The address of the GTCR.
     *  @param _contributor The address that made contributions to the request.
     *  @param _itemID The ID of the item with funds to be withdrawn.
     *  @param _cursor The request from which to start withdrawing.
     *  @param _count The number of requests to iterate. If set to 0 or a value larger than the number of request, iterates until the last request.
     *  @param _roundCursor The round of each request from where to start withdrawing.
     *  @param _roundCount The number of rounds to iterate on each request. If set to 0 or a value larger than the number of rounds a request has, iteration for that request will stop at the last round.
     */
    function batchRequestWithdraw(
        address _address,
        address payable _contributor,
        bytes32 _itemID,
        uint256 _cursor,
        uint256 _count,
        uint256 _roundCursor,
        uint256 _roundCount
    ) external {
        LightGeneralizedTCR gtcr = LightGeneralizedTCR(_address);
        (, uint256 numberOfRequests, ) = gtcr.getItemInfo(_itemID);
        for (uint256 i = _cursor; i < numberOfRequests && (_count == 0 || i < _count); i++)
            batchRoundWithdraw(_address, _contributor, _itemID, i, _roundCursor, _roundCount);
    }
}
