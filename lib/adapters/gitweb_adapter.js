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

var _xml2js = require('xml2js');

var _child_process = require('child_process');

exports['default'] = function (_ref) {
   var serverUrl = _ref.serverUrl;
   var repositoriesRoot = _ref.repositoriesRoot;

   var urlTemplates = {
      REPOSITORIES: serverUrl + 'gitweb/?a=project_index;pf=' + repositoriesRoot,
      REPOSITORY: serverUrl + 'gitweb/?p=[repository];a=atom',
      REPOSITORY_GIT_URL: serverUrl + '[repository]',
      CHANGELOG: serverUrl + 'gitweb/?p=[repository];a=blob_plain;f=CHANGELOG.md;hb=refs/heads/[branch]'
   };
   var VERSION_MATCHER = /refs\/tags\/v(\d+)\.(\d+)\.(\d+)$/;

   var _cachedFetch = (0, _cached_fetch2['default'])();

   var getText = _cachedFetch.getText;

   var api = {
      getRepositories: getRepositories,
      getRepositoryById: getRepositoryById
   };
   var headers = {};

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getText(urlTemplates.REPOSITORIES, headers).then(function (text) {
         return _es6Promise.Promise.all((text || '').split('\n').map(function (line) {
            return line.split(' ')[0];
         }).filter(function (repositoryId) {
            return !!repositoryId;
         }).map(function (repositoryId) {
            return getRepositoryById(repositoryId);
         }));
      });
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById(repositoryId) {
      var url = urlTemplates.REPOSITORY.replace('[repository]', repositoryId);
      return getText(url, headers).then(function (text) {
         if (!text) {
            return null;
         }

         return new _es6Promise.Promise(function (resolve, reject) {
            (0, _xml2js.parseString)(text, function (err, result) {
               return err ? reject(err) : resolve(result);
            });
         });
      }).then(function (tree) {
         var updated = tree && tree.feed && tree.feed.updated && tree.feed.updated[0] || null;
         return {
            id: repositoryId,
            name: repositoryId,
            pushed_at: updated
         };
      }).then(createRepository);
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository(repositoryData) {

      var proto = {
         getReleases: function getReleases() {
            var url = urlTemplates.REPOSITORY_GIT_URL.replace('[repository]', repositoryData.id);
            return runGitLsRemote(url).then(function (text) {
               var versionData = text.split('\n').reduce(function (acc, line) {
                  var match = VERSION_MATCHER.exec(line.trim());
                  if (match) {
                     var _match = _slicedToArray(match, 4);

                     var _name = _match[0];
                     var major = _match[1];
                     var minor = _match[2];
                     var patch = _match[3];

                     var release = 'v' + major + '.' + minor + '.x';
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
            var release = version.indexOf('v') === 0 ? version.substr(1) : version;
            var releaseUrl = baseUrl.replace('[branch]', 'release-' + release);
            return getText(releaseUrl, headers).then(function (changelog) {
               return {
                  title: 'v' + release,
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

   function runGitLsRemote(repositoryUrl) {
      return new _es6Promise.Promise(function (resolve, reject) {
         var command = 'git ls-remote --tags ' + repositoryUrl;

         (0, _child_process.exec)(command, function (err, stdout, stderr) {
            if (err) {
               console.error(stderr);
               return reject(err);
            }

            resolve(stdout);
         });
      });
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;
};

module.exports = exports['default'];

//# sourceMappingURL=gitweb_adapter.js.map