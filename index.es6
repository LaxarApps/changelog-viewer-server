/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { readFile } from 'fs';
import { createServer } from 'http';
import { Promise } from 'es6-promise';
import { Resource as HalResource } from 'hal';
import connect from 'connect';
import Router from 'routes';
import url from 'url';
import createBroker from './lib/adapter_broker';


new Promise( ( resolve, reject ) => {
   readFile( './config.json', ( err, string ) =>  err ? reject( err ) : resolve( string ) );
} )
   .then( string => JSON.parse( string ) )
   .then( startServer, err => console.error( `An error occurred while reading the config file (config.json): ${err}` ) )
   .catch( err => {
      console.error( `An error occurred while starting the server: ${err}` );
      console.error( 'Stack: ', err.stack );
   } );

const routes = {
   ROOT: '/',
   CATEGORIES: '/categories',
   CATEGORY_BY_ID: '/categories/:categoryId',
   REPOSITORIES_BY_CATEGORY: '/categories/:categoryId/repositories',
   REPOSITORIES: '/repositories',
   REPOSITORY_BY_ID: '/repositories/:globalRepositoryId',
   REPOSITORY_RELEASES: '/repositories/:globalRepositoryId/releases',
   REPOSITORY_RELEASE_BY_ID: '/repositories/:globalRepositoryId/releases/:releaseId'
};
const relations = {
   CATEGORY: 'category',
   CATEGORIES: 'categories',
   REPOSITORIES: 'repositories',
   REPOSITORY: 'repository',
   RELEASE: 'release',
   RELEASES: 'releases'
};

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function startServer( config ) {

   const router = new Router();
   const server = connect();
   const broker = createBroker( config );

   server.use( ( req, res ) => {
      const path = url.parse( req.url ).pathname;
      const match = router.match( path );

      if( !match ) {
         console.warn( `Found no match for url "${req.url}".` );
         res.statusCode = 404;
         res.end();
         return;
      }

      match.fn( req, res, match );
   } );

   addRoutes( config, router, broker );

   createServer( server ).listen( config.port || 8000 );

}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function addRoutes( config, router, broker ) {

   addHalRoute( routes.ROOT, () => {
      const resource = new HalResource( {}, routes.ROOT );
      resource.link( relations.CATEGORIES, routes.CATEGORIES );
      return resource;
   } );

   addHalRoute( routes.CATEGORIES, () => {
      const categoriesResource = new HalResource( {}, routes.CATEGORIES );
      return broker.getCategories()
         .then( categories => {
            return Promise.all( categories.map( category => {
               const categoryResource = resourceForCategory( category );
               categoriesResource.link( relations.CATEGORY, hrefForCategory( category ) );
               categoriesResource.embed( relations.CATEGORY, categoryResource, false );

               return broker.getRepositories( category.id )
                  .then( repositories => {
                     const repositoriesResource = resourceForRepositories( repositories, {
                        href: hrefForRepositoriesByCategory( category ),
                        embedded: true
                     } );
                     categoryResource.embed( relations.REPOSITORIES, repositoriesResource, false );
                  } );
            } ) );
         } )
         .then( () => categoriesResource );
   } );

   addHalRoute( routes.CATEGORY_BY_ID, ( { categoryId } ) => {
      return broker.findCategoryById( categoryId )
         .then( category => category ? resourceForCategory( category ) : null );
   } );

   addHalRoute( routes.REPOSITORIES_BY_CATEGORY, ( { categoryId } ) => {
      return broker.findCategoryById( categoryId )
         .then( category => {
            if( !category ) {
               return null;
            }

            const hrefForRepositories = hrefForRepositoriesByCategory( category );
            return broker.getRepositories( category.id )
               .then( repositories => resourceForRepositories( repositories, { href: hrefForRepositories } ) );
         } );
   } );

   addHalRoute( routes.REPOSITORIES, () => {
      return broker.getCategories()
         .then( categories => {
            return Promise.all( categories.map( category => broker.getRepositories( category.id ) ) )
               .then( repositoriesLists => [].concat.apply( [], repositoriesLists ) );
         } )
         .then( repositories => {
            return resourceForRepositories( repositories );
         } );
   } );

   addHalRoute( routes.REPOSITORY_BY_ID, ( { globalRepositoryId } ) => {
      const [ adapterId, repositoryId ] = globalRepositoryId.split( '__' );
      return broker.findRepositoryById( adapterId, repositoryId )
         .then( repository => repository ? resourceForRepository( repository ) : null );
   } );

   addHalRoute( routes.REPOSITORY_RELEASES, ( { globalRepositoryId } ) => {
      const [ adapterId, repositoryId ] = globalRepositoryId.split( '__' );
      return broker.findRepositoryById( adapterId, repositoryId )
         .then( repository => {
            if( !repository ) {
               return null;
            }

            return repository.getReleases()
               .then( releases => resourceForReleasesByRepository( repository, releases ) );
         } );
   } );

   addHalRoute( routes.REPOSITORY_RELEASE_BY_ID, ( { globalRepositoryId, releaseId } ) => {
      const [ adapterId, repositoryId ] = globalRepositoryId.split( '__' );
      return broker.findRepositoryById( adapterId, repositoryId )
         .then( repository => {
            if( !repository ) {
               return null;
            }

            return repository.getReleaseByVersion( releaseId )
               .then( release => resourceForRelease( repository, release ) );
         } );
   } );

   const now = () => new Date().getTime()
   const stillValid = ( { timestamp } ) => timestamp > now() - ( config.maxAgeMs || 2 * 60 * 60 * 1000 );
   let resourcesCache = {};

   function addHalRoute( route, resourceBuilder ) {
      router.addRoute( route, ( req, res, match ) => {

         const { url } = req;
         const timeoutPromise = new Promise( ( resolve, reject ) => {
            setTimeout( reject.bind( null, 'Request timed out.' ), config.requestTimeout || 60000 );
         } );

         if( url in resourcesCache && stillValid( resourcesCache[ url ] ) ) {
            console.log( `resource cache HIT for ${url}` );
            return processResourceBuilderResult( resourcesCache[ url ].resource );
         }
         console.log( `resource cache MISS for ${url}` );

         Promise.race( [ timeoutPromise, resourceBuilder( match.params, req, res ) ] )
            .then( resource => {
               if( resource ) {
                  resourcesCache[ url ] = { timestamp: now(), resource };
               }
               return resource;
            } )
            .then( processResourceBuilderResult )
            .catch( error => {
               const errorMessage = typeof error === 'string' ? error : 'Unknown internal error';
               if( error instanceof Error ) {
                  console.error( `An error occurred while serving request to ${route}: ${error}` );
                  console.error( 'Stack: ', error.stack );
               }

               res.statusCode = 500;
               res.write( errorMessage );
               res.end();
            } );

         function processResourceBuilderResult( resource ) {
            if( resource ) {
               writeCommonHeaders( res );

               res.write( JSON.stringify( resource.toJSON(), null, 3 ) );
            }
            else {
               res.statusCode = 404;
            }
            res.end();
         }

      } );
   }
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hrefForCategory = category => createUrl( routes.CATEGORY_BY_ID, { categoryId: category.id } );
function resourceForCategory( category ) {
   const categoryResource = new HalResource( category, hrefForCategory( category ) );
   categoryResource.link( relations.REPOSITORIES, hrefForRepositoriesByCategory( category ) );
   return categoryResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hrefForRepositories = category => createUrl( routes.REPOSITORIES, {} );
const hrefForRepositoriesByCategory = category => createUrl( routes.REPOSITORIES_BY_CATEGORY, { categoryId: category.id } );
function resourceForRepositories( repositories, { embedded=false, href=null}={} ) {
   const repositoriesResource = new HalResource( {}, href || hrefForRepositories() );
   repositories.forEach( repository => {
      const repositoryResource = resourceForRepository( repository );

      repositoriesResource.link( relations.REPOSITORY, hrefForRepository( repository ) );
      if( embedded ) {
         repositoriesResource.embed( relations.REPOSITORY, repositoryResource, false );
      }
   } );
   return repositoriesResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hrefForRepository = repository => createUrl( routes.REPOSITORY_BY_ID, { globalRepositoryId: globalRepositoryId( repository ) } );
function resourceForRepository( repository ) {
   const repositoryHref = hrefForRepository( repository );
   const repositoryResource = new HalResource( {
      title: repository.name,
      pushedAt: repository.pushed_at
   }, repositoryHref );
   repositoryResource.link( relations.RELEASES, `${repositoryHref}/releases` );
   return repositoryResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hrefForReleaseByRepository = ( repository, release ) => {
   return createUrl( routes.REPOSITORY_RELEASE_BY_ID, {
      globalRepositoryId: globalRepositoryId( repository ),
      releaseId: release.title
   } );
};
function resourceForRelease( repository, release ) {
   const releasehref = hrefForReleaseByRepository( repository, release );
   return new HalResource( release, releasehref );
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hrefForReleasesByRepository = repository => createUrl( routes.REPOSITORY_RELEASES, { globalRepositoryId: globalRepositoryId( repository ) } );
function resourceForReleasesByRepository( repository, releases ) {
   const releasesHref = hrefForReleasesByRepository( repository );
   const releasesResource = new HalResource( {}, releasesHref );
   releases.forEach( release => {
      releasesResource.link( relations.RELEASE, {
         href: hrefForReleaseByRepository( repository, release ),
         title: release.name
      } );
   } );
   return releasesResource;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function globalRepositoryId( repository ) {
   return encodeURIComponent( `${repository.__adapterId}__${repository.id}` );
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createUrl( route, params ) {
   return Object.keys( params ).reduce( ( url, key ) => url.replace( `:${key}`, params[ key ] ), route );
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function writeCommonHeaders( res ) {
   res.setHeader( 'Content-Type', 'application/hal+json' );
}
