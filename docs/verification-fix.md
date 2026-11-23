# Verification Compiler Version Format

All three Sepolia deployments were confirmed before source verification. The first verification attempt was rejected because the compiler identifier included the local JavaScript build suffix `.Emscripten.clang`.

Etherscan expects `v0.8.26+commit.8a97fa7a`. The local compiler is still the same Solidity 0.8.26 build; the compiler task now reports the canonical long version without the platform suffix. Compiler source, optimizer settings, EVM target, constructors and deployed contract addresses are unchanged.

The verification script forces fresh compilation metadata and checks each creation bytecode hash against the saved deployment record before making an explorer request. An exact hash match establishes that the metadata label correction did not change the deployment bytecode. Source verification can then be retried without another deployment.

Official API format: https://docs.etherscan.io/api-reference/endpoint/verifysourcecode
