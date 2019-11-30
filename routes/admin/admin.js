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
const AdminService = require('./admin.service');

const HttpStatus = require('http-status-codes');

const AsyncWrapper = require('../../common/async-wrapper');

//showdown converter - https://github.com/showdownjs/showdown
const showdown = require('showdown'),
  converter = new showdown.Converter();

//add keycloak middleware
const keycloak = new Keycloak({scope: 'openid'}, config.keycloak);
adminRouter.use(keycloak.middleware());


/* GET all bookmarks */
adminRouter.get('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {
  const isPublic = request.query.public === 'true';
  const {location, userId} = request.query;

  const bookmarks = await AdminService.getBookmarksWithFilter(isPublic, location, userId);
  response.send(bookmarks);
}));


adminRouter.get('/tags', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {
  const tags = await AdminService.getTagsOrderByNumberDesc();

  response.send(tags);
}));


/**
 * Returns the bookmarks added recently.
 *
 * The since query parameter is a timestamp which specifies the date since we want to look forward to present time.
 * If this parameter is present it has priority. If it is not present, we might specify the number of days to look back via
 * the query parameter numberOfDays. If not present it defaults to 7 days, last week.
 *
 */
adminRouter.get('/bookmarks/latest-entries', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response, next) => {
  if (request.query.since) {
    const fromDate = new Date(parseFloat(request.query.since, 0));
    const toDate = request.query.to ? new Date(parseFloat(request.query.to, 0)) : new Date();
    const bookmarks = await AdminService.getLatestBookmarksBetweenDates(fromDate, toDate);

    response.send(bookmarks);
  } else {
    next();
  }
}));

adminRouter.get('/bookmarks/latest-entries', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {
  const daysBack = request.query.days ? request.query.days : 7;
  const bookmarks = await AdminService.getLatestBookmarksWithDaysBack(daysBack);

  response.send(bookmarks);
}));

/* GET bookmark by id */
adminRouter.get('/bookmarks/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  const bookmark = await Bookmark.findOne({
    _id: request.params.bookmarkId
  });

  if (!bookmark) {
    throw new NotFoundError(`Bookmark NOT_FOUND with id:${request.params.bookmarkId}`);
  } else {
    response.status(HttpStatus.OK).send(bookmark);
  }
}));

/**
 * create bookmark
 */
adminRouter.post('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {

  const bookmark = bookmarkHelper.buildBookmarkFromRequest(request);

  BookmarkInputValidator.validateBookmarkInputForAdmin(bookmark);

  await BookmarkInputValidator.verifyPublicBookmarkExistenceOnCreation(bookmark);

  let newBookmark = await bookmark.save();

  response
    .set('Location', `${config.basicApiUrl}private/${request.params.userId}/bookmarks/${newBookmark.id}`)
    .status(HttpStatus.CREATED)
    .send({response: 'Bookmark created for userId ' + request.params.userId});

}));


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


module.exports = adminRouter;
