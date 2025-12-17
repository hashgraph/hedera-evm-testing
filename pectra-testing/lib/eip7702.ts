import { strict as assert } from 'node:assert';

/**
 * 
 * @param address - Ethereum address
 * @returns 
 */
export function designatorFor(address: string) {
    assert(/^0x[0-9a-fA-F]{40}$/.test(address), `Invalid Ethereum address: ${address}`);
    return `0xef0100${address.slice(2)}`;
}