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

const common = require('../../common/config');
const config = common.config();

const constants = require('../../common/constants');

const HttpStatus = require('http-status-codes');

//showdown converter - https://github.com/showdownjs/showdown
const showdown = require('showdown'),
  converter = new showdown.Converter();

//add keycloak middleware
const keycloak = new Keycloak({scope: 'openid'}, config.keycloak);
personalBookmarksRouter.use(keycloak.middleware());

let validateBookmarkInput = function(request, response, bookmark) {

  let validationErrorMessages = [];
  if (bookmark.userId !== request.params.userId) {
    validationErrorMessages.push("The userId of the bookmark does not match the userId parameter");
  }
  if(!bookmark.name) {
    validationErrorMessages.push('Missing required attribute - name');
  }
  if(!bookmark.location) {
    validationErrorMessages.push('Missing required attribute - location');
  }
  if(!bookmark.tags || bookmark.tags.length === 0) {
    validationErrorMessages.push('Missing required attribute - tags');
  }

  if (bookmark.tags.length > constants.MAX_NUMBER_OF_TAGS) {
    validationErrorMessages.push('Too many tags have been submitted - max allowed 8');
  }

  let blockedTags = '';
  for (let i = 0; i < bookmark.tags.length; i++) {
    const tag = bookmark.tags[i];
    if (tag.startsWith('awesome')) {
      blockedTags = blockedTags.concat(' ' + tag);
    }
  }

  if (blockedTags) {
    validationErrorMessages.push('The following tags are blocked:' + blockedTags);
  }

  if (bookmark.description) {
    const descriptionIsTooLong = bookmark.description.length > constants.MAX_NUMBER_OF_CHARS_FOR_DESCRIPTION;
    if (descriptionIsTooLong) {
      validationErrorMessages.push('The description is too long. Only ' + constants.MAX_NUMBER_OF_CHARS_FOR_DESCRIPTION + ' allowed');
    }

    const descriptionHasTooManyLines = bookmark.description.split('\n').length > constants.MAX_NUMBER_OF_LINES_FOR_DESCRIPTION;
    if (descriptionHasTooManyLines) {
      validationErrorMessages.push('The description hast too many lines. Only ' + constants.MAX_NUMBER_OF_LINES_FOR_DESCRIPTION + ' allowed');
    }
  }

  if(validationErrorMessages.length > 0){
      throw new ValidationError('The bookmark you submitted is not valid', validationErrorMessages);
  }
}

/**
 * CREATE bookmark for user
 */
personalBookmarksRouter.post('/', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  const bookmark = bookmarkHelper.buildBookmarkFromRequest(request);

  validateBookmarkInput(request, response, bookmark);

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

  try {
    let newBookmark = await bookmark.save();

    response
      .set('Location', `${config.basicApiUrl}private/${request.params.userId}/bookmarks/${newBookmark.id}`)
      .status(HttpStatus.CREATED)
      .send({response: 'Bookmark created for userId ' + request.params.userId});

  } catch (err) {
    const duplicateKeyinMongoDb = err.name === 'MongoError' && err.code === 11000;
    if (duplicateKeyinMongoDb) {
      return response
        .status(HttpStatus.CONFLICT)
        .send(new AppError(HttpStatus.CONFLICT, 'Duplicate key', [err.message]));
    }
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(err);
  }

}));

/* GET bookmark of user */
personalBookmarksRouter.get('/', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  try {
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
  } catch (err) {
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err);
  }
}));

/* GET tags used by user */
personalBookmarksRouter.get('/tags', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  try {
    const tags = await Bookmark.distinct("tags",
      {
        $or: [
          {userId: request.params.userId},
          {shared: true}
        ]
      }); // sort does not work with distinct in mongoose - https://mongoosejs.com/docs/api.html#query_Query-sort

    response.send(tags);
  } catch (err) {
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err);
  }
}));


/* GET bookmark of user */
personalBookmarksRouter.get('/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateUserId(request);

  try {
    const bookmark = await Bookmark.findOne({
      _id: request.params.bookmarkId,
      userId: request.params.userId
    });

    if (!bookmark) {
      return response
        .status(HttpStatus.NOT_FOUND)
        .send(new AppError(
          'Not Found Error',
          ['Bookmark for user id ' + request.params.userId + ' and bookmark id ' + request.params.bookmarkId + ' not found']
          )
        );
    } else {
      return response.status(HttpStatus.OK).send(bookmark);
    }
  } catch (err) {
    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(new AppError('Unknown server error',
        ['Unknown server error when trying to delete bookmark with id ' + request.params.bookmarkId]));
  }
}));

/**
 * full UPDATE via PUT - that is the whole document is required and will be updated
 * the descriptionHtml parameter is only set in backend, if only does not come front-end (might be an API call)
 */
personalBookmarksRouter.put('/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateIsAdminOrUserId(request);

  const bookmark = bookmarkHelper.buildBookmarkFromRequest(request);

  validateBookmarkInput(request, response, bookmark);

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

  try {
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
      return response
        .status(HttpStatus.NOT_FOUND)
        .send(new AppError(HttpStatus.NOT_FOUND, 'Not Found Error', ['Bookmark for user id ' + request.params.userId + ' and bookmark id ' + request.params.bookmarkId + ' not found']));
    } else {
      return response
        .status(200)
        .send(updatedBookmark);
    }
  } catch (err) {
    if (err.name === 'MongoError' && err.code === 11000) {
      return response
        .status(HttpStatus.CONFLICT)
        .send(new AppError('Duplicate key', [err.message]));
    }
    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(new AppError(HttpStatus.INTERNAL_SERVER_ERROR, 'Unknown Server Error', ['Unknown server error when updating bookmark for user id ' + request.params.userId + ' and bookmark id ' + request.params.bookmarkId]));
  }
}));

/*
* DELETE bookmark for user
*/
personalBookmarksRouter.delete('/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateIsAdminOrUserId(request);

  const bookmarkId = request.params.bookmarkId;
  try {
    const bookmark = await Bookmark.findOneAndRemove({
      _id: bookmarkId,
      userId: request.params.userId
    });

    if (!bookmark) {
      return response
        .status(HttpStatus.NOT_FOUND)
        .send(new AppError(
          HttpStatus.NOT_FOUND,
          'Not Found Error',
          ['Bookmark for user id ' + request.params.userId + ' and bookmark id ' + bookmarkId + ' not found']
          )
        );
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
  } catch (err) {
    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(new AppError(HttpStatus.INTERNAL_SERVER_ERROR, 'Unknown server error',
        ['Unknown server error when trying to delete bookmark with id ' + bookmarkId]));
  }
}));

/*
* DELETE bookmark for user by location
*/
personalBookmarksRouter.delete('/', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  UserIdValidator.validateIsAdminOrUserId(request);

  const location = request.query.location;
  try {
    const bookmark = await Bookmark.findOneAndRemove({
      location: location,
      userId: request.params.userId
    });

    if (!bookmark) {
      return response
        .status(HttpStatus.NOT_FOUND)
        .send(new AppError(
          HttpStatus.NOT_FOUND,
          'Not Found Error',
          ['Bookmark NOT_FOUND for user id ' + request.params.userId + ' and location ' + location]
          )
        );
    }

    return response.status(HttpStatus.NO_CONTENT).send();

  } catch (err) {
    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(new AppError(HttpStatus.INTERNAL_SERVER_ERROR, 'Unknown server error',
        ['Unknown server error when trying to delete bookmark with location ' + location]));
  }
}));

module.exports = personalBookmarksRouter;
