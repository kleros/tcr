/**
 *  @authors: [@epiqueras, @unknownunknown1, @mtsalenc]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.5.11;

import "./AppealableArbitrator.sol";

/**
 *  @title EnhancedAppealableArbitrator
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev Implementation of `AppealableArbitrator` that supports `appealPeriod`.
 */
contract EnhancedAppealableArbitrator is AppealableArbitrator {
    /* Constructor */

    /* solium-disable no-empty-blocks */
    /** @dev Constructs the `EnhancedAppealableArbitrator` contract.
     *  @param _arbitrationPrice The amount to be paid for arbitration.
     *  @param _arbitrator The back up arbitrator.
     *  @param _arbitratorExtraData Not used by this contract.
     *  @param _timeOut The time out for the appeal period.
     */
    constructor(
        uint256 _arbitrationPrice,
        IArbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        uint256 _timeOut
    ) public AppealableArbitrator(_arbitrationPrice, _arbitrator, _arbitratorExtraData, _timeOut) {}

    /* solium-enable no-empty-blocks */

    /* Public Views */

    /** @dev Compute the start and end of the dispute's current or next appeal period, if possible.
     *  @param _disputeID ID of the dispute.
     *  @return The start and end of the period.
     */
    function appealPeriod(uint256 _disputeID) public view returns (uint256 start, uint256 end) {
        if (appealDisputes[_disputeID].arbitrator != IArbitrator(address(0)))
            (start, end) = appealDisputes[_disputeID].arbitrator.appealPeriod(
                appealDisputes[_disputeID].appealDisputeID
            );
        else {
            start = appealDisputes[_disputeID].rulingTime;
            require(start != 0, "The specified dispute is not appealable.");
            end = start + timeOut;
        }
    }

    /** @dev Appeals a ruling.
     *  @param _disputeID The ID of the dispute.
     *  @param _extraData Additional info about the appeal.
     */
    function appeal(uint256 _disputeID, bytes memory _extraData)
        public
        payable
        requireAppealFee(_disputeID, _extraData)
    {
        emit AppealDecision(_disputeID, IArbitrable(msg.sender));
        return super.appeal(_disputeID, _extraData);
    }
}
