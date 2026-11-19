// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Adversarial fixture for rejected payments and repeated withdrawal attempts.
contract PaymentReceiver {
    address public target;
    bytes public payload;
    bool public reject;
    bool public attempted;
    bool public reentered;

    function configure(address target_, bytes calldata payload_, bool reject_) external {
        target = target_;
        payload = payload_;
        reject = reject_;
        attempted = false;
        reentered = false;
    }

    function execute(address to, bytes calldata data) external payable {
        (bool ok, bytes memory result) = to.call{value: msg.value}(data);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
    }

    receive() external payable {
        require(!reject, "Receiver rejected");
        if (target != address(0) && !attempted) {
            attempted = true;
            (reentered,) = target.call(payload);
        }
    }
}

