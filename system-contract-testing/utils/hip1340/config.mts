/**
 * The RPC URL to connect to the Ethereum network.
 * Defaults to `http://localhost:8545` if not set.
 */
export const rpcUrl = process.env['RPC_URL'] ?? process.env['ETH_RPC_URL'] ?? 'http://localhost:8545';

/**
 * The ECDSA key for the operator account.
 * Defaults to a well-known Geth (temporarily) test key if not set.
 */
export const operatorEcdsaKey = process.env['OPERATOR_ECDSA_KEY'] ?? '0xb71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291';
