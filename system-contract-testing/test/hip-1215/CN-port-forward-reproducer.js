const Utils = require("../../utils/utils");
const Async = require("../../utils/async");
const { AccountInfoQuery, AccountId } = require("@hashgraph/sdk");

//TODO CN port forward test
//  ps aux | grep kubectl
//  kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211
describe("CN port forward test", () => {
  it("CN port forward test", async () => {
    const accountAddress = "0xf70febf7420398c3892ce79fdc393c1a5487ad27";
    for (let i = 0; i < 1; i++) {
      // recreate client for connection reset
      sdkClient = await Utils.createSDKClient();
      console.log("Call:%s", accountAddress);
      const info = await new AccountInfoQuery()
        .setAccountId(AccountId.fromEvmAddress(0,0, accountAddress))
        .execute(sdkClient);
      console.log("Balance:%s", info.balance);
      // sdkClient.close(); //TODO w/o close execution lead to port-forward failing
      await Async.wait(1000);
    }
  });
});
