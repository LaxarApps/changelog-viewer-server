'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })(); /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            * Copyright 2015 aixigo AG
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            * Released under the MIT license.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            */

Object.defineProperty(exports, "__esModule", {
   value: true
});

var _es6Promise = require('es6-promise');

var _cached_fetch = require('../cached_fetch');

var _cached_fetch2 = _interopRequireDefault(_cached_fetch);

var _xml2js = require('xml2js');

var _child_process = require('child_process');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = function (_ref) {
   var serverUrl = _ref.serverUrl;
   var repositoriesRoot = _ref.repositoriesRoot;

   var urlTemplates = {
      REPOSITORIES: serverUrl + 'gitweb/?a=project_index;pf=' + repositoriesRoot,
      REPOSITORY: serverUrl + 'gitweb/?p=[repository];a=atom',
      REPOSITORY_TAGS: serverUrl + 'gitweb/?p=[repository];a=tags',
      CHANGELOG: serverUrl + 'gitweb/?p=[repository];a=blob_plain;f=CHANGELOG.md;hb=refs/heads/[branch]'
   };
   var VERSION_MATCHER = /^v(\d+)\.(\d+)\.(\d+)$/;

   var _cachedFetch = (0, _cached_fetch2.default)();

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
         // fuzzy logic for organizations: take the path fragment right before the *.git part

         var _repositoryId$match = repositoryId.match(/([^\/]+)\/([^\/]+)\.git$/);

         var _repositoryId$match2 = _slicedToArray(_repositoryId$match, 3);

         var organization = _repositoryId$match2[1];
         var name = _repositoryId$match2[2];

         return {
            id: repositoryId,
            name: name,
            organization: organization,
            pushedAt: updated
         };
      }).then(createRepository);
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository(repositoryData) {

      var proto = {
         getReleases: function getReleases() {
            var url = urlTemplates.REPOSITORY_TAGS.replace('[repository]', repositoryData.id);
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
               var body = tree && tree.html && tree.html.body && tree.html.body[0];
               var table = body && body.table && body.table[0];
               var tds = table && table.tr && table.tr.map(function (tr) {
                  return tr.td && tr.td[1] && tr.td[1];
               });
               var as = tds && tds.map(function (td) {
                  return td.a && td.a[0] && td.a[0];
               });
               var texts = as && as.map(function (a) {
                  return a._ && a._.trim();
               });
               return texts;
            }).then(function (tags) {
               var versionData = tags.reduce(function (acc, tag) {
                  var match = VERSION_MATCHER.exec(tag);
                  if (match) {
                     var _match = _slicedToArray(match, 4);

                     var name = _match[0];
                     var major = _match[1];
                     var minor = _match[2];
                     var patch = _match[3];

                     var versionTag = 'v' + major + '.' + minor + '.x';
                     if (!(versionTag in acc)) {
                        acc[versionTag] = {
                           versions: [],
                           title: versionTag
                        };
                     }

                     acc[versionTag].versions.push('refs/tags/' + name);
                  }
                  return acc;
               }, {});

               return Object.keys(versionData).map(function (key) {
                  return versionData[key];
               });
            });
         },

         getReleaseByVersion: function getReleaseByVersion(version) {
            var baseUrl = urlTemplates.CHANGELOG.replace('[repository]', repositoryData.id);
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
