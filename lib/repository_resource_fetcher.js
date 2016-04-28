'use strict';Object.defineProperty(exports, "__esModule", { value: true });var _es6Promise = require('es6-promise');var _fsPromise = require('fs-promise');var _fsPromise2 = _interopRequireDefault(_fsPromise);var _path = require('path');var _path2 = _interopRequireDefault(_path);var _sanitizeFilename = require('sanitize-filename');var _sanitizeFilename2 = _interopRequireDefault(_sanitizeFilename);var _sha = require('sha1');var _sha2 = _interopRequireDefault(_sha);var _cached_fetch = require('./cached_fetch');var _cached_fetch2 = _interopRequireDefault(_cached_fetch);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };} /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           * Copyright 2016 aixigo AG
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           * Released under the MIT license.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           */exports.default = 







function (logger, _ref) {var resourceCachePath = _ref.resourceCachePath;var _cachedFetch = 

   (0, _cached_fetch2.default)(0);var getText = _cachedFetch.getText;

   var memCache = {};

   return { 
      fetch: function fetch(repository, url) {var headers = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];
         var filename = cacheFileName(repository, url);

         var cacheData = memCache[filename];
         if (cacheData && cacheData.cacheHash === repository.cacheHash) {
            logger.verbose('FROM CACHE (memory): ' + url);
            return _es6Promise.Promise.resolve(cacheData.data);}


         return _fsPromise2.default.exists(filename).
         then(function (exists) {
            if (!exists) {
               return null;}


            return _fsPromise2.default.readFile(filename).
            then(function (string) {return JSON.parse(string);}).
            then(function (cacheData) {
               if (cacheData.cacheHash !== repository.cacheHash) {
                  return null;}


               logger.verbose('FROM CACHE (file): ' + url);
               memCache[filename] = cacheData;
               return cacheData.data;});}).


         then(function (data) {
            if (data != null) {
               return data;}


            logger.verbose('FETCHING: ' + url);

            return getText(url, headers).
            then(function (data) {
               memCache[filename] = { 
                  url: url, 
                  cacheHash: repository.cacheHash, 
                  data: data };

               return _fsPromise2.default.writeFile(filename, JSON.stringify(memCache[filename], null, 2)).
               then(function () {return data;});});});} };





   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function cacheFileName(repository, url) {
      var sanitizedCacheFile = (0, _sanitizeFilename2.default)(repository.organization + '_' + repository.name + '_' + (0, _sha2.default)(url));
      return _path2.default.join(resourceCachePath, sanitizedCacheFile);}};
//# sourceMappingURL=/Users/awilden/work/laxar/changelog-viewer-server/lib/repository_resource_fetcher.js.map