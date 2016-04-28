'use strict';var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}();var _extends = Object.assign || function (target) {for (var i = 1; i < arguments.length; i++) {var source = arguments[i];for (var key in source) {if (Object.prototype.hasOwnProperty.call(source, key)) {target[key] = source[key];}}}return target;}; /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              * Copyright 2015 aixigo AG
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              * Released under the MIT license.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              */Object.defineProperty(exports, "__esModule", { value: true });var _es6Promise = require('es6-promise');var _sha = require('sha1');var _sha2 = _interopRequireDefault(_sha);var _cached_fetch = require('../cached_fetch');var _cached_fetch2 = _interopRequireDefault(_cached_fetch);var _repository_resource_fetcher = require('../repository_resource_fetcher');var _repository_resource_fetcher2 = _interopRequireDefault(_repository_resource_fetcher);var _adapter_helper = require('./adapter_helper');function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}exports.default = 







function (logger, _ref, _ref2) {var category = _ref.category;var organization = _ref.organization;var oauthToken = _ref.oauthToken;var resourceCachePath = _ref2.resourceCachePath;

   var urlTemplates = { 
      REPOSITORIES: 'https://api.github.com/users/' + organization + '/repos?per_page=100', 
      TAGS: 'https://api.github.com/repos/' + organization + '/[repository]/tags?per_page=100', 
      CHANGELOG: 'https://raw.githubusercontent.com/' + organization + '/[repository]/[branch]/CHANGELOG.md' };


   var resourceFetcher = (0, _repository_resource_fetcher2.default)(logger, { resourceCachePath: resourceCachePath });var _cachedFetch = 
   (0, _cached_fetch2.default)(60 * 60 * 1000);var getJson = _cachedFetch.getJson;var clearCache = _cachedFetch.clearCache;
   var api = { 
      getRepositories: getRepositories, 
      getRepositoryById: getRepositoryById, 
      clearCache: clearCache };

   var headers = { 'user-agent': 'node.js' };

   if (!oauthToken) {
      logger.warn('No oauth token for github adapter configured\n                     (category: ' + 
      category + ', organization: ' + organization + ')');} else 

   {
      headers['Authorization'] = 'token ' + oauthToken;}


   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getJson(urlTemplates.REPOSITORIES, headers).
      then(function (repositories) {return _es6Promise.Promise.all(repositories.map(createRepository));});}


   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById(repositoryId) {
      return getRepositories().
      then(function (repositories) {return repositories.filter(function (_ref3) {var id = _ref3.id;return '' + repositoryId === '' + id;});}).
      then(function (repositories) {return repositories.length > 0 ? repositories[0] : null;});}


   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository(repositoryData) {

      var normalizedData = { 
         id: repositoryData.id, 
         name: repositoryData.name, 
         pushedAt: repositoryData.pushed_at, 
         organization: repositoryData.full_name.split('/')[0] };

      var dataForFetch = _extends({}, normalizedData, { cacheHash: (0, _sha2.default)(normalizedData.pushedAt) });
      var get = function get(url) {return resourceFetcher.fetch(dataForFetch, url, headers);};

      var proto = { 
         getReleases: function getReleases() {
            var url = urlTemplates.TAGS.replace('[repository]', repositoryData.name);

            return get(url).
            then(function (data) {return JSON.parse(data);}).
            then(function (tags) {return tags.map(function (tag) {return tag.name;});}).
            then(function (versions) {
               var versionData = versions.reduce(function (acc, version) {
                  var match = _adapter_helper.VERSION_MATCHER.exec(version);
                  if (match) {var _match = _slicedToArray(
                     /*patch*/match, 3);var name = _match[0];var major = _match[1];var minor = _match[2];
                     var versionTag = 'v' + major + '.' + minor + '.x';
                     if (!(versionTag in acc)) {
                        acc[versionTag] = { 
                           versions: [], 
                           title: versionTag };}



                     acc[versionTag].versions.push(name);}

                  return acc;}, 
               {});

               return Object.keys(versionData).map(function (key) {return versionData[key];});}).

            catch(function (err) {
               logger.error('Failed to get releases for repository "' + repositoryData.name + '" (URL: "' + url + '")');
               return logPossibleFetchError(err);});}, 




         getReleaseByVersion: function getReleaseByVersion(version) {
            var baseUrl = urlTemplates.CHANGELOG.replace('[repository]', repositoryData.name);
            var releaseUrl = baseUrl.replace('[branch]', 'release-' + version);
            return get(releaseUrl).
            then(function (changelog) {
               return { 
                  title: 'v' + version, 
                  changelog: changelog };}).


            catch(function (err) {
               // older releases often lack a changelog file. Hence we ignore this case here
               return { 
                  title: 'v' + version, 
                  changelog: '' };

               logger.error('Failed to get release for verion "' + version + '" (URL: "' + releaseUrl + '")');
               return logPossibleFetchError(err);});} };




      return proto.getReleases().
      then(_adapter_helper.getMostRecentVersionFromReleases).
      then(function (mostRecentVersion) {
         return Object.create(proto, { 
            id: { 
               enumerable: true, 
               value: normalizedData.id }, 

            name: { 
               enumerable: true, 
               value: normalizedData.name }, 

            pushedAt: { 
               enumerable: true, 
               value: normalizedData.pushedAt }, 

            organization: { 
               enumerable: true, 
               value: normalizedData.organization }, 

            mostRecentVersion: { 
               enumerable: true, 
               value: mostRecentVersion } });});}





   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function logPossibleFetchError(err) {
      if (err.headers && err.status) {
         logger.error('Response Status: %s', err.status);
         logger.error('Response Headers: %j', err.headers);} else 

      {
         logger.error('Error: ', err);}

      return _es6Promise.Promise.reject(err);}


   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;};
//# sourceMappingURL=/Users/awilden/work/laxar/changelog-viewer-server/lib/adapters/github_adapter.js.map