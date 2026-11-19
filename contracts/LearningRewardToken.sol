// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply reward token. No subsequent mint or burn entry points.
contract LearningRewardToken is ERC20 {
    constructor(address treasury, uint256 supply) ERC20("Learning Reward Token", "LRT") {
        require(treasury != address(0) && supply > 0, "Invalid supply or treasury");
        _mint(treasury, supply);
    }
}

