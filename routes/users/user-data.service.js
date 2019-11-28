const User = require('../../models/user');

const userIdTokenValidator = require('./userid.validator');
const ValidationError = require('../../error/validation.error');
const NotFoundError = require('../../error/not-found.error');

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

  if (validationErrorMessages.length > 0) {
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

let deleteUserData = async function (request) {
  userIdTokenValidator.validateUserId(request);

  const userData = await User.findOneAndRemove({
    userId: request.params.userId
  });

  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    return 'user deleted';
  }
}

let getLaterReads = async function (request) {
  userIdTokenValidator.validateUserId(request);

  const userData = await User.findOne({
    userId: request.params.userId
  });
  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    const bookmarks = await Bookmark.find({"_id": {$in: userData.readLater}});

    return bookmarks;
  }
}

let getLikedBookmarks = async function (request) {
  userIdTokenValidator.validateUserId(request);

  const userData = await User.findOne({
    userId: request.params.userId
  });
  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    const bookmarks = await Bookmark.find({"_id": {$in: userData.likes}});

    return bookmarks;
  }
}

let getWatchedTags = async function (request) {
  userIdTokenValidator.validateUserId(request);
  const userData = await User.findOne({
    userId: request.params.userId
  });
  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    const bookmarks = await Bookmark.find({
      shared: true,
      tags: {$elemMatch: {$in: userData.watchedTags}}
    })
      .sort({createdAt: -1})
      .limit(100)
      .lean()
      .exec();

    return bookmarks;
  }
}

let getPinnedBookmarks = async function (request) {
  userIdTokenValidator.validateUserId(request);

  const userData = await User.findOne({
    userId: request.params.userId
  });
  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    const bookmarks = await Bookmark.find({"_id": {$in: userData.pinned}});
    //we need to order the bookmarks to correspond the one in the userData.pinned array
    const orderedBookmarksAsInPinned = userData.pinned.map(bookmarkId => {
      return bookmarks.filter(bookmark => bookmark._id.toString() === bookmarkId)[0];
    });

    return orderedBookmarksAsInPinned;
  }
}

let getFavoriteBookmarks = async function (request) {
  userIdTokenValidator.validateUserId(request);
  const userData = await User.findOne({
    userId: request.params.userId
  });
  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    const bookmarks = await Bookmark.find({"_id": {$in: userData.favorites}});
    //we need to order the bookmarks to correspond the one in the userData.favorites array
    const orderedBookmarksAsInFavorites = userData.favorites.map(bookmarkId => {
      return bookmarks.filter(bookmark => bookmark._id.toString() === bookmarkId)[0];
    });

    return orderedBookmarksAsInFavorites;
  }
}

let getBookmarksFromHistory = async function (request) {
  userIdTokenValidator.validateUserId(request);

  const userData = await User.findOne({
    userId: request.params.userId
  });
  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    const bookmarks = await Bookmark.find({"_id": {$in: userData.history}});

    //we need to order the bookmarks to correspond the one in the userData.history array
    const orderedBookmarksAsInHistory = userData.history.map(bookmarkId => {
      return bookmarks.filter(bookmark => bookmark._id.toString() === bookmarkId)[0];
    });

    return orderedBookmarksAsInHistory;
  }
}

let rateBookmark = async function (request) {
  userIdTokenValidator.validateUserId(request);

  validateInputForBookmarkRating(request);

  const userData = await User.findOne({
    userId: request.params.userId
  });

  if (!userData) {
    throw new NotFoundError(`User data NOT_FOUND for userId: ${request.params.userId}`);
  } else {
    if (request.body.action === 'LIKE') {
      return await likeBookmark(userData, request);
    } else if (request.body.action === 'UNLIKE') {
      return await dislikeBookmark(userData, request);
    }
  }
}

let validateInputForBookmarkRating = function (request) {
  let validationErrorMessages = [];
  if (request.params.userId !== request.body.ratingUserId) {
    validationErrorMessages.push('The ratingUserId in the request.body must be the same as the userId request parameter');
  }
  if (!request.body.action) {
    validationErrorMessages.push('Missing required attributes - action');
  }
  if (!(request.body.action === 'LIKE' || request.body.action === 'UNLIKE')) {
    validationErrorMessages.push('Invalid value - rating action should be LIKE or UNLIKE');
  }
  if (validationErrorMessages.length > 0) {
    throw new ValidationError('Rating bookmark input is not valid', validationErrorMessages);
  }
}

let likeBookmark = async function (userData, request) {
  if (userData.likes.includes(request.params.bookmarkId)) {
    throw new ValidationError('You already starred this bookmark', ['You already starred this bookmark']);
  } else {

    await User.update(
      {userId: request.params.userId},
      {$push: {likes: request.params.bookmarkId}}
    );

    const bookmark = await Bookmark.findOneAndUpdate({_id: request.params.bookmarkId}, {$inc: {likes: 1}});

    const bookmarkNotFound = !bookmark;
    if (bookmarkNotFound) {
      throw new NotFoundError('Bookmark with bookmark id ' + request.params.bookmarkId + ' not found');
    } else {
      return bookmark;
    }
  }
}

let dislikeBookmark = async function (userData, request) {
  if (!userData.likes.includes(request.params.bookmarkId)) {
    throw new ValidationError('You did not like this bookmark', ['You did not like this bookmark']);
  } else {

    await User.update(
      {userId: request.params.userId},
      {$pull: {likes: request.params.bookmarkId}}
    );

    const bookmark = await Bookmark.findOneAndUpdate({_id: request.params.bookmarkId}, {$inc: {likes: -1}});
    const bookmarkNotFound = !bookmark;
    if (bookmarkNotFound) {
      throw new NotFoundError('Bookmark with bookmark id ' + request.params.bookmarkId + ' not found');
    } else {
      return bookmark;
    }
  }
}

module.exports = {
  updateUserData: updateUserData,
  createUserData: createUserData,
  getUserData: getUserData,
  deleteUserData: deleteUserData,
  getLaterReads: getLaterReads,
  getLikedBookmarks: getLikedBookmarks,
  getWatchedTags: getWatchedTags,
  getPinnedBookmarks: getPinnedBookmarks,
  getFavoriteBookmarks: getFavoriteBookmarks,
  getBookmarksFromHistory: getBookmarksFromHistory,
  rateBookmark: rateBookmark
}
