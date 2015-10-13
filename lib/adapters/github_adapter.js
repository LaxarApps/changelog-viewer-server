/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
'use strict';

Object.defineProperty(exports, '__esModule', {
   value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _es6Promise = require('es6-promise');

var _cached_fetch = require('../cached_fetch');

var _cached_fetch2 = _interopRequireDefault(_cached_fetch);

exports['default'] = function (_ref) {
   var category = _ref.category;
   var organization = _ref.organization;
   var oauthToken = _ref.oauthToken;

   var urlTemplates = {
      REPOSITORIES: 'https://api.github.com/users/' + organization + '/repos?per_page=100',
      TAGS: 'https://api.github.com/repos/' + organization + '/[repository]/tags?per_page=100',
      CHANGELOG: 'https://raw.githubusercontent.com/' + organization + '/[repository]/[branch]/CHANGELOG.md'
   };
   var VERSION_MATCHER = /^v(\d+)\.(\d+)\.(\d+)$/;

   var _cachedFetch = (0, _cached_fetch2['default'])();

   var getText = _cachedFetch.getText;
   var getJson = _cachedFetch.getJson;

   var api = {
      getRepositories: getRepositories,
      getRepositoryById: getRepositoryById
   };
   var headers = {};

   if (!oauthToken) {
      console.warn('No oauth token for github adapter configured\n                     (category: ' + category + ', organization: ' + organization + ')');
   } else {
      headers['Authorization'] = 'token ' + oauthToken;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getJson(urlTemplates.REPOSITORIES, headers).then(function (repositories) {
         return repositories.map(createRepository);
      });
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById(repositoryId) {
      return getRepositories().then(function (repositories) {
         return repositories.filter(function (_ref2) {
            var id = _ref2.id;
            return '' + repositoryId === '' + id;
         });
      }).then(function (repositories) {
         return repositories.length > 0 ? repositories[0] : null;
      });
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository(repositoryData) {

      var proto = {
         getReleases: function getReleases() {
            var url = urlTemplates.TAGS.replace('[repository]', repositoryData.name);

            return getJson(url, headers).then(function (tags) {
               return tags.map(function (tag) {
                  return tag.name;
               });
            }).then(function (versions) {
               var versionData = versions.reduce(function (acc, version) {
                  var match = VERSION_MATCHER.exec(version);
                  if (match) {
                     var _match = _slicedToArray(match, 4);

                     var _name = _match[0];
                     var major = _match[1];
                     var minor = _match[2];
                     var patch = _match[3];

                     var release = major + '.' + minor + '.x';
                     if (!(release in acc)) {
                        acc[release] = {
                           versions: [],
                           title: release
                        };
                     }

                     acc[release].versions.push(_name);
                  }
                  return acc;
               }, {});

               return Object.keys(versionData).map(function (key) {
                  return versionData[key];
               });
            });
         },

         getReleaseByVersion: function getReleaseByVersion(version) {
            var baseUrl = urlTemplates.CHANGELOG.replace('[repository]', repositoryData.name);

            var releaseUrl = baseUrl.replace('[branch]', 'release-' + version);
            return getText(releaseUrl, headers).then(function (changelog) {
               return {
                  title: 'v' + version,
                  changelog: changelog
               };
            }, function (err) {
               console.log('rejected:', err);
            });
         }
      };

      var repository = Object.create(proto);
      Object.keys(repositoryData).forEach(function (key) {
         Object.defineProperty(repository, key, {
            enumerable: true,
            value: repositoryData[key]
         });
      });
      return repository;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;
};

module.exports = exports['default'];

//# sourceMappingURL=github_adapter.js.map