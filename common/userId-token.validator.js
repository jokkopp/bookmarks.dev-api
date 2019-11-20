const UseridTokenValidationError = require('../models/userid-token-validation.error');

let validateUserIdInToken = function (request) {
  const userId = request.kauth.grant.access_token.content.sub;
  if ( userId !== request.params.userId ) {
    throw new UseridTokenValidationError('the userId does not match the subject in the access token');
  }
}

module.exports.validateUserIdInToken = validateUserIdInToken;
