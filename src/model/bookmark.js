const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const bookmarkSchema = new Schema({
    name: {type:String, required: true},
    location: {type:String, required: true},
    description: String,
    descriptionHtml: String,
    category: {type:String},
    tags: [String],
    publishedOn: Date,
    githubURL: {type:String},
    userId: {type: String, ref:'User'},
    public: Boolean,
    language: String,
    lastAccessedAt: Date,
    likeCount: Number,
    ownerVisitCount: {type:Number, select: false},
    youtubeVideoId: {type:String, required: false},
    stackoverflowQuestionId: {type:String, required: false},
    __v: { type: Number, select: false}
},
{
  timestamps: true
});

module.exports = mongoose.model('Bookmark', bookmarkSchema);
