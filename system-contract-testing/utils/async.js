// SPDX-License-Identifier: Apache-2.0

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
      console.log("Waiting: %s now: %s", milliseconds, now);
      await this.wait(step);
      now = Date.now();
    }
  }

  static async waitForCondition(name, exec, condition, step, maxAttempts) {
    let attempt = 1;
    let result = await exec();
    while (attempt <= maxAttempts) {
      if (!condition(result)) {
        console.log(
          "Waiting for condition: '%s' %s/%s",
          name,
          attempt,
          maxAttempts,
        );
        await this.wait(step);
        attempt++;
        result = await exec();
      } else {
        return result;
      }
    }
    throw 'Failed to wait for condition ' + name;
  }
}

module.exports = Async;
