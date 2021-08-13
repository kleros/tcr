pragma solidity ^0.5.16;

import "../LightGeneralizedTCR.sol";

contract RelayMock {
    function add(LightGeneralizedTCR _gtcr, string calldata _itemData)
        external
    {
        _gtcr.addItemDirectly(_itemData);
    }

    function remove(LightGeneralizedTCR _gtcr, bytes32 _itemID) external {
        _gtcr.removeItemDirectly(_itemID);
    }
}
