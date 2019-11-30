const express = require('express');
const adminRouter = express.Router();

const Keycloak = require('keycloak-connect');

const Bookmark = require('../../model/bookmark');
const bookmarkHelper = require('../../common/bookmark-helper');
const NotFoundError = require('../../error/not-found.error');
const ValidationError = require('../../error/validation.error');

const common = require('../../common/config');
const config = common.config();
const BookmarkInputValidator = require('../../common/bookmark-input.validator');

const HttpStatus = require('http-status-codes');

const AsyncWrapper = require('../../common/async-wrapper');

//showdown converter - https://github.com/showdownjs/showdown
const showdown = require('showdown'),
  converter = new showdown.Converter();

//add keycloak middleware
const keycloak = new Keycloak({scope: 'openid'}, config.keycloak);
adminRouter.use(keycloak.middleware());


/* GET all bookmarks */
let getBookmarksWithFilter = async (isPublic, location, userId) => {

  let filter = {};
  if (isPublic) {
    filter.shared = true;
  }
  if (location) {
    filter.location = location;
  }
  if (userId) {
    filter.userId = userId;
  }
  const bookmarks = await Bookmark.find(filter).sort({createdAt: -1}).lean().exec();

  return bookmarks;
};


let getTagsOrderByNumberDesc = async () => {
  const tags = await Bookmark.aggregate(
    [
      {$match: {shared: true}},
      {$project: {"tags": 1}},
      {$unwind: "$tags"},
      {$group: {"_id": "$tags", "count": {"$sum": 1}}},
      {$sort: {count: -1}}
    ]
  );

  return tags;

};


/**
 * Returns the bookmarks added recently.
 *
 * The since query parameter is a timestamp which specifies the date since we want to look forward to present time.
 * If this parameter is present it has priority. If it is not present, we might specify the number of days to look back via
 * the query parameter numberOfDays. If not present it defaults to 7 days, last week.
 *
 */
let getLatestBookmarksBetweenDates = async (fromDate, toDate) => {

  if (fromDate > toDate) {
    throw new ValidationError('timing query parameters values', ['<Since> param value must be before <to> parameter value']);
  }
  const bookmarks = await Bookmark.find(
    {
      'shared': true,
      createdAt: {
        $gte: fromDate,
        $lte: toDate
      }
    }
  ).sort({createdAt: 'desc'}).lean().exec();

  return bookmarks;
}

let getLatestBookmarksWithDaysBack = async (daysBack) => {

  const bookmarks = await Bookmark.find(
    {
      'shared': true,
      createdAt: {$gte: new Date((new Date().getTime() - (daysBack * 24 * 60 * 60 * 1000)))}
    }
  ).sort({createdAt: 'desc'}).lean().exec();

  return bookmarks;
}

/* GET bookmark by id */
let getBookmarkById = async (bookmarkId) => {
  const bookmark = await Bookmark.findOne({
    _id: bookmarkId
  });

  if (!bookmark) {
    throw new NotFoundError(`Bookmark NOT_FOUND with id:${bookmarkId}`);
  } else {
    return bookmark;
  }
};

/**
 * create bookmark
 */
let createBookmark = async (bookmark) => {

  BookmarkInputValidator.validateBookmarkInputForAdmin(bookmark);

  await BookmarkInputValidator.verifyPublicBookmarkExistenceOnCreation(bookmark);

  let newBookmark = await bookmark.save();

  return newBookmark;

};


/**
 * full UPDATE via PUT - that is the whole document is required and will be updated
 * the descriptionHtml parameter is only set in backend, if only does not come front-end (might be an API call)
 */
adminRouter.put('/bookmarks/:bookmarkId', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {

  const bookmark = bookmarkHelper.buildBookmarkFromRequest(request);

  BookmarkInputValidator.validateBookmarkInputForAdmin(bookmark);

  await BookmarkInputValidator.verifyPublicBookmarkExistenceOnUpdate(bookmark, bookmark.userId);

  const updatedBookmark = await Bookmark.findOneAndUpdate(
    {
      _id: request.params.bookmarkId
    },
    bookmark,
    {new: true}
  );

  const bookmarkNotFound = !updatedBookmark;
  if (bookmarkNotFound) {
    throw new NotFoundError('Bookmark with the id ' + request.params.bookmarkId + ' not found');
  } else {
    return response.status(HttpStatus.OK).send(updatedBookmark);
  }
}));

/*
* DELETE bookmark for by bookmarkId
*/
adminRouter.delete('/bookmarks/:bookmarkId', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {
  const bookmark = await Bookmark.findOneAndRemove({
    _id: request.params.bookmarkId
  });

  if (!bookmark) {
    throw new NotFoundError(`Bookmark NOT_FOUND with id:${request.params.bookmarkId}`);
  } else {
    response.status(HttpStatus.NO_CONTENT).send('Bookmark successfully deleted');
  }
}));

/*
* DELETE bookmarks with location
*/
adminRouter.delete('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response, next) => {
  if (request.query.location) {
    await Bookmark.deleteMany({location: request.query.location});

    return response.status(HttpStatus.NO_CONTENT).send();
  } else {
    next();
  }
}));

/**
 * Delete bookmarks of a user, identified by userId
 */
adminRouter.delete('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response, next) => {
  if (request.query.userId) {
    await Bookmark.deleteMany({userId: request.query.userId});

    return response.status(HttpStatus.NO_CONTENT).send();
  } else {
    next();
  }
}));

adminRouter.delete('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {
  return response
    .status(HttpStatus.BAD_REQUEST)
    .send({message: 'You can either delete bookmarks by location or userId - at least one of them mandatory'});
}));


module.exports = {
  getBookmarksWithFilter: getBookmarksWithFilter,
  getTagsOrderByNumberDesc: getTagsOrderByNumberDesc,
  getLatestBookmarksBetweenDates: getLatestBookmarksBetweenDates,
  getLatestBookmarksWithDaysBack: getLatestBookmarksWithDaysBack,
  getBookmarkById: getBookmarkById,
  createBookmark: createBookmark
};
