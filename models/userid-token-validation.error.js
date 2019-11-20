class UseridTokenValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UseridTokenValidationError'
  }
}

module.exports = UseridTokenValidationError;
