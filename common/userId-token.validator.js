const AppError = require('../models/error');
const MyError = require('../models/myerror');
const HttpStatus = require('http-status-codes');

let validateUserIdInToken = function (request) {
  const userId = request.kauth.grant.access_token.content.sub;
  if ( userId !== request.params.userId ) {
    //next(new AppError(HttpStatus.UNAUTHORIZED, 'Unauthorized', ['the userId does not match the subject in the access token']));
    throw new MyError(HttpStatus.UNAUTHORIZED, 'Unauthorized', ['the userId does not match the subject in the access token']);
    //throw new AppError(HttpStatus.UNAUTHORIZED, 'Unauthorized', ['the userId does not match the subject in the access token']);
  }
}

module.exports.validateUserIdInToken = validateUserIdInToken;
