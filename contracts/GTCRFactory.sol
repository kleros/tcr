/**
 *  @authors: [@mtsalenc]
 *  @reviewers: []
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
    address public GTCR;

    /**
     *  @dev Constructor.
     *  @param _GTCR Address of the generalized TCR contract that is going to be used for each new deployment.
     */
    constructor(address _GTCR) public {
        GTCR = _GTCR;
    }

    /**
     *  @dev Deploy the arbitrable curated registry.
     *  @param _arbitrator Arbitrator to resolve potential disputes. The arbitrator is trusted to support appeal periods and not reenter.
     *  @param _arbitratorExtraData Extra data for the trusted arbitrator contract.
     *  @param _connectedTCR The address of the TCR that stores related TCR addresses. This parameter can be left empty.
     *  @param _registrationMetaEvidence The URI of the meta evidence object for registration requests.
     *  @param _clearingMetaEvidence The URI of the meta evidence object for clearing requests.
     *  @param _governor The trusted governor of this contract.
     *  @param _baseDeposits The base deposits for requests/challenges as follows:
     *  - The base deposit to submit an item.
     *  - The base deposit to remove an item.
     *  - The base deposit to challenge a submission.
     *  - The base deposit to challenge a removal request.
     *  @param _challengePeriodDuration The time in seconds parties have to challenge a request.
     *  @param _stakeMultipliers Multipliers of the arbitration cost in basis points (see GeneralizedTCR MULTIPLIER_DIVISOR) as follows:
     *  - The multiplier applied to each party's fee stake for a round when there is no winner/loser in the previous round (e.g. when it's the first round or the arbitrator refused to arbitrate).
     *  - The multiplier applied to the winner's fee stake for an appeal round.
     *  - The multiplier applied to the loser's fee stake for an appeal round.
     *  @param _relayContract The address of the relay contract to add/remove items directly.
     */
    function deploy(
        IArbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        address _connectedTCR,
        string memory _registrationMetaEvidence,
        string memory _clearingMetaEvidence,
        address _governor,
        uint[4] memory _baseDeposits,
        uint _challengePeriodDuration,
        uint[3] memory _stakeMultipliers,
        address _relayContract
    ) public {
        GeneralizedTCR instance = clone(GTCR);
        instance.initialize(
                _arbitrator,
                _arbitratorExtraData,
                _connectedTCR,
                _registrationMetaEvidence,
                _clearingMetaEvidence,
                _governor,
                _baseDeposits,
                _challengePeriodDuration,
                _stakeMultipliers,
                _relayContract
        );
        instances.push(instance);
        emit NewGTCR(instance);
    }

    /**
     * @notice Adaptation of @openzeppelin/contracts/proxy/Clones.sol.
     * @dev Deploys and returns the address of a clone that mimics the behaviour of `GTCR`.
     * @param _implementation Address of the contract to clone.
     * This function uses the create opcode, which should never revert.
     */
    function clone(address _implementation) internal returns (GeneralizedTCR instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, _implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        require(instance != GeneralizedTCR(0), "ERC1167: create failed");
    }

    /**
     * @return The number of deployed tcrs using this factory.
     */
    function count() external view returns (uint) {
        return instances.length;
    }
}
