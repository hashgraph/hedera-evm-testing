const log = require('node:util').debuglog('hip:mirror-node');

class MirrorNode {
    /** @type {string} */
    #mirrorNodeUrl;

    /**
     * @param {string} mirrorNodeUrl 
     */
    constructor(mirrorNodeUrl = 'http://localhost:8081') {
        this.#mirrorNodeUrl = mirrorNodeUrl;
    }

    /**
     * @param {string} idOrAliasOrEvmAddress
     * @returns 
     */
    getAccount(idOrAliasOrEvmAddress) {
        return this.#fetch(`accounts/${idOrAliasOrEvmAddress}?transactions=false`);
    }

    /**
     * 
     * @param {string} transactionIdOrHash 
     * @returns 
     */
    getContractResults(transactionIdOrHash) {
        return this.#fetch(`contracts/results/${transactionIdOrHash}`);
    }

    /**
     * 
     * @param {string} timestamp 
     * @returns 
     */
    getTransactionsByTimestamp(timestamp) {
        return this.#fetch(`transactions?timestamp=${timestamp}`);
    }

    /**
     * 
     * @param {string} timestamp 
     * @returns 
     */
    getTransactionByTimestamp(timestamp) {
      return this.#fetch(`transactions?timestamp=${timestamp}&limit=1`);
    }

    /**
     * @param {string} scheduleId 
     * @returns 
     */
    getScheduleInfo(scheduleId) {
        return this.#fetch(`schedules/${scheduleId}`);
    }

    /**
     * 
     * @param {string} endpoint 
     */
    async #fetch(endpoint) {
        log('Fetching Mirror Node data from endpoint `%s`', endpoint);
        const resp = await fetch(`${this.#mirrorNodeUrl}/api/v1/${endpoint}`);
        const data = await resp.json();
        return data;
    }
}

module.exports = { MirrorNode };