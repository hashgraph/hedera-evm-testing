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
     * Retrieves contract logs from the network.
     * 
     * @param {Object=} options Optional parameters for filtering logs.
     * @param {string=} options.index
     * @param {number=} options.limit
     * @param {('asc' | 'desc')=} options.order
     * @param {string=} options.timestamp
     * @param {string=} options.topic0
     * @param {string=} options.topic1
     * @param {string=} options.topic2
     * @param {string=} options.topic3
     * @param {string=} options.transactionHash
     * @returns A promise that resolves to an array of ContractLog or null.
     */
    getContractLogs(options) {
        const params = new URLSearchParams();
        if (options?.index) params.append('index', options.index);
        if (options?.limit) params.append('limit', options.limit.toString());
        if (options?.order) params.append('order', options.order);
        if (options?.timestamp) params.append('timestamp', options.timestamp);
        if (options?.topic0) params.append('topic0', options.topic0);
        if (options?.topic1) params.append('topic1', options.topic1);
        if (options?.topic2) params.append('topic2', options.topic2);
        if (options?.topic3) params.append('topic3', options.topic3);
        if (options?.transactionHash) params.append('transaction.hash', options.transactionHash);

        let url = `/api/v1/`;
        const queryString = params.toString();
        if (queryString) {
            url += `?${queryString}`;
        }

        return this.#fetch(`contracts/results/logs${queryString ? `?${queryString}` : ''}`);
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