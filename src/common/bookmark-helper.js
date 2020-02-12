//showdown converter - https://github.com/showdownjs/showdown
const showdown = require('showdown'),
  converter = new showdown.Converter();

const Bookmark = require('../model/bookmark');

module.exports = {
  buildBookmarkFromRequest: function (req) {
    const descriptionHtml = req.body.descriptionHtml ? req.body.descriptionHtml : converter.makeHtml(req.body.description);
    const youtubeVideoId = req.body.youtubeVideoId;
    const stackoverflowQuestionId = req.body.stackoverflowQuestionId;
    const bookmark = new Bookmark({
      _id: req.body._id,
      name: req.body.name,
      location: req.body.location,
      language: req.body.language,
      description: req.body.description,
      descriptionHtml: descriptionHtml,
      category: req.body.category,
      tags: req.body.tags,
      publishedOn: req.body.publishedOn,
      githubURL: req.body.githubURL,
      userId: req.body.userId || req.params.userId,
      public: req.body.public,
      lastAccessedAt: req.body.lastAccessedAt,
      likes: req.body.likes,
      youtubeVideoId: youtubeVideoId ? youtubeVideoId : null,
      stackoverflowQuestionId: stackoverflowQuestionId ? stackoverflowQuestionId : null
    });

    return bookmark;
  }

}
