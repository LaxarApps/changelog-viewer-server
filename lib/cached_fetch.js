/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
   value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _es6Promise = require('es6-promise');

var _nodeFetch = require('node-fetch');

var _nodeFetch2 = _interopRequireDefault(_nodeFetch);

var TWO_HOURS = 2 * 60 * 60 * 1000;

exports['default'] = function () {
   var maxAgeMs = arguments.length <= 0 || arguments[0] === undefined ? TWO_HOURS : arguments[0];

   var now = function now() {
      return new Date().getTime();
   };
   var stillValid = function stillValid(_ref) {
      var timestamp = _ref.timestamp;
      return timestamp > now() - maxAgeMs;
   };

   var cache = {};

   var api = {
      getText: function getText(url, headers) {
         var cacheEntry = cache[url];
         if (cacheEntry && stillValid(cacheEntry)) {
            return _es6Promise.Promise.resolve(cacheEntry.responseData);
         }

         return (0, _nodeFetch2['default'])(url, { headers: headers || {} }).then(function (response) {
            if (['4', '5'].indexOf(('' + response.status).charAt(0)) > -1) {
               return null;
            }
            return response.text();
         }).then(function (responseData) {
            cache[url] = { responseData: responseData, timestamp: now() };
            return responseData;
         });
      },
      getJson: function getJson(url, headers) {
         return api.getText(url, headers).then(function (text) {
            return text ? JSON.parse(text) : null;
         });
      },
      clearCache: function clearCache() {
         return cache = {};
      }
   };

   return api;
};

module.exports = exports['default'];

//# sourceMappingURL=cached_fetch.js.map