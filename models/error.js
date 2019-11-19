var AppError = function (httpStatus, title, messages) {
  this.httpStatus = httpStatus
  this.title = title;
  this.messages = messages;
};

module.exports = AppError;
