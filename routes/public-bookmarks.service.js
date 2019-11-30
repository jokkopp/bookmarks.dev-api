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
const superagent = require('superagent');

const MAX_NUMBER_RETURNED_RESULTS = 100;

let getBookmarkByLocation = async (location) => {
  const bookmark = await Bookmark.findOne({
    'shared': true,
    location: location
  }).lean().exec();
  if (!bookmark) {
    throw new NotFoundError(`Bookmark NOT_FOUND for location: ${location}`);
  }
  return bookmark;
}

let getLatestBookmarks = async () => {
  const bookmarks = await Bookmark.find({'shared': true})
    .sort({createdAt: -1})
    .limit(MAX_NUMBER_RETURNED_RESULTS)
    .lean().exec();

  return bookmarks;
}

let getBookmarksForTag = async (tag, orderByFilter) => {
  const bookmarks = await Bookmark.find({
    shared: true,
    tags: tag
  })
    .sort(orderByFilter)
    .limit(MAX_NUMBER_RETURNED_RESULTS)
    .lean()
    .exec();

  return bookmarks;

};

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
let getBookmarkById = async function (bookmarkId) {
  const bookmark = await Bookmark.findById(bookmarkId);
  if (!bookmark) {
    throw new NotFoundError(`Bookmakr data NOT_FOUND for id: ${request.params.userId}`);
  }
  return bookmark;
};


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


module.exports = {
  getBookmarkByLocation: getBookmarkByLocation,
  getLatestBookmarks: getLatestBookmarks,
  getBookmarksForTag: getBookmarksForTag,
  getBookmarkById: getBookmarkById
};
