/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import createGithubAdapter from './adapters/github_adapter';
import createGitwebAdapter from './adapters/gitweb_adapter';

export default ( config ) => {

   const api = {
      getCategories,
      getRepositories,
      findCategoryById,
      findRepositoryById
   };
   const adaptersByCategory = createAdaptersByCategory();
   const adaptersById = createAdaptersById( adaptersByCategory );

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getCategories() {
      return Promise.resolve( Object.keys( config.categories )
         .map( id => {
            return {
               id: id,
               title: config.categories[ id ]
            };
         } ) );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories( categoryId ) {
      return Promise.all(
         ( adaptersByCategory[ categoryId ] || [] )
            .map( adapter => {
               return adapter.getRepositories()
                  .then( repositoriesDecorator( adapter ) );
            } )
         )
         .then( flatten );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function findCategoryById( categoryId ) {
      return getCategories()
         .then( categories => categories.filter( category => category.id === categoryId )[0] || null );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function findRepositoryById( adapterId, repositoryId ) {
      return adaptersById[ adapterId ].getRepositoryById( repositoryId )
         .then( repositoryDecorator( adaptersById[ adapterId ] ) );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createAdaptersByCategory() {
      const factories = {
         github: createGithubAdapter,
         gitweb: createGitwebAdapter
      };
      let adapters = {};
      config.sources
         .forEach( ( source, index ) => {
            const factory = factories[ source.type ];
            if( !factory ) {
               throw new Error( `No adapter factory for type ${source.type} found.` );
            }
            if( !( source.category in adapters ) ) {
               adapters[ source.category ] = [];
            }

            let adapter = factory( source );
            adapter.__id = index;
            adapters[ source.category ].push( adapter );
         } );
      return adapters;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function repositoriesDecorator( adapter ) {
      return repositories => {
         repositories.forEach( repositoryDecorator( adapter ) );
         return repositories;
      }
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function repositoryDecorator( adapter ) {
      return repository => {
         if( repository ) {
            repository.__adapterId = adapter.__id
         }
         return repository;
      }
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createAdaptersById( adaptersByCategory ) {
      let adapters = {};
      Object.keys( adaptersByCategory )
         .map( category => adaptersByCategory[ category ] )
         .reduce( ( acc, list ) => acc.concat( list ), [] )
         .forEach( adapter => adapters[ adapter.__id ] = adapter );
      return adapters;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function flatten( listOfLists ) {
      return [].concat.apply( [], listOfLists );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;

};