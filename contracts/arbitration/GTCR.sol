/* solium-disable max-len*/

pragma solidity ^0.5.10;

import "./Arbitrable.sol";
import "./CappedMath.sol";

/**
 *  @title GeneralizedTCR
 *  This contract is a curated registry for any types of items. Just like TCR contract it uses request-challenge protocol and crowdfunding, but also has new features such as badges and request cancellation.
 */
contract GeneralizedTCR is Arbitrable {
    using CappedMath for uint;

    /* Enums */

    enum Status {
        Absent, // The item is not in the registry.
        Registered, // The item is in the registry.
        RegistrationRequested, // The item has a request to be added to the registry.
        ClearingRequested // The item has a request to be removed from the registry.
    }

    enum Party {
        None, // Party per default when there is no challenger or requester. Also used for unconclusive ruling.
        Requester, // Party that made the request to change a status.
        Challenger // Party that challenges the request to change a status.
    }

    /* Structs */

    struct Item {
        bytes itemData; // The data describing the item.
        Status status; // The status of the item.
        Request[] requests; // List of status change requests made for the item.
        address[] badgeList; // List of badges attribute to the item.
        mapping(address => Badge) badges; // Maps the badge address to its data. badges[_badgeAddress].
        address pendingBadge; // The address of the badge which status change is requested.
        mapping(address => mapping(uint => uint)) arbitratorDisputeIDtoRequestID; // Maps a dispute ID to the ID of the disputed request. arbitratorDisputeIDtoRequestID[arbitrator][disputeID].
    }

    struct Badge {
        Status status; // The status of the badge.
        bool onTheList; // Whether the badge has already been added to the list or not.
    }

    // Some arrays below have 3 elements to map with the Party enums for better readability:
    // - 0: is unused, matches `Party.None`.
    // - 1: for `Party.Requester`.
    // - 2: for `Party.Challenger`.
    struct Request {
        bool disputed; // True if a dispute was raised.
        uint disputeID; // ID of the dispute, if any.
        uint submissionTime; // Time when the request was made. Used to track when the challenge period ends.
        bool resolved; // True if the request was executed and/or any disputes raised were resolved.
        address payable[3] parties; // Address of requester and challenger, if any.
        Round[] rounds; // Tracks each round of a dispute.
        Party ruling; // The final ruling given, if any.
        Arbitrator arbitrator; // The arbitrator trusted to solve disputes for this request.
        bytes arbitratorExtraData; // The extra data for the trusted arbitrator of this request.
        bool badgeRequest; // Whether this is a badge-related request or not.
    }

    struct Round {
        uint[3] paidFees; // Tracks the fees paid by each side in this round.
        bool[3] hasPaid; // True when the side has fully paid its fee. False otherwise.
        uint feeRewards; // Sum of reimbursable fees and stake rewards available to the parties that made contributions to the side that ultimately wins a dispute.
        mapping(address => uint[3]) contributions; // Maps contributors to their contributions for each side.
    }

    /* Storage */

    uint RULING_OPTIONS = 2; // The amount of non 0 choices the arbitrator can give.

    address public governor; // The address that can make governance changes to the parameters of the contract.
    uint public requesterBaseDeposit; // The base deposit to make a request.
    uint public challengerBaseDeposit; // The base deposit to challenge a request.
    uint public challengePeriodDuration; // The time before a request becomes executable if not challenged.
    uint public metaEvidenceUpdates; // The number of times the meta evidence has been updated. Used to track the latest meta evidence ID.

    // Multipliers are in basis points.
    uint public winnerStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that won the previous round.
    uint public loserStakeMultiplier; // Multiplier for calculating the fee stake paid by the party that lost the previous round.
    uint public sharedStakeMultiplier; // Multiplier for calculating the fee stake that must be paid in the case where arbitrator refused to arbitrate.
    uint public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.

    bytes32[] public itemList; // List of IDs of all submitted items.
    mapping(bytes32 => Item) public items; // Maps the item ID to its data. items[_itemID].
    mapping(address => mapping(uint => bytes32)) public arbitratorDisputeIDToItem;  // Maps a dispute ID to the ID of the item with the disputed request. arbitratorDisputeIDToItem[arbitrator][disputeID].
    mapping(bytes32 => bool) itemIDs;  // Returns "true" if the item has already been added to the list.

     /* Modifiers */

    modifier onlyGovernor {require(msg.sender == governor, "The caller must be the governor."); _;}

    /* Events */

    /** @dev Emitted when a party submits a new item.
     *  @param _itemData The data describing the item.
     *  @param _itemID Hash of items's data that is used as its ID.
     */
    event ItemSubmitted(bytes _itemData, bytes32 _itemID);

    /** @dev Emitted when a party submits a new badge.
     *  @param _itemID The ID of the item related to the badge.
     *  @param _badge The address if the adding badge.
     */
    event BadgeSubmitted(bytes32 _itemID, address _badge);

    /** @dev Emitted when a party makes a request to change a status of item/badge.
     *  @param _itemID The ID of the affected item.
     *  @param _registrationRequest Whether the request is a registration request. False means it is a clearing request.
     *  @param _badgeRequest Whether the request affects the item or one of its badges.
     */
    event RequestSubmitted(bytes32 indexed _itemID, bool _registrationRequest, bool _badgeRequest);

    /**
     *  @dev Emitted when a party makes a request, dispute or appeals are raised, or when a request is resolved. Is only emitted when request is item-related.
     *  @param _requester Address of the party that submitted the request.
     *  @param _challenger Address of the party that has challenged the request, if any.
     *  @param _itemID The ID of the affected item.
     *  @param _status The status of the item.
     *  @param _disputed Whether the item is disputed.
     *  @param _appealed Whether the current round was appealed.
     */
    event ItemStatusChange(
        address indexed _requester,
        address indexed _challenger,
        bytes32 indexed _itemID,
        Status _status,
        bool _disputed,
        bool _appealed
    );

    /**
     *  @dev Emitted when a party makes a request, dispute or appeals are raised, or when a request is resolved. Is only emitted when request is badge-related.
     *  @param _requester Address of the party that submitted the request.
     *  @param _challenger Address of the party that has challenged the request, if any.
     *  @param _itemID The ID of item which the badge belongs to.
     *  @param _badge The address of the affected badge.
     *  @param _status The status of the badge.
     *  @param _disputed Whether the badge is disputed.
     *  @param _appealed Whether the current round was appealed.
     */
    event BadgeStatusChange(
        address indexed _requester,
        address indexed _challenger,
        bytes32 indexed _itemID,
        address _badge,
        Status _status,
        bool _disputed,
        bool _appealed
    );

    /** @dev Emitted when a reimbursements and/or contribution rewards are withdrawn.
     *  @param _itemID The ID of the item from which the withdrawal was made.
     *  @param _contributor The address that sent the contribution.
     *  @param _request The request from which the withdrawal was made.
     *  @param _round The round from which the reward was taken.
     *  @param _value The value of the reward.
     */
    event RewardWithdrawal(bytes32 indexed _itemID, address indexed _contributor, uint indexed _request, uint _round, uint _value);

    /**
     *  @dev Constructs the arbitrable curated registry.
     *  @param _arbitrator The trusted arbitrator to resolve potential disputes.
     *  @param _arbitratorExtraData Extra data for the trusted arbitrator contract.
     *  @param _registrationMetaEvidence The URI of the meta evidence object for registration requests.
     *  @param _clearingMetaEvidence The URI of the meta evidence object for clearing requests.
     *  @param _governor The trusted governor of this contract.
     *  @param _requesterBaseDeposit The base deposit to make a request.
     *  @param _challengerBaseDeposit The base deposit to challenge a request.
     *  @param _challengePeriodDuration The time in seconds, parties have to challenge a request.
     *  @param _sharedStakeMultiplier Multiplier of the arbitration cost that each party must pay as fee stake for a round when there isn't a winner/loser in the previous round (e.g. when it's the first round or the arbitrator refused to arbitrate). In basis points.
     *  @param _winnerStakeMultiplier Multiplier of the arbitration cost that the winner has to pay as fee stake for a round in basis points.
     *  @param _loserStakeMultiplier Multiplier of the arbitration cost that the loser has to pay as fee stake for a round in basis points.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        string memory _registrationMetaEvidence,
        string memory _clearingMetaEvidence,
        address _governor,
        uint _requesterBaseDeposit,
        uint _challengerBaseDeposit,
        uint _challengePeriodDuration,
        uint _sharedStakeMultiplier,
        uint _winnerStakeMultiplier,
        uint _loserStakeMultiplier
    ) Arbitrable(_arbitrator, _arbitratorExtraData) public {
        emit MetaEvidence(0, _registrationMetaEvidence);
        emit MetaEvidence(1, _clearingMetaEvidence);

        governor = _governor;
        requesterBaseDeposit = _requesterBaseDeposit;
        challengerBaseDeposit = _challengerBaseDeposit;
        challengePeriodDuration = _challengePeriodDuration;
        sharedStakeMultiplier = _sharedStakeMultiplier;
        winnerStakeMultiplier = _winnerStakeMultiplier;
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    /* External and Public */

    // ************************ //
    // *       Requests       * //
    // ************************ //

    /** @dev Submits a request to add a new item to the list. Accepts enough ETH to cover potential dispute, reimburses the rest.
     *  @param _item The data describing the item.
     */
    function addNewItem(bytes calldata _item) external payable {
        bytes32 itemID = keccak256(_item);
        require(!itemIDs[itemID], "Item is already added");
        itemList.push(itemID);
        itemIDs[itemID] = true;

        Item storage item = items[itemID];
        item.status = Status.RegistrationRequested;
        item.itemData = _item;
        emit ItemSubmitted(_item, itemID);

        Request storage request = item.requests[item.requests.length++];
        request.parties[uint(Party.Requester)] = msg.sender;
        request.submissionTime = now;
        request.arbitrator = arbitrator;
        request.arbitratorExtraData = arbitratorExtraData;
        Round storage round = request.rounds[request.rounds.length++];

        emit RequestSubmitted(itemID, item.status == Status.RegistrationRequested, false);

        uint arbitrationCost = request.arbitrator.arbitrationCost(request.arbitratorExtraData);
        uint totalCost = arbitrationCost.addCap((arbitrationCost.mulCap(sharedStakeMultiplier)) / MULTIPLIER_DIVISOR).addCap(requesterBaseDeposit);
        contribute(round, Party.Requester, msg.sender, msg.value, totalCost);
        require(round.paidFees[uint(Party.Requester)] >= totalCost, "You must fully fund your side.");
        round.hasPaid[uint(Party.Requester)] = true;

        emit ItemStatusChange(
            request.parties[uint(Party.Requester)],
            address(0x0),
            itemID,
            item.status,
            false,
            false
        );
    }

    /** @dev Submits a request to change item's status. Accepts enough ETH to cover potential dispute, reimburses the rest.
     *  @param _itemID A unique ID of the item which is a hash of its data.
     */
    function requestStatusChange(bytes32 _itemID)
        external
        payable
    {

        Item storage item = items[_itemID];
        if (item.status == Status.Absent)
            item.status = Status.RegistrationRequested;
        else if (item.status == Status.Registered)
            item.status = Status.ClearingRequested;
        else
            revert("Item already has a pending request.");

        Request storage request = item.requests[item.requests.length++];
        request.parties[uint(Party.Requester)] = msg.sender;
        request.submissionTime = now;
        request.arbitrator = arbitrator;
        request.arbitratorExtraData = arbitratorExtraData;
        Round storage round = request.rounds[request.rounds.length++];

        emit RequestSubmitted(_itemID, item.status == Status.RegistrationRequested, false);

        uint arbitrationCost = request.arbitrator.arbitrationCost(request.arbitratorExtraData);
        uint totalCost = arbitrationCost.addCap((arbitrationCost.mulCap(sharedStakeMultiplier)) / MULTIPLIER_DIVISOR).addCap(requesterBaseDeposit);
        contribute(round, Party.Requester, msg.sender, msg.value, totalCost);
        require(round.paidFees[uint(Party.Requester)] >= totalCost, "You must fully fund your side.");
        round.hasPaid[uint(Party.Requester)] = true;

        emit ItemStatusChange(
            request.parties[uint(Party.Requester)],
            address(0x0),
            _itemID,
            item.status,
            false,
            false
        );
    }

    /** @dev Submits a request to change a status of the badge. Adds badge to the list if it hasn't been added yet. Accepts enough ETH to cover potential dispute, reimburses the rest.
     *  @param _itemID The ID of the item which the badge belongs to.
     *  @param _badge Address of the affected badge.
     */
    function requestBadge(bytes32 _itemID, address _badge) external payable {
        Item storage item = items[_itemID];
        require(item.status == Status.Registered, "Can only add badges to registered items without pending requests");
        require(item.pendingBadge == address(0), "Already have pending badge request");

        Badge storage badge = item.badges[_badge];
        if (!badge.onTheList) {
            item.badgeList.push(_badge);
            badge.onTheList = true;
            emit BadgeSubmitted(_itemID, _badge);
        }

        if (badge.status == Status.Absent)
            badge.status = Status.RegistrationRequested;
        else if (badge.status == Status.Registered)
            badge.status = Status.ClearingRequested;
        else
            revert("Badge already has a pending request.");

        item.pendingBadge = _badge;
        Request storage request = item.requests[item.requests.length++];
        request.parties[uint(Party.Requester)] = msg.sender;
        request.submissionTime = now;
        request.arbitrator = arbitrator;
        request.arbitratorExtraData = arbitratorExtraData;
        request.badgeRequest = true;
        Round storage round = request.rounds[request.rounds.length++];

        emit RequestSubmitted(_itemID, badge.status == Status.RegistrationRequested, true);

        uint arbitrationCost = request.arbitrator.arbitrationCost(request.arbitratorExtraData);
        uint totalCost = arbitrationCost.addCap((arbitrationCost.mulCap(sharedStakeMultiplier)) / MULTIPLIER_DIVISOR).addCap(requesterBaseDeposit);
        contribute(round, Party.Requester, msg.sender, msg.value, totalCost);
        require(round.paidFees[uint(Party.Requester)] >= totalCost, "You must fully fund your side.");
        round.hasPaid[uint(Party.Requester)] = true;

        emit BadgeStatusChange(
            request.parties[uint(Party.Requester)],
            address(0x0),
            _itemID,
            _badge,
            badge.status,
            false,
            false
        );
    }

    /** @dev Challenges the request of the item. Accepts enough ETH to cover potential dispute, reimburses the rest.
     *  @param _itemID The ID of the item which request to challenge.
     *  @param _evidence A link to an evidence using its URI. Ignored if not provided or if not enough funds were provided to create a dispute.
     *  @param _request The ID of the request to challenge.
     */
    function challengeRequest(bytes32 _itemID, string calldata _evidence, uint _request) external payable {
        Item storage item = items[_itemID];

        require(
            item.status == Status.RegistrationRequested || item.status == Status.ClearingRequested || item.pendingBadge != address(0),
            "The item must have a pending request."
        );

        Request storage request = item.requests[_request];
        require(!request.resolved, "Can't challenger resolved requests");
        require(now - request.submissionTime <= challengePeriodDuration, "Challenges must occur during the challenge period.");
        require(!request.disputed, "The request should not have already been disputed.");

        request.parties[uint(Party.Challenger)] = msg.sender;

        Round storage round = request.rounds[request.rounds.length - 1];
        uint arbitrationCost = request.arbitrator.arbitrationCost(request.arbitratorExtraData);
        uint totalCost = arbitrationCost.addCap((arbitrationCost.mulCap(sharedStakeMultiplier)) / MULTIPLIER_DIVISOR).addCap(challengerBaseDeposit);
        contribute(round, Party.Challenger, msg.sender, msg.value, totalCost);
        require(round.paidFees[uint(Party.Challenger)] >= totalCost, "You must fully fund your side.");
        round.hasPaid[uint(Party.Challenger)] = true;

        // Raise a dispute.
        request.disputeID = request.arbitrator.createDispute.value(arbitrationCost)(RULING_OPTIONS, request.arbitratorExtraData);
        arbitratorDisputeIDToItem[address(request.arbitrator)][request.disputeID] = _itemID;
        item.arbitratorDisputeIDtoRequestID[address(request.arbitrator)][request.disputeID] = _request;
        request.disputed = true;
        request.rounds.length++;
        round.feeRewards = round.feeRewards.subCap(arbitrationCost);

        Status status;
        if (request.badgeRequest) {
            Badge storage badge = item.badges[item.pendingBadge];
            status = badge.status;

            emit BadgeStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _itemID,
                item.pendingBadge,
                badge.status,
                true,
                false
            );
        } else {
            status = item.status;
            emit ItemStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                _itemID,
                item.status,
                true,
                false
            );
        }

        emit Dispute(
            request.arbitrator,
            request.disputeID,
            status == Status.RegistrationRequested
                ? 2 * metaEvidenceUpdates
                : 2 * metaEvidenceUpdates + 1,
            uint(keccak256(abi.encodePacked(_itemID, _request)))
        );

        if (bytes(_evidence).length > 0)
            emit Evidence(request.arbitrator, uint(keccak256(abi.encodePacked(_itemID, _request))), msg.sender, _evidence);
    }

    /** @dev Takes up to the total amount required to fund a side of an appeal. Reimburses the rest. Creates an appeal if both sides are fully funded.
     *  @param _itemID The ID of the item which request to fund.
     *  @param _side The recipient of the contribution.
     *  @param _request The ID of the appealed request.
     */
    function fundAppeal(bytes32 _itemID, Party _side, uint _request) external payable {
        require(_side == Party.Requester || _side == Party.Challenger); // solium-disable-line error-reason
        Item storage item = items[_itemID];
        require(
            item.status == Status.RegistrationRequested || item.status == Status.ClearingRequested || item.pendingBadge != address(0),
            "The item must have a pending request."
        );
        Request storage request = item.requests[_request];
        require(!request.resolved, "Can't fund resolved requests");
        require(request.disputed, "A dispute must have been raised to fund an appeal.");
        (uint appealPeriodStart, uint appealPeriodEnd) = request.arbitrator.appealPeriod(request.disputeID);
        require(
            now >= appealPeriodStart && now < appealPeriodEnd,
            "Contributions must be made within the appeal period."
        );

        Round storage round = request.rounds[request.rounds.length - 1];
        Party winner = Party(request.arbitrator.currentRuling(request.disputeID));
        Party loser;
        if (winner == Party.Requester)
            loser = Party.Challenger;
        else if (winner == Party.Challenger)
            loser = Party.Requester;
        require(!(_side==loser) || (now-appealPeriodStart < (appealPeriodEnd-appealPeriodStart)/2), "The loser must contribute during the first half of the appeal period.");

        uint multiplier;
        if (_side == winner)
            multiplier = winnerStakeMultiplier;
        else if (_side == loser)
            multiplier = loserStakeMultiplier;
        else
            multiplier = sharedStakeMultiplier;

        uint appealCost = request.arbitrator.appealCost(request.disputeID, request.arbitratorExtraData);
        uint totalCost = appealCost.addCap((appealCost.mulCap(multiplier)) / MULTIPLIER_DIVISOR);
        contribute(round, _side, msg.sender, msg.value, totalCost);
        if (round.paidFees[uint(_side)] >= totalCost)
            round.hasPaid[uint(_side)] = true;

        // Raise appeal if both sides are fully funded.
        if (round.hasPaid[uint(Party.Challenger)] && round.hasPaid[uint(Party.Requester)]) {
            request.arbitrator.appeal.value(appealCost)(request.disputeID, request.arbitratorExtraData);
            request.rounds.length++;
            round.feeRewards = round.feeRewards.subCap(appealCost);

            if (request.badgeRequest) {
                Badge storage badge = item.badges[item.pendingBadge];

                emit BadgeStatusChange(
                    request.parties[uint(Party.Requester)],
                    request.parties[uint(Party.Challenger)],
                    _itemID,
                    item.pendingBadge,
                    badge.status,
                    true,
                    true
                );
            } else {
                emit ItemStatusChange(
                    request.parties[uint(Party.Requester)],
                    request.parties[uint(Party.Challenger)],
                    _itemID,
                    item.status,
                    true,
                    true
                );
            }
        }
    }

    /** @dev Reimburses contributions if no disputes were raised. If a dispute was raised, sends the fee stake rewards and reimbursements proportional to the contributions made to the winner of a dispute.
     *  @param _beneficiary The address that made contributions to a request.
     *  @param _itemID The ID of the item submission with the request from which to withdraw.
     *  @param _request The request from which to withdraw.
     *  @param _round The round from which to withdraw.
     */
    function withdrawFeesAndRewards(address payable _beneficiary, bytes32 _itemID, uint _request, uint _round) public {
        Item storage item = items[_itemID];
        Request storage request = item.requests[_request];
        Round storage round = request.rounds[_round];
        require(request.resolved); // solium-disable-line error-reason

        uint reward;
        if (!round.hasPaid[uint(Party.Requester)] || !round.hasPaid[uint(Party.Challenger)]) {
            // Reimburse if not enough fees were raised to appeal the ruling.
            reward = round.contributions[_beneficiary][uint(Party.Requester)] + round.contributions[_beneficiary][uint(Party.Challenger)];
            round.contributions[_beneficiary][uint(Party.Requester)] = 0;
            round.contributions[_beneficiary][uint(Party.Challenger)] = 0;
        } else if (request.ruling == Party.None) {
            // Reimburse unspent fees proportionally if there aren't a winner and loser.
            uint rewardRequester = round.paidFees[uint(Party.Requester)] > 0
                ? (round.contributions[_beneficiary][uint(Party.Requester)] * round.feeRewards) / (round.paidFees[uint(Party.Challenger)] + round.paidFees[uint(Party.Requester)])
                : 0;
            uint rewardChallenger = round.paidFees[uint(Party.Challenger)] > 0
                ? (round.contributions[_beneficiary][uint(Party.Challenger)] * round.feeRewards) / (round.paidFees[uint(Party.Challenger)] + round.paidFees[uint(Party.Requester)])
                : 0;

            reward = rewardRequester + rewardChallenger;
            round.contributions[_beneficiary][uint(Party.Requester)] = 0;
            round.contributions[_beneficiary][uint(Party.Challenger)] = 0;
        } else {
            // Reward the winner.
            reward = round.paidFees[uint(request.ruling)] > 0
                ? (round.contributions[_beneficiary][uint(request.ruling)] * round.feeRewards) / round.paidFees[uint(request.ruling)]
                : 0;

            round.contributions[_beneficiary][uint(request.ruling)] = 0;
        }

        emit RewardWithdrawal(_itemID, _beneficiary, _request, _round,  reward);
        _beneficiary.send(reward); // It is the user responsibility to accept ETH.
    }

    /** @dev Executes a request if the challenge period passed and no one challenged the request.
     *  @param _itemID The ID of the item with the request to execute.
     *  @param _request The request to execute.
     */
    function executeRequest(bytes32 _itemID, uint _request) external {
        Item storage item = items[_itemID];
        Request storage request = item.requests[_request];
        require(
            now - request.submissionTime > challengePeriodDuration,
            "Time to challenge the request must pass."
        );
        require(!request.resolved, "The request should not be resolved");
        require(!request.disputed, "The request should not be disputed.");

        if (request.badgeRequest) {
            Badge storage badge = item.badges[item.pendingBadge];
            if (badge.status == Status.RegistrationRequested)
                badge.status = Status.Registered;
            else if (badge.status == Status.ClearingRequested)
                badge.status = Status.Absent;
            else
                revert("There must be a request.");

            emit BadgeStatusChange(
                request.parties[uint(Party.Requester)],
                address(0),
                _itemID,
                item.pendingBadge,
                badge.status,
                false,
                false
            );

            item.pendingBadge = address(0);
        } else {

            if (item.status == Status.RegistrationRequested)
                item.status = Status.Registered;
            else if (item.status == Status.ClearingRequested)
                item.status = Status.Absent;
            else
                revert("There must be a request.");

            emit ItemStatusChange(
                request.parties[uint(Party.Requester)],
                address(0),
                _itemID,
                item.status,
                false,
                false
            );
        }

        request.resolved = true;
        withdrawFeesAndRewards(request.parties[uint(Party.Requester)], _itemID, _request, 0); // Automatically withdraw for the requester.
    }

    /** @dev Cancels the request if the challenge period hasn't passed and no disputes were raised.
     *  @param _itemID The ID of the item with the request to cancel.
     *  @param _request The request to cancel.
     */
    function cancelRequest(bytes32 _itemID, uint _request) external {
        Item storage item = items[_itemID];
        Request storage request = item.requests[_request];
        require(
            now - request.submissionTime <= challengePeriodDuration,
            "Only allowed to cancel within challenge period."
        );
        require(!request.resolved, "The request should not be resolved");
        require(msg.sender == request.parties[uint(Party.Requester)], "Only the requester is allowed to execute this");
        require(!request.disputed, "The request should not be disputed.");

        if (request.badgeRequest) {
            Badge storage badge = item.badges[item.pendingBadge];
            if (badge.status == Status.RegistrationRequested)
                badge.status = Status.Absent;
            else if (badge.status == Status.ClearingRequested)
                badge.status = Status.Registered;
            else
                revert("There must be a request.");

            emit BadgeStatusChange(
                request.parties[uint(Party.Requester)],
                address(0),
                _itemID,
                item.pendingBadge,
                badge.status,
                false,
                false
            );

            item.pendingBadge = address(0);
        } else {

            if (item.status == Status.RegistrationRequested)
                item.status = Status.Absent;
            else if (item.status == Status.ClearingRequested)
                item.status = Status.Registered;
            else
                revert("There must be a request.");

            emit ItemStatusChange(
                request.parties[uint(Party.Requester)],
                address(0),
                _itemID,
                item.status,
                false,
                false
            );
        }

        request.resolved = true;
        withdrawFeesAndRewards(request.parties[uint(Party.Requester)], _itemID, _request, 0); // Automatically withdraw for the requester.
    }

    /** @dev Give a ruling for a dispute. Can only be called by the arbitrator. TRUSTED.
     *  Overrides parent function to account for the situation where the winner loses a case due to paying less appeal fees than expected.
     *  @param _disputeID ID of the dispute in the arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Refused to arbitrate".
     */
    function rule(uint _disputeID, uint _ruling) public {
        Party resultRuling = Party(_ruling);
        bytes32 itemID = arbitratorDisputeIDToItem[msg.sender][_disputeID];
        Item storage item = items[itemID];
        uint requestID = item.arbitratorDisputeIDtoRequestID[msg.sender][_disputeID];

        Request storage request = item.requests[requestID];
        Round storage round = request.rounds[request.rounds.length - 1];
        require(_ruling <= RULING_OPTIONS); // solium-disable-line error-reason
        require(address(request.arbitrator) == msg.sender); // solium-disable-line error-reason
        require(!request.resolved); // solium-disable-line error-reason

        // The ruling is inverted if the loser paid its fees.
        if (round.hasPaid[uint(Party.Requester)] == true) // If one side paid its fees, the ruling is in its favor. Note that if the other side had also paid, an appeal would have been created.
            resultRuling = Party.Requester;
        else if (round.hasPaid[uint(Party.Challenger)] == true)
            resultRuling = Party.Challenger;

        emit Ruling(Arbitrator(msg.sender), _disputeID, uint(resultRuling));
        executeRuling(_disputeID, uint(resultRuling));
    }

    /** @dev Submit a reference to evidence. EVENT.
     *  @param _itemID The item which the evidence is related to.
     *  @param _evidence A link to an evidence using its URI.
     *  @param _request The request the the evidence is related to.
     */
    function submitEvidence(bytes32 _itemID, string calldata _evidence, uint _request) external {
        Item storage item = items[_itemID];
        Request storage request = item.requests[_request];
        require(!request.resolved, "The dispute must not already be resolved.");

        emit Evidence(request.arbitrator, uint(keccak256(abi.encodePacked(_itemID, _request))), msg.sender, _evidence);
    }

     // ************************ //
    // *      Governance      * //
    // ************************ //

    /** @dev Change the duration of the challenge period.
     *  @param _challengePeriodDuration The new duration of the challenge period.
     */
    function changeTimeToChallenge(uint _challengePeriodDuration) external onlyGovernor {
        challengePeriodDuration = _challengePeriodDuration;
    }

    /** @dev Change the base amount required as a deposit to make a request.
     *  @param _requesterBaseDeposit The new base amount of wei required to make a request.
     */
    function changeRequesterBaseDeposit(uint _requesterBaseDeposit) external onlyGovernor {
        requesterBaseDeposit = _requesterBaseDeposit;
    }

    /** @dev Change the base amount required as a deposit to challenge a request.
     *  @param _challengerBaseDeposit The new base amount of wei required to challenge a request.
     */
    function changeChallengerBaseDeposit(uint _challengerBaseDeposit) external onlyGovernor {
        challengerBaseDeposit = _challengerBaseDeposit;
    }

    /** @dev Change the governor of the curated registry.
     *  @param _governor The address of the new governor.
     */
    function changeGovernor(address _governor) external onlyGovernor {
        governor = _governor;
    }

    /** @dev Change the percentage of arbitration fees that must be paid as fee stake by parties when there is no winner or loser.
     *  @param _sharedStakeMultiplier Multiplier of arbitration fees that must be paid as fee stake. In basis points.
     */
    function changeSharedStakeMultiplier(uint _sharedStakeMultiplier) external onlyGovernor {
        sharedStakeMultiplier = _sharedStakeMultiplier;
    }

    /** @dev Change the percentage of arbitration fees that must be paid as fee stake by the winner of the previous round.
     *  @param _winnerStakeMultiplier Multiplier of arbitration fees that must be paid as fee stake. In basis points.
     */
    function changeWinnerStakeMultiplier(uint _winnerStakeMultiplier) external onlyGovernor {
        winnerStakeMultiplier = _winnerStakeMultiplier;
    }

    /** @dev Change the percentage of arbitration fees that must be paid as fee stake by the party that lost the previous round.
     *  @param _loserStakeMultiplier Multiplier of arbitration fees that must be paid as fee stake. In basis points.
     */
    function changeLoserStakeMultiplier(uint _loserStakeMultiplier) external onlyGovernor {
        loserStakeMultiplier = _loserStakeMultiplier;
    }

    /** @dev Change the arbitrator to be used for disputes that may be raised in the next requests. The arbitrator is trusted to support appeal periods and not reenter.
     *  @param _arbitrator The new trusted arbitrator to be used in the next requests.
     *  @param _arbitratorExtraData The extra data used by the new arbitrator.
     */
    function changeArbitrator(Arbitrator _arbitrator, bytes calldata _arbitratorExtraData) external onlyGovernor {
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
    }

    /** @dev Update the meta evidence used for disputes.
     *  @param _registrationMetaEvidence The meta evidence to be used for future registration request disputes.
     *  @param _clearingMetaEvidence The meta evidence to be used for future clearing request disputes.
     */
    function changeMetaEvidence(string calldata _registrationMetaEvidence, string calldata _clearingMetaEvidence) external onlyGovernor {
        metaEvidenceUpdates++;
        emit MetaEvidence(2 * metaEvidenceUpdates, _registrationMetaEvidence);
        emit MetaEvidence(2 * metaEvidenceUpdates + 1, _clearingMetaEvidence);
    }

    /* Internal */

    /** @dev Returns the contribution value and remainder from available ETH and required amount.
     *  @param _available The amount of ETH available for the contribution.
     *  @param _requiredAmount The amount of ETH required for the contribution.
     *  @return taken The amount of ETH taken.
     *  @return remainder The amount of ETH left from the contribution.
     */
    function calculateContribution(uint _available, uint _requiredAmount)
        internal
        pure
        returns(uint taken, uint remainder)
    {
        if (_requiredAmount > _available)
            return (_available, 0); // Take whatever is available, return 0 as leftover ETH.

        remainder = _available - _requiredAmount;
        return (_requiredAmount, remainder);
    }

    /** @dev Make a fee contribution.
     *  @param _round The round to contribute.
     *  @param _side The side for which to contribute.
     *  @param _contributor The contributor.
     *  @param _amount The amount contributed.
     *  @param _totalRequired The total amount required for this side.
     */
    function contribute(Round storage _round, Party _side, address payable _contributor, uint _amount, uint _totalRequired) internal {
        // Take up to the amount necessary to fund the current round at the current costs.
        uint contribution; // Amount contributed.
        uint remainingETH; // Remaining ETH to send back.
        (contribution, remainingETH) = calculateContribution(_amount, _totalRequired.subCap(_round.paidFees[uint(_side)]));
        _round.contributions[_contributor][uint(_side)] += contribution;
        _round.paidFees[uint(_side)] += contribution;
        _round.feeRewards += contribution;

        // Reimburse leftover ETH.
        _contributor.send(remainingETH); // Deliberate use of send in order to not block the contract in case of reverting fallback.
    }

    /** @dev Execute the ruling of a dispute.
     *  @param _disputeID ID of the dispute in the Arbitrator contract.
     *  @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Refused to arbitrate".
     */
    function executeRuling(uint _disputeID, uint _ruling) internal {
        bytes32 itemID = arbitratorDisputeIDToItem[msg.sender][_disputeID];
        Item storage item = items[itemID];
        uint requestID = item.arbitratorDisputeIDtoRequestID[msg.sender][_disputeID];
        Request storage request = item.requests[requestID];

        Party winner = Party(_ruling);

        if (request.badgeRequest) {
            Badge storage badge = item.badges[item.pendingBadge];
            if (winner == Party.Requester) {
                if (badge.status == Status.RegistrationRequested)
                    badge.status = Status.Registered;
                else if (badge.status == Status.ClearingRequested)
                    badge.status = Status.Absent;
            } else { // Revert to previous state.
                if (badge.status == Status.RegistrationRequested)
                    badge.status = Status.Absent;
                else if (badge.status == Status.ClearingRequested)
                    badge.status = Status.Registered;
            }
            emit BadgeStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                itemID,
                item.pendingBadge,
                badge.status,
                request.disputed,
                false
            );

            item.pendingBadge = address(0);
        } else {
            if (winner == Party.Requester) { // Execute Request
                if (item.status == Status.RegistrationRequested)
                    item.status = Status.Registered;
                else if (item.status == Status.ClearingRequested)
                    item.status = Status.Absent;
            } else {
                if (item.status == Status.RegistrationRequested)
                    item.status = Status.Absent;
                else if (item.status == Status.ClearingRequested)
                    item.status = Status.Registered;
            }
            emit ItemStatusChange(
                request.parties[uint(Party.Requester)],
                request.parties[uint(Party.Challenger)],
                itemID,
                item.status,
                request.disputed,
                false
            );
        }

        request.resolved = true;
        request.ruling = Party(_ruling);
        // Automatically withdraw.
        if (winner == Party.None) {
            withdrawFeesAndRewards(request.parties[uint(Party.Requester)], itemID, requestID, 0);
            withdrawFeesAndRewards(request.parties[uint(Party.Challenger)], itemID, requestID, 0);
        } else {
            withdrawFeesAndRewards(request.parties[uint(winner)], itemID, requestID, 0);
        }
    }

    // ************************ //
    // *       Getters        * //
    // ************************ //

    /** @dev Return the number of items that were submitted. Includes items that never made it to the list or were later removed.
     *  @return count The number of items on the list.
     */
    function itemCount() external view returns (uint count) {
        return itemList.length;
    }

    /** @dev Return the number of badges that were submitted to the item. Includes badges that never made it to the list or were later removed.
     *  @param _itemID The item to query badges from.
     *  @return count The number of items on the list.
     */
    function badgeCount(bytes32 _itemID) external view returns (uint count) {
        Item storage item = items[_itemID];
        return item.badgeList.length;
    }

    /** @dev Gets the contributions made by a party for a given round of a request.
     *  @param _itemID The ID of the item.
     *  @param _request The request to query.
     *  @param _round The round to query.
     *  @param _contributor The address of the contributor.
     *  @return The contributions.
     */
    function getContributions(
        bytes32 _itemID,
        uint _request,
        uint _round,
        address _contributor
    ) external view returns(uint[3] memory contributions) {
        Item storage item = items[_itemID];
        Request storage request = item.requests[_request];
        Round storage round = request.rounds[_round];
        contributions = round.contributions[_contributor];
    }

    /** @dev Returns item's information. Includes length of requests array.
     *  @param _itemID The ID of the queried item.
     *  @return The item information.
     */
    function getItemInfo(bytes32 _itemID)
        external
        view
        returns (
            bytes memory itemData,
            Status status,
            address pendingBadge,
            uint numberOfRequests
        )
    {
        Item storage item = items[_itemID];
        return (
            item.itemData,
            item.status,
            item.pendingBadge,
            item.requests.length
        );
    }

    /** @dev Gets information on a request made for the item.
     *  @param _itemID The ID of the queried item.
     *  @param _request The request to be queried.
     *  @return The request information.
     */
    function getRequestInfo(bytes32 _itemID, uint _request)
        external
        view
        returns (
            bool disputed,
            uint disputeID,
            uint submissionTime,
            bool resolved,
            address payable[3] memory parties,
            uint numberOfRounds,
            Party ruling,
            Arbitrator arbitrator,
            bytes memory arbitratorExtraData,
            bool badgeRequest
        )
    {
        Request storage request = items[_itemID].requests[_request];
        return (
            request.disputed,
            request.disputeID,
            request.submissionTime,
            request.resolved,
            request.parties,
            request.rounds.length,
            request.ruling,
            request.arbitrator,
            request.arbitratorExtraData,
            request.badgeRequest
        );
    }

    /** @dev Gets the information on a round of a request.
     *  @param _itemID The ID of the queried item.
     *  @param _request The request to be queried.
     *  @param _round The round to be queried.
     *  @return The round information.
     */
    function getRoundInfo(bytes32 _itemID, uint _request, uint _round)
        external
        view
        returns (
            bool appealed,
            uint[3] memory paidFees,
            bool[3] memory hasPaid,
            uint feeRewards
        )
    {
        Item storage item = items[_itemID];
        Request storage request = item.requests[_request];
        Round storage round = request.rounds[_round];
        return (
            _round != (request.rounds.length-1),
            round.paidFees,
            round.hasPaid,
            round.feeRewards
        );
    }

    /** @dev Gets the information on a specific badge of the item.
     *  @param _itemID The ID of the queried item.
     *  @param _badge The address of the badge.
     *  @return The badge information.
     */
    function getBadgeInfo(bytes32 _itemID, address _badge)
        external
        view
        returns (
            Status status,
            bool onTheList
        )
    {
        Item storage item = items[_itemID];
        Badge storage badge = item.badges[_badge];
        return (
            badge.status,
            badge.onTheList
        );
    }
}