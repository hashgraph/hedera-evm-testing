import { exec } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * 
 */
export async function mochaGlobalSetup() {
    const { stdout } = await promisify(exec)('forge build');
    console.info(stdout);
}