const User = require('../../models/user');

const userIdTokenValidator = require('./userid.validator');
const ValidationError = require('../../models/validation.error');
const NotFoundError = require('../../models/not-found.error');

let createUserData = async function (request) {
  userIdTokenValidator.validateUserId(request);

  validateUserData(request);

  const userData = new User({
    userId: request.params.userId,
    searches: request.body.searches,
    readLater: request.body.readLater,
    likes: request.body.likes,
    watchedTags: request.body.watchedTags,
    pinned: request.body.pinned,
    favorites: request.body.favorites,
    history: request.body.history
  });

  const newUserData = await userData.save();

  return newUserData;
}

let updateUserData = async function (request) {

  userIdTokenValidator.validateUserId(request);

  validateUserData(request);

  //hold only 30 bookmarks in history or pinned
  if (request.body.history.length > 30) {
    request.body.history = request.body.history.slice(0, 3);
  }

  if (request.body.pinned.length > 30) {
    request.body.pinned = request.body.pinned.slice(0, 3);
  }

  delete request.body._id;//once we proved it's present we delete it to avoid the following MOngoError by findOneAndUpdate
  // MongoError: After applying the update to the document {_id: ObjectId('5c513150e13cda73420a9602') , ...}, the (immutable) field '_id' was found to have been altered to _id: "5c513150e13cda73420a9602"
  const userData = await User.findOneAndUpdate(
    {userId: request.params.userId},
    request.body,
    {upsert: true, new: true}, // options
  );

  return userData;
}

function validateUserData(request) {

  let validationErrorMessages = [];

  const invalidUserIdInRequestBody = !request.body.userId || request.body.userId != request.params.userId;
  if (invalidUserIdInRequestBody) {
    validationErrorMessages.push('Missing or invalid userId in the request body');
  }

  if (!userSearchesAreValid(request)) {
    validationErrorMessages.push('Searches are not valid - search text is required');
  }

  if(validationErrorMessages.length > 0){
    throw new ValidationError('Submitted user data is not valid', validationErrorMessages);
  }
}

function userSearchesAreValid(request) {
  const searches = request.body.searches;
  if (searches && searches.length > 0) {
    for (let i = 0; i < searches.length; i++) {
      if (!searches[i].text) {
        return false;
      }
    }
  }

  return true;
}

let getUserData = async function (request) {
  userIdTokenValidator.validateUserId(request);

  const userData = await User.findOne({
    userId: request.params.userId
  });

  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    return userData;
  }
}

module.exports = {
  updateUserData: updateUserData,
  createUserData: createUserData,
  getUserData: getUserData
}
