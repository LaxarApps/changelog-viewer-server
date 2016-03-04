"use strict";var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}();Object.defineProperty(exports, "__esModule", { value: true });exports.







getMostRecentVersionFromReleases = getMostRecentVersionFromReleases; /**
                                                                      * Copyright 2016 aixigo AG
                                                                      * Released under the MIT license.
                                                                      */var VERSION_MATCHER = exports.VERSION_MATCHER = /^v(\d+)\.(\d+)\.(\d+)$/;var isNum = function isNum(_) {return (/^[0-9]+$/.test(_));};function getMostRecentVersionFromReleases(releases) {var versionObject = releases.reduce(function (mostRecentVersion, _ref) {var versions = _ref.versions;return versions.reduce(function (mostRecentVersion, versionString) {var _VERSION_MATCHER$exec = VERSION_MATCHER.exec(versionString).
         map(function (part) {return isNum(part) ? parseInt(part, 10) : part;});var _VERSION_MATCHER$exec2 = _slicedToArray(_VERSION_MATCHER$exec, 4);var major = _VERSION_MATCHER$exec2[1];var minor = _VERSION_MATCHER$exec2[2];var patch = _VERSION_MATCHER$exec2[3];
         var versionObject = { major: major, minor: minor, patch: patch };
         if (!mostRecentVersion) {
            return versionObject;}

         if (major > mostRecentVersion.major) {
            return versionObject;} else 

         if (major === mostRecentVersion.major) {
            if (minor > mostRecentVersion.minor) {
               return versionObject;} else 

            if (minor === mostRecentVersion.minor && patch > mostRecentVersion.patch) {
               return versionObject;}}



         return mostRecentVersion;}, 
      mostRecentVersion);}, 
   null);
   return versionObject ? "v" + versionObject.major + "." + versionObject.minor + "." + versionObject.patch : null;}
//# sourceMappingURL=/Users/awilden/work/laxar/changelog-viewer-server/lib/adapters/adapter_helper.js.map