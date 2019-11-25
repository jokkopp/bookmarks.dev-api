const express = require('express');
const adminRouter = express.Router();

const Keycloak = require('keycloak-connect');

const Bookmark = require('../../models/bookmark');
const bookmarkHelper = require('../../common/bookmark-helper');
const AppError = require('../../models/error');
const NotFoundError = require('../../models/not-found.error');

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
adminRouter.get('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {
  let bookmarks;
  let filter = {};
  if (request.query.public === 'true') {
    filter.shared = true;
  }
  if (request.query.location) {
    filter.location = request.query.location;
  }
  if (request.query.userId) {
    filter.userId = request.query.userId;
  }
  bookmarks = await Bookmark.find(filter).sort({createdAt: -1}).lean().exec();

  response.send(bookmarks);
}));


adminRouter.get('/tags', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {
  const tags = await Bookmark.aggregate(
    [
      {$match: {shared: true}},
      {$project: {"tags": 1}},
      {$unwind: "$tags"},
      {$group: {"_id": "$tags", "count": {"$sum": 1}}},
      {$sort: {count: -1}}
    ]
  );

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
adminRouter.get('/bookmarks/latest-entries', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (req, res) => {
  if (req.query.since) {
    const fromDate = new Date(parseFloat(req.query.since, 0));
    const toDate = req.query.to ? new Date(parseFloat(req.query.to, 0)) : new Date();
    if (fromDate > toDate) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(new AppError(HttpStatus.BAD_REQUEST, 'timing query parameters values', ['<Since> param value must be before <to> parameter value']));
    }
    const bookmarks = await Bookmark.find(
      {
        'shared': true,
        createdAt: {
          $gte: fromDate,
          $lte: toDate
        }

      }).sort({createdAt: 'desc'}).lean().exec();

    res.send(bookmarks);
  } else {
    const numberOfDaysToLookBack = req.query.days ? req.query.days : 7;

    const bookmarks = await Bookmark.find(
      {
        'shared': true,
        createdAt: {$gte: new Date((new Date().getTime() - (numberOfDaysToLookBack * 24 * 60 * 60 * 1000)))}
      }).sort({createdAt: 'desc'}).lean().exec();

    res.send(bookmarks);
  }
}));

/* GET bookmark by id */
adminRouter.get('/bookmarks/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {

  const bookmark = await Bookmark.findOne({
    _id: request.params.bookmarkId
  });

  if (!bookmark) {
    return response
      .status(HttpStatus.NOT_FOUND)
      .send(new AppError(
        HttpStatus.NOT_FOUND,
        'Not Found Error',
        ['Bookmark for user id ' + request.params.userId + ' and bookmark id ' + request.params.bookmarkId + ' not found']
        )
      );
  } else {
    response.status(HttpStatus.OK).send(bookmark);
  }
}));

/**
 * create bookmark
 */
adminRouter.post('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {

  const bookmark = bookmarkHelper.buildBookmarkFromRequest(request);

  BookmarkInputValidator.validateBookmarkInputForAdmin(request, response, bookmark);

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

  BookmarkInputValidator.validateBookmarkInputForAdmin(request, response, bookmark);

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
    _id: request.params.bookmarkId,
  });

  if (!bookmark) {
    return response
      .status(HttpStatus.NOT_FOUND)
      .send(new AppError(
        HttpStatus.NOT_FOUND,
        'Not Found Error',
        ['Bookmark for user id ' + request.params.userId + ' and bookmark id ' + request.params.bookmarkId + ' not found']
        )
      );
  } else {
    response.status(HttpStatus.NO_CONTENT).send('Bookmark successfully deleted');
  }
}));

/*
* DELETE bookmarks
* either by providing the location (for example to clean up spam)
* or userId (deletes all bookmarks submitted by the user)
*
* TO DO - assign to next for next deletion, instead of the filte logic - is cleaner
*/
adminRouter.delete('/bookmarks', keycloak.protect('realm:ROLE_ADMIN'), AsyncWrapper.wrapAsync(async (request, response) => {

  let filter = {};
  if (request.query.location) {
    filter.location = request.query.location;
  }
  if (request.query.userId) {
    filter.userId = request.query.userId;
  }
  if (filter === {}) {
    return response
      .status(HttpStatus.BAD_REQUEST)
      .send(new AppError(HttpStatus.BAD_REQUEST, 'You can either delete bookmarks by location or userId - at least one of them mandatory',
        ['You can either delete bookmarks by location or userId - at least one of them mandatory']));
  }

  await Bookmark.deleteMany(filter);
  response.status(HttpStatus.NO_CONTENT).send('Bookmarks successfully deleted');
}));


module.exports = adminRouter;
