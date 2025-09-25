class Async {

  static wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve("resolved");
      }, milliseconds);
    });
  }

  static async waitFor(milliseconds, step) {
    while (Date.now() < milliseconds) {
      console.debug("Waiting %s", milliseconds);
      await this.wait(step);
    }
  }
}

module.exports = {
  Async
};