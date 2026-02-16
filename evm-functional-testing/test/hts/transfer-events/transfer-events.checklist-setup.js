const { contractDeployAndFund } = require("../../../utils/contract");
const Constants = require("../../../utils/constants");

async function preSetupChecklist() {
  // create token create contract
  const tokenContract = await contractDeployAndFund(
    Constants.Contract.TokenCreateContract,
  );
  // create test 'transferContract'
  const transferContract = await contractDeployAndFund(
    Constants.Contract.HTSSystemContractTransfersExecutorContract,
    20,
  );

  // create test FT token with 'tokenContract' as a 'treasury'
  const receipt = await (
    await transferContract.createFungibleTokenWithoutKYCPublic(tokenContract, {
      value: Constants.Cost.CREATE_TOKEN_COST,
    })
  ).wait();
  const tokenAddress = receipt.logs.find(
    (e) => e.fragment.name === Constants.Events.CreatedToken,
  ).args.tokenAddress;
  console.log(
    "TRANSFER_EVENTS_TOKEN_CONTRACT_ADDRESS=%s",
    tokenContract.target,
  );
  console.log(
    "TRANSFER_EVENTS_TRANSFER_CONTRACT_ADDRESS=%s",
    transferContract.target,
  );
  console.log("TRANSFER_EVENTS_TOKEN_ADDRESS=%s", tokenAddress);
}

// main
(async function () {
  await preSetupChecklist();
})();
