'use strict';Object.defineProperty(exports, "__esModule", { value: true });var _es6Promise = require('es6-promise');var _nodeFetch = require('node-fetch');var _nodeFetch2 = _interopRequireDefault(_nodeFetch);function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };} /**
                                                                                                                                                                                                                                                                                                               * Copyright 2015 aixigo AG
                                                                                                                                                                                                                                                                                                               * Released under the MIT license.
                                                                                                                                                                                                                                                                                                               */



var TWO_HOURS = 2 * 60 * 60 * 1000;exports.default = 

function () {var maxAgeMs = arguments.length <= 0 || arguments[0] === undefined ? TWO_HOURS : arguments[0];

   var stillValid = function stillValid(_ref) {var timestamp = _ref.timestamp;return timestamp > Date.now() - maxAgeMs;};

   var cache = {};

   var api = { 
      getText: function getText(url, headers) {
         if (maxAgeMs > 0) {
            var cacheEntry = cache[url];
            if (cacheEntry && stillValid(cacheEntry)) {
               return _es6Promise.Promise.resolve(cacheEntry.responseData);}}



         return (0, _nodeFetch2.default)(url, { headers: headers || {} }).
         then(function (response) {
            if (['4', '5'].indexOf(('' + response.status).charAt(0)) > -1) {
               return _es6Promise.Promise.reject(response);}

            return response.text();}).

         then(function (responseData) {
            if (maxAgeMs > 0) {
               cache[url] = { responseData: responseData, timestamp: Date.now() };}

            return responseData;});}, 


      getJson: function getJson(url, headers) {return api.getText(url, headers).then(function (text) {return text ? JSON.parse(text) : null;});}, 
      clearCache: function clearCache() {return cache = {};} };


   return api;};
//# sourceMappingURL=/Users/awilden/work/laxar/changelog-viewer-server/lib/cached_fetch.js.map