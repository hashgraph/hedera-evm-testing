class Async {

  static wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve("resolved");
      }, milliseconds);
    });
  }

  static async waitFor(milliseconds, step) {
    let now = Date.now();
    while (now < milliseconds) {
      console.debug("Waiting: %s now: %s", milliseconds, now);
      await this.wait(step);
      now = Date.now();
    }
  }
}

module.exports = Async;