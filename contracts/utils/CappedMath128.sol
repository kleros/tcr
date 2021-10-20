/**
 *  @authors: [@hbarcelos]
 *  @reviewers: [@fnanni-0]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */
pragma solidity ^0.5.16;

/**
 * @title CappedMath
 * @dev Math operations with caps for under and overflow.
 */
library CappedMath128 {
    uint128 private constant UINT128_MAX = 2**128 - 1;

    /**
     * @dev Adds two unsigned integers, returns 2^128 - 1 on overflow.
     */
    function addCap(uint128 _a, uint128 _b) internal pure returns (uint128) {
        uint128 c = _a + _b;
        return c >= _a ? c : UINT128_MAX;
    }

    /**
     * @dev Subtracts two integers, returns 0 on underflow.
     */
    function subCap(uint128 _a, uint128 _b) internal pure returns (uint128) {
        if (_b > _a) return 0;
        else return _a - _b;
    }

    /**
     * @dev Multiplies two unsigned integers, returns 2^128 - 1 on overflow.
     */
    function mulCap(uint128 _a, uint128 _b) internal pure returns (uint128) {
        if (_a == 0) return 0;

        uint128 c = _a * _b;
        return c / _a == _b ? c : UINT128_MAX;
    }
}
