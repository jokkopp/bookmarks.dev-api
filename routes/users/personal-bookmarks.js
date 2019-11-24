const express = require('express');
const personalBookmarksRouter = express.Router({mergeParams: true});
const Keycloak = require('keycloak-connect');
const Token = require('keycloak-connect/middleware/auth-utils/token');

const Bookmark = require('../../models/bookmark');
const User = require('../../models/user');
const bookmarkHelper = require('../../common/bookmark-helper');
const bookmarksSearchService = require('../../common/bookmarks-search.service');
const UserIdValidator = require('./userid.validator');
const AsyncWrapper = require('../../common/async-wrapper');

const AppError = require('../../models/error');
const ValidationError = require('../../models/validation.error');
const NotFoundError = require('../../models/not-found.error');

const common = require('../../common/config');
const config = common.config();

const constants = require('../../common/constants');
const BookmarkInputValidator = require('../../common/bookmark-input.validator');

const HttpStatus = require('http-status-codes');

//showdown converter - https://github.com/showdownjs/showdown
const showdown = require('showdown'),
  converter = new showdown.Converter();

//add keycloak middleware
const keycloak = new Keycloak({scope: 'openid'}, config.keycloak);
personalBookmarksRouter.use(keycloak.middleware());


/**
 * CREATE bookmark for user
 */
personalBookmarksRouter.post('/', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  const bookmark = bookmarkHelper.buildBookmarkFromRequest(request);

  BookmarkInputValidator.validateBookmarkInput(request, response, bookmark);

  if (bookmark.shared) {
    const existingBookmark = await Bookmark.findOne({
      shared: true,
      location: bookmark.location
    }).lean().exec();
    if (existingBookmark) {
      return response
        .status(HttpStatus.CONFLICT)
        .send(new AppError(HttpStatus.CONFLICT, 'A public bookmark with this location is already present',
          ['A public bookmark with this location is already present']));
    }
  }

  let newBookmark = await bookmark.save();

  response
    .set('Location', `${config.basicApiUrl}private/${request.params.userId}/bookmarks/${newBookmark.id}`)
    .status(HttpStatus.CREATED)
    .send({response: 'Bookmark created for userId ' + request.params.userId});

}));

/* GET bookmark of user */
personalBookmarksRouter.get('/', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  const searchText = request.query.q;
  const limit = parseInt(request.query.limit);

  if (searchText) {
    const bookmarks = await bookmarksSearchService.findBookmarks(searchText, limit, constants.DOMAIN_PERSONAL, request.params.userId);

    return response.send(bookmarks);
  } else if (request.query.location) {
    const bookmark = await Bookmark.findOne({
      userId: request.params.userId,
      location: request.query.location
    }).lean().exec();
    if (!bookmark) {
      return response.status(HttpStatus.NOT_FOUND).send("Bookmark not found");
    }
    return response.send(bookmark);
  } else {//no filter - latest bookmarks added to the platform
    const bookmarks = await Bookmark.find({userId: request.params.userId})
      .sort({lastAccessedAt: -1})
      .limit(100);

    return response.send(bookmarks);
  }

}));

/* GET tags used by user */
personalBookmarksRouter.get('/tags', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  const tags = await Bookmark.distinct("tags",
    {
      $or: [
        {userId: request.params.userId},
        {shared: true}
      ]
    }); // sort does not work with distinct in mongoose - https://mongoosejs.com/docs/api.html#query_Query-sort

  response.send(tags);
}));


/* GET bookmark of user */
personalBookmarksRouter.get('/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  const bookmark = await Bookmark.findOne({
    _id: request.params.bookmarkId,
    userId: request.params.userId
  });

  if (!bookmark) {
    throw new NotFoundError(`Bookmark NOT_FOUND the userId: ${request.params.userId} AND id: ${request.params.bookmarkId}`);
  } else {
    return response.status(HttpStatus.OK).send(bookmark);
  }
}));

/**
 * full UPDATE via PUT - that is the whole document is required and will be updated
 * the descriptionHtml parameter is only set in backend, if only does not come front-end (might be an API call)
 */
personalBookmarksRouter.put('/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateIsAdminOrUserId(request);

  const bookmark = bookmarkHelper.buildBookmarkFromRequest(request);

  BookmarkInputValidator.validateBookmarkInput(request, response, bookmark);

  if (request.body.shared) {
    const existingBookmark = await Bookmark.findOne({
      shared: true,
      location: request.body.location,
      userId: {$ne: request.params.userId}
    }).lean().exec();
    if (existingBookmark) {
      return response
        .status(HttpStatus.CONFLICT)
        .send(new AppError(HttpStatus.CONFLICT, 'A public bookmark with this location is already present',
          ['A public bookmark with this location is already present']));
    }
  }
  const updatedBookmark = await Bookmark.findOneAndUpdate(
    {
      _id: request.params.bookmarkId,
      userId: request.params.userId
    },
    bookmark,
    {new: true}
  );

  const bookmarkNotFound = !updatedBookmark;
  if (bookmarkNotFound) {
    throw new NotFoundError('Bookmark NOT_FOUND the id: ' + request.params.bookmarkId + ' AND location: ' + bookmark.location);
  } else {
    return response
      .status(HttpStatus.OK)
      .send(updatedBookmark);
  }
}));

/*
* DELETE bookmark for user
*/
personalBookmarksRouter.delete('/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateIsAdminOrUserId(request);

  const bookmarkId = request.params.bookmarkId;
  const bookmark = await Bookmark.findOneAndRemove({
    _id: bookmarkId,
    userId: request.params.userId
  });

  if (!bookmark) {
    throw new NotFoundError('Bookmark NOT_FOUND the id: ' + request.params.bookmarkId);
  } else {
    await User.update(
      {},
      {
        $pull: {
          readLater: bookmarkId,
          likes: bookmarkId,
          pinned: bookmarkId,
          history: bookmarkId,
          favorites: bookmarkId
        }
      },
      {multi: true}
    );

    return response.status(HttpStatus.NO_CONTENT).send();
  }

}));

/*
* DELETE bookmark for user by location
*/
personalBookmarksRouter.delete('/', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateIsAdminOrUserId(request);

  const location = request.query.location;
  const bookmark = await Bookmark.findOneAndRemove({
    location: location,
    userId: request.params.userId
  });

  if (!bookmark) {
    throw new NotFoundError(`Bookmark NOT_FOUND the userId: ${request.params.userId} AND location: ${location}`);
  }

  return response.status(HttpStatus.NO_CONTENT).send();
}));

module.exports = personalBookmarksRouter;
