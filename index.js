/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _fs = require('fs');

var _http = require('http');

var _es6Promise = require('es6-promise');

var _hal = require('hal');

var _connect = require('connect');

var _connect2 = _interopRequireDefault(_connect);

var _routes = require('routes');

var _routes2 = _interopRequireDefault(_routes);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _libAdapter_broker = require('./lib/adapter_broker');

var _libAdapter_broker2 = _interopRequireDefault(_libAdapter_broker);

var _libCached_fetch = require('./lib/cached_fetch');

var _libCached_fetch2 = _interopRequireDefault(_libCached_fetch);

new _es6Promise.Promise(function (resolve, reject) {
   (0, _fs.readFile)('./config.json', function (err, string) {
      return err ? reject(err) : resolve(string);
   });
}).then(function (string) {
   return JSON.parse(string);
}).then(startServer, function (err) {
   return console.error('An error occurred while reading the config file (config.json): ' + err);
})['catch'](function (err) {
   console.error('An error occurred while starting the server: ' + err);
   console.error('Stack: ', err.stack);
});

var routes = {
   ROOT: '/',
   CACHE: '/cache',
   CATEGORIES: '/categories',
   CATEGORY_BY_ID: '/categories/:categoryId',
   COMPONENT_MAP: '/component-map',
   REPOSITORIES_BY_CATEGORY: '/categories/:categoryId/repositories',
   REPOSITORIES: '/repositories',
   REPOSITORY_BY_ID: '/repositories/:globalRepositoryId',
   REPOSITORY_RELEASES: '/repositories/:globalRepositoryId/releases',
   REPOSITORY_RELEASE_BY_ID: '/repositories/:globalRepositoryId/releases/:releaseId'
};
var relations = {
   CACHE: 'cache',
   CATEGORY: 'category',
   CATEGORIES: 'categories',
   COMPONENT_MAP: 'component-map',
   REPOSITORIES: 'repositories',
   REPOSITORY: 'repository',
   RELEASE: 'release',
   RELEASES: 'releases'
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function startServer(config) {

   var router = new _routes2['default']();
   var server = (0, _connect2['default'])();
   var broker = (0, _libAdapter_broker2['default'])(config);

   server.use(function (req, res) {
      var path = _url2['default'].parse(req.url).pathname;
      var match = router.match(path);

      if (!match) {
         console.warn('Found no match for url "' + req.url + '".');
         res.statusCode = 404;
         res.end();
         return;
      }

      match.fn(req, res, match);
   });

   addRoutes(config, { router: router, broker: broker });

   (0, _http.createServer)(server).listen(config.port || 8000);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function addRoutes(config, _ref) {
   var router = _ref.router;
   var broker = _ref.broker;

   var resourcesCache = {};

   var _cachedFetch = (0, _libCached_fetch2['default'])();

   var getJson = _cachedFetch.getJson;
   var clearCache = _cachedFetch.clearCache;

   // HAL routes

   addHalRoute(routes.ROOT, function () {
      var resource = new _hal.Resource({}, routes.ROOT);
      resource.link(relations.CACHE, routes.CACHE);
      resource.link(relations.CATEGORIES, routes.CATEGORIES);
      if (config.componentMapUrl) {
         resource.link(relations.COMPONENT_MAP, routes.COMPONENT_MAP);
      }
      return resource;
   });

   addHalRoute(routes.CATEGORIES, function () {
      var categoriesResource = new _hal.Resource({}, routes.CATEGORIES);
      return broker.getCategories().then(function (categories) {
         return _es6Promise.Promise.all(categories.map(function (category) {
            var categoryResource = resourceForCategory(category);
            categoriesResource.link(relations.CATEGORY, hrefForCategory(category));
            categoriesResource.embed(relations.CATEGORY, categoryResource, false);

            return broker.getRepositories(category.id).then(function (repositories) {
               var repositoriesResource = resourceForRepositories(repositories, {
                  href: hrefForRepositoriesByCategory(category),
                  embedded: true
               });
               categoryResource.embed(relations.REPOSITORIES, repositoriesResource, false);
            });
         }));
      }).then(function () {
         return categoriesResource;
      });
   });

   addHalRoute(routes.CATEGORY_BY_ID, function (_ref2) {
      var categoryId = _ref2.categoryId;

      return broker.findCategoryById(categoryId).then(function (category) {
         return category ? resourceForCategory(category) : null;
      });
   });

   addHalRoute(routes.COMPONENT_MAP, function () {
      return getJson(config.componentMapUrl).then(function (componentMap) {
         return componentMap ? resourceForComponentMap(componentMap) : null;
      });
   });

   addHalRoute(routes.REPOSITORIES_BY_CATEGORY, function (_ref3) {
      var categoryId = _ref3.categoryId;

      return broker.findCategoryById(categoryId).then(function (category) {
         if (!category) {
            return null;
         }

         var hrefForRepositories = hrefForRepositoriesByCategory(category);
         return broker.getRepositories(category.id).then(function (repositories) {
            return resourceForRepositories(repositories, { href: hrefForRepositories });
         });
      });
   });

   addHalRoute(routes.REPOSITORIES, function () {
      return broker.getCategories().then(function (categories) {
         return _es6Promise.Promise.all(categories.map(function (category) {
            return broker.getRepositories(category.id);
         })).then(function (repositoriesLists) {
            return [].concat.apply([], repositoriesLists);
         });
      }).then(function (repositories) {
         return resourceForRepositories(repositories);
      });
   });

   addHalRoute(routes.REPOSITORY_BY_ID, function (_ref4) {
      var globalRepositoryId = _ref4.globalRepositoryId;

      var _globalRepositoryId$split = globalRepositoryId.split('__');

      var _globalRepositoryId$split2 = _slicedToArray(_globalRepositoryId$split, 2);

      var adapterId = _globalRepositoryId$split2[0];
      var repositoryId = _globalRepositoryId$split2[1];

      return broker.findRepositoryById(adapterId, repositoryId).then(function (repository) {
         return repository ? resourceForRepository(repository) : null;
      });
   });

   addHalRoute(routes.REPOSITORY_RELEASES, function (_ref5) {
      var globalRepositoryId = _ref5.globalRepositoryId;

      var _globalRepositoryId$split3 = globalRepositoryId.split('__');

      var _globalRepositoryId$split32 = _slicedToArray(_globalRepositoryId$split3, 2);

      var adapterId = _globalRepositoryId$split32[0];
      var repositoryId = _globalRepositoryId$split32[1];

      return broker.findRepositoryById(adapterId, repositoryId).then(function (repository) {
         if (!repository) {
            return null;
         }

         return repository.getReleases().then(function (releases) {
            return resourceForReleasesByRepository(repository, releases);
         });
      });
   });

   addHalRoute(routes.REPOSITORY_RELEASE_BY_ID, function (_ref6) {
      var globalRepositoryId = _ref6.globalRepositoryId;
      var releaseId = _ref6.releaseId;

      var _globalRepositoryId$split4 = globalRepositoryId.split('__');

      var _globalRepositoryId$split42 = _slicedToArray(_globalRepositoryId$split4, 2);

      var adapterId = _globalRepositoryId$split42[0];
      var repositoryId = _globalRepositoryId$split42[1];

      return broker.findRepositoryById(adapterId, repositoryId).then(function (repository) {
         if (!repository) {
            return null;
         }
         if (releaseId.indexOf('v') !== 0) {
            return null;
         }

         var version = releaseId.substr(1);
         return repository.getReleaseByVersion(version).then(function (release) {
            return resourceForRelease(repository, release);
         });
      });
   });

   // low level routes

   router.addRoute(routes.CACHE, function (req, res) {
      if (req.method !== 'DELETE') {
         res.statusCode = 405;
         res.end();
         return;
      }
      res.statusCode = 204;
      res.end();

      clearCache();
      resourcesCache = {};
      broker.clearCache();
   });

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   var now = function now() {
      return new Date().getTime();
   };
   var stillValid = function stillValid(_ref7) {
      var timestamp = _ref7.timestamp;
      return timestamp > now() - (config.maxAgeMs || 2 * 60 * 60 * 1000);
   };

   function addHalRoute(route, resourceBuilder) {
      router.addRoute(route, function (req, res, match) {
         var url = req.url;

         var timeoutPromise = new _es6Promise.Promise(function (resolve, reject) {
            setTimeout(reject.bind(null, 'Request timed out.'), config.requestTimeout || 60000);
         });

         if (url in resourcesCache && stillValid(resourcesCache[url])) {
            return processResourceBuilderResult(resourcesCache[url].resource);
         }

         _es6Promise.Promise.race([timeoutPromise, resourceBuilder(match.params, req, res)]).then(function (resource) {
            if (resource) {
               resourcesCache[url] = { timestamp: now(), resource: resource };
            }
            return resource;
         }).then(processResourceBuilderResult)['catch'](function (error) {
            var errorMessage = typeof error === 'string' ? error : 'Unknown internal error';
            if (error instanceof Error) {
               console.error('An error occurred while serving request to ' + route + ': ' + error);
               console.error('Stack: ', error.stack);
            }

            res.statusCode = 500;
            res.write(errorMessage);
            res.end();
         });

         function processResourceBuilderResult(resource) {
            if (resource) {
               writeCommonHeaders(res);

               res.write(JSON.stringify(resource.toJSON(), null, 3));
            } else {
               res.statusCode = 404;
            }
            res.end();
         }
      });
   }
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

var hrefForComponentMap = function hrefForComponentMap() {
   return createUrl(routes.COMPONENT_MAP, {});
};
function resourceForComponentMap(componentMap) {
   return new _hal.Resource(componentMap, hrefForComponentMap());
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

var hrefForCategory = function hrefForCategory(category) {
   return createUrl(routes.CATEGORY_BY_ID, { categoryId: category.id });
};
function resourceForCategory(category) {
   var categoryResource = new _hal.Resource(category, hrefForCategory(category));
   categoryResource.link(relations.REPOSITORIES, hrefForRepositoriesByCategory(category));
   return categoryResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

var hrefForRepositories = function hrefForRepositories(category) {
   return createUrl(routes.REPOSITORIES, {});
};
var hrefForRepositoriesByCategory = function hrefForRepositoriesByCategory(category) {
   return createUrl(routes.REPOSITORIES_BY_CATEGORY, { categoryId: category.id });
};
function resourceForRepositories(repositories) {
   var _ref8 = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

   var _ref8$embedded = _ref8.embedded;
   var embedded = _ref8$embedded === undefined ? false : _ref8$embedded;
   var _ref8$href = _ref8.href;
   var href = _ref8$href === undefined ? null : _ref8$href;

   var repositoriesResource = new _hal.Resource({}, href || hrefForRepositories());
   repositories.forEach(function (repository) {
      var repositoryResource = resourceForRepository(repository);

      if (embedded) {
         repositoriesResource.link(relations.REPOSITORY, hrefForRepository(repository));
         repositoriesResource.embed(relations.REPOSITORY, repositoryResource, false);
      } else {
         repositoriesResource.link(relations.REPOSITORY, {
            href: hrefForRepository(repository),
            title: repositoryResource.title
         });
      }
   });
   return repositoriesResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

var hrefForRepository = function hrefForRepository(repository) {
   return createUrl(routes.REPOSITORY_BY_ID, { globalRepositoryId: globalRepositoryId(repository) });
};
function resourceForRepository(repository) {
   var repositoryHref = hrefForRepository(repository);
   var repositoryResource = new _hal.Resource({
      title: repository.name,
      pushedAt: repository.pushedAt,
      organization: repository.organization
   }, repositoryHref);
   repositoryResource.link(relations.RELEASES, repositoryHref + '/releases');
   return repositoryResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

var hrefForReleaseByRepository = function hrefForReleaseByRepository(repository, release) {
   return createUrl(routes.REPOSITORY_RELEASE_BY_ID, {
      globalRepositoryId: globalRepositoryId(repository),
      releaseId: release.title
   });
};
function resourceForRelease(repository, release) {
   var releaseHref = hrefForReleaseByRepository(repository, release);
   return new _hal.Resource(release, releaseHref);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

var hrefForReleasesByRepository = function hrefForReleasesByRepository(repository) {
   return createUrl(routes.REPOSITORY_RELEASES, { globalRepositoryId: globalRepositoryId(repository) });
};
function resourceForReleasesByRepository(repository, releases) {
   var releasesHref = hrefForReleasesByRepository(repository);
   var releasesResource = new _hal.Resource({}, releasesHref);
   releases.forEach(function (release) {
      releasesResource.link(relations.RELEASE, {
         href: hrefForReleaseByRepository(repository, release),
         title: release.title
      });
   });
   return releasesResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function globalRepositoryId(repository) {
   return encodeURIComponent(repository.__adapterId + '__' + repository.id);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createUrl(route, params) {
   return Object.keys(params).reduce(function (url, key) {
      return url.replace(':' + key, params[key]);
   }, route);
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function writeCommonHeaders(res) {
   res.setHeader('Content-Type', 'application/hal+json');
}

//# sourceMappingURL=index.js.map