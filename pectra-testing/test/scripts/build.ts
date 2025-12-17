import { exec } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * 
 */
export async function mochaGlobalSetup() {
    console.log("Global setup for Mocha tests");

    const { stdout, stderr } = await promisify(exec)('forge build');
    console.log('Forge build output:', stdout);
}