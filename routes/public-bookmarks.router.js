var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var router = express.Router();
var Bookmark = require('../model/bookmark');
var HttpStatus = require('http-status-codes');
const constants = require('../common/constants');

const AsyncWrapper = require('../common/async-wrapper');
const NotFoundError = require('../error/not-found.error');

const bookmarksSearchService = require('../common/bookmarks-search.service');
const PublicBookmarksService = require('./public-bookmarks.service');

const superagent = require('superagent');

const MAX_NUMBER_RETURNED_RESULTS = 100;

/**
 *  Returns the with query text
 */
router.get('/', AsyncWrapper.wrapAsync(async (request, response, next) => {
  const searchText = request.query.q;
  const limit = parseInt(request.query.limit);
  if (searchText) {
    const bookmarks = await bookmarksSearchService.findBookmarks(searchText, limit, constants.DOMAIN_PUBLIC, null);
    response.send(bookmarks);
  } else {
    next()
  }
}));

/**
 * Get Bookmark by location
 */
router.get('/', AsyncWrapper.wrapAsync(async (request, response, next) => {
  const location = request.query.location;
  if (location) {
    const bookmark = await PublicBookmarksService.getBookmarkByLocation(location);

    return response.send(bookmark);
  } else {
    next()
  }
}));

/**
 * When no filter send latest public bookmarks
 */
router.get('/', AsyncWrapper.wrapAsync(async (request, response) => {
  const bookmarks = await PublicBookmarksService.getLatestBookmarks();

  return response.send(bookmarks);
}));

router.get('/tagged/:tag', AsyncWrapper.wrapAsync(async (request, response) => {
  const orderByFilter = request.query.orderBy === 'STARS' ? {likes: -1} : {createdAt: -1};
  const bookmarks = await PublicBookmarksService.getBookmarksForTag(request.params.tag, orderByFilter);

  return response.send(bookmarks);
}));

/**
 * Convert youtube api duration format "PT6M10S" to 6m, "PT2H18M43S" to 2h:18min
 * @param duration
 * @returns {null}
 */
function formatDuration(duration) {
  duration = duration.substring(2); // get rid of 'PT'
  if (duration.indexOf('M') >= 0 && duration.indexOf('H') == -1) {
    return duration.substring(0, duration.indexOf('M')) + 'min';
  }

  if (duration.indexOf('M') >= 0 && duration.indexOf('H') >= 0) {
    const hours = duration.substring(0, duration.indexOf('H')) + 'h';
    const minutes = duration.substring(duration.indexOf('H') + 1, duration.indexOf('M')) + 'min';
    return hours + ':' + minutes;
  }

  return null;
}


/* GET title of bookmark given its url */
router.get('/scrape', function (req, res) {
  if (req.query.url) {
    const bookmarkUrl = req.query.url;
    request(bookmarkUrl, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        const $ = cheerio.load(body);
        const webpageTitle = $("title").text();
        const metaDescription = $('meta[name=description]').attr("content");
        let webpage = {
          title: webpageTitle,
          metaDescription: metaDescription,
          publishedOn: '',
          videoDuration: null
        }
        let youtubeVideoId = req.query.youtubeVideoId;

        if (youtubeVideoId !== 'null') {
          superagent
            .get('https://www.googleapis.com/youtube/v3/videos')
            .query({id: youtubeVideoId})
            .query({key: process.env.YOUTUBE_API_KEY || "change-me-with-a-valid-youtube-key-if-you-need-me"}) //used only when adding youtube videos
            .query({part: 'snippet,contentDetails,statistics,status'})
            .then(response => {
              const publishedAt = response.body.items[0].snippet.publishedAt;
              webpage.publishedOn = publishedAt.substring(0, publishedAt.indexOf('T'));
              webpage.videoDuration = formatDuration(response.body.items[0].contentDetails.duration);
              if (webpage.title.endsWith('- YouTube')) {
                webpage.title = webpageTitle.replace('- YouTube', ' - ' + webpage.videoDuration);
              } else {
                webpage.title = webpageTitle + ' - ' + webpage.videoDuration;
              }
              res.send(webpage);
            })
            .catch(err => {
              console.error(err);
            });
        } else {
          res.send(webpage);
        }
      }
    });
  }
});

/* GET bookmark by id. */
router.get('/:id', AsyncWrapper.wrapAsync(async function (request, response) {
  const bookmark = await PublicBookmarksService.getBookmarkById(request.params.id);
  response.send(bookmark);
}));


/* TODO - maybe implement later advancedSearch */
router.get('/advanced-search', function (req, res) {
  var regexSearch = [];
  if (req.query.name) {
    var regExpName = new RegExp(req.query.category, 'i');
    regexSearch.push({'name': {$regex: regExpName}});
    regexSearch.push({'description': {$regex: regExpName}});
  }
  if (req.query.category) {
    var regExpCategory = new RegExp(req.query.category, 'i');
    regexSearch.push({'category': {$regex: regExpCategory}});
  }
  if (req.query.tag) {
    var regExpTag = new RegExp(req.query.tag, 'i');
    regexSearch.push({'tags': {$regex: regExpTag}});
  }
  if (regexSearch.length > 0) {
    Bookmark.find().or(regexSearch, function (err, bookmarks) {
      if (err) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err);
      }
      res.send(bookmarks);
    });
  } else {//no filter - all bookmarks
    Bookmark.find({}, function (err, bookmarks) {
      if (err) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err);
      }
      res.send(bookmarks);
    });
  }

});


module.exports = router;
