class Async {

  static wait(milliseconds) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve("resolved");
      }, milliseconds);
    });
  }
}

module.exports = {
  Async
};