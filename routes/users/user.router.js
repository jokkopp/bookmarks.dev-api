const express = require('express');
const usersRouter = express.Router();
const personalBookmarksRouter = require('./personal-bookmarks');

const Keycloak = require('keycloak-connect');

const AsyncWrapper = require('../../common/async-wrapper');

const UserDataService = require('./user-data.service');

const common = require('../../common/config');
const config = common.config();

const HttpStatus = require('http-status-codes');

//add keycloak middleware
const keycloak = new Keycloak({scope: 'openid'}, config.keycloak);
usersRouter.use(keycloak.middleware());

usersRouter.use('/:userId/bookmarks', personalBookmarksRouter);

/* GET personal bookmarks of the users */
usersRouter.get('/:userId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const userData = await UserDataService.getUserData(request);
  return response.status(HttpStatus.OK).json(userData);
}));

/* GET list of bookmarks to be read later for the user */
usersRouter.get('/:userId/later-reads', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const bookmarks = await UserDataService.getLaterReads(request);
  response.status(HttpStatus.OK).send(bookmarks);
}));

/* GET list of liked bookmarks by the user */
usersRouter.get('/:userId/likes', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const likedBookmarks = await UserDataService.getLikedBookmarks(request);
  response.send(likedBookmarks);
}));

/* GET list of bookmarks for the user's watchedTags */
usersRouter.get('/:userId/watched-tags', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const bookmarks = await UserDataService.getWatchedTags(request);
  response.send(bookmarks);
}));

/* GET list of user's pinned bookmarks */
usersRouter.get('/:userId/pinned', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const pinnedBookmarks = await UserDataService.getPinnedBookmarks(request);
  response.send(pinnedBookmarks);
}));

/* GET list of user's favorite bookmarks */
usersRouter.get('/:userId/favorites', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const favoriteBookmarks = await UserDataService.getFavoriteBookmarks(request);
  response.send(favoriteBookmarks);
}));

/* GET list of user's last visited bookmarks */
usersRouter.get('/:userId/history', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const bookmarksFromHistory = await UserDataService.getBookmarksFromHistory(request);
  response.send(bookmarksFromHistory);
}));

/*
* create user details
* */
usersRouter.post('/:userId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const newUserData = await UserDataService.createUserData(request);
  return response.status(HttpStatus.CREATED).send(newUserData);
}));

/* UPDATE user details
* If users data is not present it will be created (upsert=true)
*
* */
usersRouter.put('/:userId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const userData = await UserDataService.updateUserData(request);
  return response.status(HttpStatus.OK).send(userData);
}));

/*
* DELETE user
*/
usersRouter.delete('/:userId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  await UserDataService.deleteUserData(request);
  return response.status(HttpStatus.NO_CONTENT).send();
}));

/*
* rate bookmark
*/
usersRouter.patch('/:userId/bookmarks/likes/:bookmarkId', keycloak.protect(), AsyncWrapper.wrapAsync(async (request, response) => {
  const bookmark = await UserDataService.rateBookmark(request);
  return response.status(HttpStatus.OK).send(bookmark);
}));

module.exports = usersRouter;
