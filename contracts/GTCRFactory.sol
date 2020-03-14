/**
 *  @authors: [@mtsalenc]
 *  @reviewers: [@clesaege, @unknownunknown1, @ferittuncer, @satello]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.5.16;

import { GeneralizedTCR, IArbitrator } from "./GeneralizedTCR.sol";

/* solium-disable max-len */

/**
 *  @title GTCRFactory
 *  This contract acts as a registry for GeneralizedTCR instances.
 */
contract GTCRFactory {

    /**
     *  @dev Emitted when a new Generalized TCR contract is deployed using this factory.
     *  @param _address The address of the newly deployed Generalized TCR.
     */
    event NewGTCR(GeneralizedTCR indexed _address);

    GeneralizedTCR[] public instances;

    /**
     *  @dev Deploy the arbitrable curated registry.
     *  @param _arbitrator Arbitrator to resolve potential disputes. The arbitrator is trusted to support appeal periods and not reenter.
     *  @param _arbitratorExtraData Extra data for the trusted arbitrator contract.
     *  @param _connectedTCR The address of the TCR that stores related TCR addresses. This parameter can be left empty.
     *  @param _registrationMetaEvidence The URI of the meta evidence object for registration requests.
     *  @param _clearingMetaEvidence The URI of the meta evidence object for clearing requests.
     *  @param _governor The trusted governor of this contract.
     *  @param _submissionBaseDeposit The base deposit to submit an item.
     *  @param _removalBaseDeposit The base deposit to remove an item.
     *  @param _submissionChallengeBaseDeposit The base deposit to challenge a submission.
     *  @param _removalChallengeBaseDeposit The base deposit to challenge a removal request.
     *  @param _challengePeriodDuration The time in seconds parties have to challenge a request.
     *  @param _stakeMultipliers Multipliers of the arbitration cost in basis points (see GeneralizedTCR MULTIPLIER_DIVISOR) as follows:
     *  - The multiplier applied to each party's fee stake for a round when there is no winner/loser in the previous round (e.g. when it's the first round or the arbitrator refused to arbitrate).
     *  - The multiplier applied to the winner's fee stake for an appeal round.
     *  - The multiplier applied to the loser's fee stake for an appeal round.
     */
    function deploy(
        IArbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        address _connectedTCR,
        string memory _registrationMetaEvidence,
        string memory _clearingMetaEvidence,
        address _governor,
        uint _submissionBaseDeposit,
        uint _removalBaseDeposit,
        uint _submissionChallengeBaseDeposit,
        uint _removalChallengeBaseDeposit,
        uint _challengePeriodDuration,
        uint[3] memory _stakeMultipliers
    ) public {
        GeneralizedTCR instance = new GeneralizedTCR(
                _arbitrator,
                _arbitratorExtraData,
                _connectedTCR,
                _registrationMetaEvidence,
                _clearingMetaEvidence,
                _governor,
                _submissionBaseDeposit,
                _removalBaseDeposit,
                _submissionChallengeBaseDeposit,
                _removalChallengeBaseDeposit,
                _challengePeriodDuration,
                _stakeMultipliers
        );
        instances.push(instance);
        emit NewGTCR(instance);
    }

    /**
     * @return The number of deployed tcrs using this factory.
     */
    function count() external view returns (uint) {
        return instances.length;
    }
}
