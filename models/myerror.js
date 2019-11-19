class MyError extends Error {
  constructor(httpStatus, title, message) {
    super(message);
    this.message = message;
    this.title = title;
    this.httpStatus = httpStatus;
  }
}

module.exports = MyError;
