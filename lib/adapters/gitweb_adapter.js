'use strict';var _slicedToArray = function () {function sliceIterator(arr, i) {var _arr = [];var _n = true;var _d = false;var _e = undefined;try {for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {_arr.push(_s.value);if (i && _arr.length === i) break;}} catch (err) {_d = true;_e = err;} finally {try {if (!_n && _i["return"]) _i["return"]();} finally {if (_d) throw _e;}}return _arr;}return function (arr, i) {if (Array.isArray(arr)) {return arr;} else if (Symbol.iterator in Object(arr)) {return sliceIterator(arr, i);} else {throw new TypeError("Invalid attempt to destructure non-iterable instance");}};}(); /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       * Copyright 2015 aixigo AG
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       * Released under the MIT license.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       */Object.defineProperty(exports, "__esModule", { value: true });var _es6Promise = require('es6-promise');var _sha = require('sha1');var _sha2 = _interopRequireDefault(_sha);var _cached_fetch = require('../cached_fetch');var _cached_fetch2 = _interopRequireDefault(_cached_fetch);var _repository_resource_fetcher = require('../repository_resource_fetcher');var _repository_resource_fetcher2 = _interopRequireDefault(_repository_resource_fetcher);var _xml2js = require('xml2js');var _adapter_helper = require('./adapter_helper');function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}exports.default = 








function (logger, _ref, _ref2) {var serverUrl = _ref.serverUrl;var repositoriesRoot = _ref.repositoriesRoot;var resourceCachePath = _ref2.resourceCachePath;

   var urlTemplates = { 
      REPOSITORIES: serverUrl + 'gitweb/?a=project_index;pf=' + repositoriesRoot, 
      REPOSITORY: serverUrl + 'gitweb/?p=[repository];a=atom', 
      REPOSITORY_TAGS: serverUrl + 'gitweb/?p=[repository];a=tags', 
      CHANGELOG: serverUrl + 'gitweb/?p=[repository];a=blob_plain;f=CHANGELOG.md;hb=refs/heads/[branch]' };


   var resourceFetcher = (0, _repository_resource_fetcher2.default)(logger, { resourceCachePath: resourceCachePath });var _cachedFetch = 
   (0, _cached_fetch2.default)(60 * 60 * 1000);var getText = _cachedFetch.getText;var clearCache = _cachedFetch.clearCache;
   var api = { 
      getRepositories: getRepositories, 
      getRepositoryById: getRepositoryById, 
      clearCache: clearCache };

   var headers = {};

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getText(urlTemplates.REPOSITORIES, headers).
      then(function (text) {
         return _es6Promise.Promise.all((text || '').split('\n').
         map(function (line) {return line.split(' ')[0];}).
         filter(function (repositoryId) {return !!repositoryId;}).
         map(function (repositoryId) {return getRepositoryById(repositoryId);}));});}



   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById(repositoryId) {
      var url = urlTemplates.REPOSITORY.replace('[repository]', repositoryId);
      var tagsUrl = urlTemplates.REPOSITORY_TAGS.replace('[repository]', repositoryId);

      return _es6Promise.Promise.all([getText(url, headers), getText(tagsUrl, headers)]).
      then(function (_ref3) {var _ref4 = _slicedToArray(_ref3, 2);var repoText = _ref4[0];var tagsText = _ref4[1];
         if (!repoText) {
            return [null, null];}


         return _es6Promise.Promise.all([
         new _es6Promise.Promise(function (resolve, reject) {
            (0, _xml2js.parseString)(repoText, function (err, result) {return err ? reject(err) : resolve(result);});}), 

         new _es6Promise.Promise(function (resolve, reject) {
            (0, _xml2js.parseString)(tagsText, function (err, result) {return err ? reject(err) : resolve(result);});})]);}).



      then(function (_ref5) {var _ref6 = _slicedToArray(_ref5, 2);var repoTree = _ref6[0];var tagsTree = _ref6[1];
         // the underscore references a node's character content
         // we don't want to have the newest version here, but the tag most recently pushed
         var mostRecentTag = path(tagsTree, 'html.body.0.table.0.tr.0.td.1.a.0._', '').trim();
         var updated = path(repoTree, 'feed.updated.0', null);
         // fuzzy logic for organizations: take the path fragment right before the *.git part
         var _repositoryId$match = repositoryId.match(/([^\/]+)\/([^\/]+)\.git$/);var _repositoryId$match2 = _slicedToArray(_repositoryId$match, 3);var organization = _repositoryId$match2[1];var name = _repositoryId$match2[2];

         return { 
            id: repositoryId, 
            name: name, 
            organization: organization, 
            pushedAt: updated, 
            cacheHash: (0, _sha2.default)(mostRecentTag) };}).


      then(createRepository);}


   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository(repositoryData) {
      var get = function get(url) {return resourceFetcher.fetch(repositoryData, url, headers);};
      var proto = { 
         getReleases: function getReleases() {
            var url = urlTemplates.REPOSITORY_TAGS.replace('[repository]', repositoryData.id);

            return get(url).
            then(function (text) {
               if (!text) {
                  return null;}


               return new _es6Promise.Promise(function (resolve, reject) {
                  (0, _xml2js.parseString)(text, function (err, result) {return err ? reject(err) : resolve(result);});});}).


            then(function (tree) {
               var tagTableRows = path(tree, 'html.body.0.table.0.tr', []);
               // the underscore references a node's character content
               return tagTableRows.map(function (row) {return path(row, 'td.1.a.0._', '').trim();});}).

            then(function (tags) {
               var versionData = tags.reduce(function (acc, tag) {
                  var match = _adapter_helper.VERSION_MATCHER.exec(tag);
                  if (match) {var _match = _slicedToArray(
                     /*, patch*/match, 3);var name = _match[0];var major = _match[1];var minor = _match[2];
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
            var baseUrl = urlTemplates.CHANGELOG.replace('[repository]', repositoryData.id);
            var releaseUrl = baseUrl.replace('[branch]', 'release-' + version);
            return get(releaseUrl).
            then(function (changelog) {
               return { 
                  title: 'v' + version, 
                  changelog: changelog };}).


            catch(function (err) {
               if (err.status === 404) {
                  // older releases often lack a changelog file. Hence we ignore this case here
                  return { 
                     title: 'v' + version, 
                     changelog: '' };}


               logger.error('Failed to get release for verion "' + version + '" (URL: "' + releaseUrl + '")');
               return logPossibleFetchError(err);});} };




      return proto.getReleases().
      then(_adapter_helper.getMostRecentVersionFromReleases).
      then(function (mostRecentVersion) {
         var repository = Object.create(proto);
         repositoryData.mostRecentVersion = mostRecentVersion;
         Object.keys(repositoryData).
         forEach(function (key) {
            Object.defineProperty(repository, key, { 
               enumerable: true, 
               value: repositoryData[key] });});


         return repository;});}



   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function logPossibleFetchError(err) {
      if (err.headers && err.status) {
         logger.error('Response Status: %s', err.status);
         logger.error('Response Headers: %j', err.headers);} else 

      {
         logger.error('Error: ', err);}

      return _es6Promise.Promise.reject(err);}


   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function path(obj, path, optionalDefault) {
      var val = path.split('.').reduce(function (node, fragment) {return node ? node[fragment] : node;}, obj);
      return val !== undefined ? val : optionalDefault;}


   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;};
//# sourceMappingURL=/Users/awilden/work/laxar/changelog-viewer-server/lib/adapters/gitweb_adapter.js.map