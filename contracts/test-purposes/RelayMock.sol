pragma solidity ^0.5.16;

import "../GeneralizedTCR.sol";

contract RelayMock {

    function add(GeneralizedTCR _gtcr,  string calldata _itemData) external {
        _gtcr.addItemDirectly(_itemData);
    }

    function remove(GeneralizedTCR _gtcr,bytes32 _itemID) external {
        _gtcr.removeItemDirectly(_itemID);
    }
}