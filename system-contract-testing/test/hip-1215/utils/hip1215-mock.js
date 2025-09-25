const { MOCK_ENABLED } = require("../../../utils/environment");

class MockUtils {
  static async mockSetSuccessResponse(mockImpl) {
    if (MOCK_ENABLED) {
      console.log("Mock: set status success:", 22);
      return mockImpl.setResponse(true, 22);
    } else {
      return Promise.resolve("resolved");
    }
  }
  static async mockSetFailResponse(mockImpl, _responseCode) {
    if (MOCK_ENABLED) {
      console.log("Mock: set status fail:", _responseCode);
      return mockImpl.setResponse(false, _responseCode);
    } else {
      return Promise.resolve("resolved");
    }
  }
}

module.exports = MockUtils;
