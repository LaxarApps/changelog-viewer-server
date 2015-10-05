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

var _adaptersGithub_adapter = require('./adapters/github_adapter');

var _adaptersGithub_adapter2 = _interopRequireDefault(_adaptersGithub_adapter);

var _adaptersGitweb_adapter = require('./adapters/gitweb_adapter');

var _adaptersGitweb_adapter2 = _interopRequireDefault(_adaptersGitweb_adapter);

exports['default'] = function (config) {

   var api = {
      getCategories: getCategories,
      getRepositories: getRepositories,
      findCategoryById: findCategoryById,
      findRepositoryById: findRepositoryById
   };
   var adaptersByCategory = createAdaptersByCategory();
   var adaptersById = createAdaptersById(adaptersByCategory);

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getCategories() {
      return _es6Promise.Promise.resolve(Object.keys(config.categories).map(function (id) {
         return {
            id: id,
            title: config.categories[id]
         };
      }));
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories(categoryId) {
      return _es6Promise.Promise.all((adaptersByCategory[categoryId] || []).map(function (adapter) {
         return adapter.getRepositories().then(repositoriesDecorator(adapter));
      })).then(flatten);
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function findCategoryById(categoryId) {
      return getCategories().then(function (categories) {
         return categories.filter(function (category) {
            return category.id === categoryId;
         })[0] || null;
      });
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function findRepositoryById(adapterId, repositoryId) {
      return adaptersById[adapterId].getRepositoryById(repositoryId).then(repositoryDecorator(adaptersById[adapterId]));
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createAdaptersByCategory() {
      var factories = {
         github: _adaptersGithub_adapter2['default'],
         gitweb: _adaptersGitweb_adapter2['default']
      };
      var adapters = {};
      config.sources.forEach(function (source, index) {
         var factory = factories[source.type];
         if (!factory) {
            throw new Error('No adapter factory for type ' + source.type + ' found.');
         }
         if (!(source.category in adapters)) {
            adapters[source.category] = [];
         }

         var adapter = factory(source);
         adapter.__id = index;
         adapters[source.category].push(adapter);
      });
      return adapters;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function repositoriesDecorator(adapter) {
      return function (repositories) {
         repositories.forEach(repositoryDecorator(adapter));
         return repositories;
      };
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function repositoryDecorator(adapter) {
      return function (repository) {
         if (repository) {
            repository.__adapterId = adapter.__id;
         }
         return repository;
      };
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createAdaptersById(adaptersByCategory) {
      var adapters = {};
      Object.keys(adaptersByCategory).map(function (category) {
         return adaptersByCategory[category];
      }).reduce(function (acc, list) {
         return acc.concat(list);
      }, []).forEach(function (adapter) {
         return adapters[adapter.__id] = adapter;
      });
      return adapters;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function flatten(listOfLists) {
      return [].concat.apply([], listOfLists);
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;
};

module.exports = exports['default'];

//# sourceMappingURL=adapter_broker.js.map