const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const apiBasePathRouter = require('./routes/index');
const versionRouter = require('./routes/version');
const usersRouter = require('./routes/users/users');
const adminRouter = require('./routes/admin/admin');
const publicBookmarksRouter = require('./routes/public-bookmarks');
const AppError = require('./models/error');
const ValidationError = require('./models/validation.error');
const UseridTokenValidationError = require('./routes/users/userid-validation.error');

const MyError = require('./models/myerror');

const fs = require('fs-extra');
const rfs = require('rotating-file-stream');

const HttpStatus = require('http-status-codes');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./docs/swagger.yaml');

const app = express();

const mongoUserName = process.env.MONGODB_BOOKMARKS_USERNAME || 'bookmarks';
const mongoUserPwd = process.env.MONGODB_BOOKMARKS_PASSWORD || 'secret';
const mongoBookmarksCollectionName = process.env.MONGODB_BOOKMARKS_COLLECTION || 'dev-bookmarks';
const mongoHost = process.env.MONGODB_HOST || 'localhost';
const mongoPort = process.env.MONGODB_PORT || '27017';

const mongooseConnectOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false
};

const mongoUrl = `mongodb://${mongoUserName}:${mongoUserPwd}@${mongoHost}:${mongoPort}/${mongoBookmarksCollectionName}`;
mongoose.connect(mongoUrl, mongooseConnectOptions);

// sets port 3000 to default or unless otherwise specified in the environment
app.set('port', process.env.PORT || 3000);

let setUpLogging = function () {
  const logDirectory = (process.env.CONTAINER_HOME || '.') + '/log';
  // ensure log directory exists
  fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);
  // create a rotating write stream
  let accessLogStream = rfs('access.log', {
    interval: '1d', // rotate daily
    path: logDirectory
  })
  app.use(logger('combined', {stream: accessLogStream}));// logs in file in Apache style format
  app.use(logger('dev'));// logs at the console in 'dev' format
};

setUpLogging();

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));//swagger docs are not protected

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//add CORS support
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Location');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Authorization, Location');
  next();
});


app.use('/api', apiBasePathRouter);
app.use('/api/version', versionRouter);
app.use('/api/public/bookmarks', publicBookmarksRouter);
app.use('/api/personal/users', usersRouter);
app.use('/api/admin', adminRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  const err = new Error('Not Found');
  err.status = HttpStatus.NOT_FOUND;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res) {
    res.status(err.status || HttpStatus.INTERNAL_SERVER_ERROR);
    res.render({
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }
  if (err instanceof UseridTokenValidationError) {
    res.status(HttpStatus.UNAUTHORIZED);
    return res.send({
      httpStatus: HttpStatus.UNAUTHORIZED,
      message: err.message
    });
  } else if (err instanceof ValidationError) {
    res.status(HttpStatus.BAD_REQUEST);
    return res.send(err);
  } else {
    res.status(err.status || HttpStatus.INTERNAL_SERVER_ERROR);
    res.send({
      message: err.message,
      error: {}
    });
  }

});

module.exports = app;
