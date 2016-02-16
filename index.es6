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
import cachedFetch from './lib/cached_fetch';


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
const relations = {
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

   addRoutes( config, { router, broker } );

   createServer( server ).listen( config.port || 8000 );

}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function addRoutes( config, { router, broker } ) {

   let resourcesCache = {};
   const { getJson, clearCache } = cachedFetch( 0 );

   // HAL routes

   addHalRoute( routes.ROOT, () => {
      const resource = new HalResource( {}, routes.ROOT );
      resource.link( relations.CACHE, routes.CACHE );
      resource.link( relations.CATEGORIES, routes.CATEGORIES );
      if( config.componentMapUrl ) {
         resource.link( relations.COMPONENT_MAP, routes.COMPONENT_MAP );
      }
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

   addHalRoute( routes.COMPONENT_MAP, () => {
      return readComponentMap( config.componentMapUrl )
         .then( componentMap => componentMap ? resourceForComponentMap( componentMap ) : null, err => {
            console.error( err );
            console.error( err.stack );
            return null;
         } );
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
            if( releaseId.indexOf( 'v' ) !== 0 ) {
               return null;
            }

            const version = releaseId.substr( 1 );
            return repository.getReleaseByVersion( version )
               .then( release => resourceForRelease( repository, release ) );
         } );
   } );

   // low level routes

   router.addRoute( routes.CACHE, ( { method }, res ) => {

      if( method === 'DELETE' || method === 'POST' ) {
         clearCache();
         resourcesCache = {};
         broker.clearCache();

         res.statusCode = 204;
         if( method === 'POST' ) {
            res.statusCode = 202;
            refreshCache();
         }

         res.end();
         return;
      }

      res.statusCode = 405;
      res.end();
   } );

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function addHalRoute( route, resourceBuilder ) {
      router.addRoute( route, ( req, res, match ) => {

         const { url } = req;
         const timeoutPromise = new Promise( ( resolve, reject ) => {
            setTimeout( reject.bind( null, 'Request timed out.' ), config.requestTimeout || 60000 );
         } );

         if( url in resourcesCache && stillValid( resourcesCache[ url ] ) ) {
            return processResourceBuilderResult( resourcesCache[ url ].resource );
         }

         Promise.race( [ timeoutPromise, resourceBuilder( match.params, req, res ) ] )
            .then( resource => {
               if( resource ) {
                  resourcesCache[ url ] = { timestamp: Date.now(), resource };
               }
               return resource;
            } )
            .then( processResourceBuilderResult )
            .catch( error => {
               const errorMessage = typeof error === 'string' ? error : 'Unknown internal error';
               if( error instanceof Error ) {
                  console.error( `An error occurred while serving request to ${route}: ${error}` );
                  console.error( `URL: ${url}` );
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

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function stillValid( { timestamp } ) {
      if( !( 'resourceCacheMaxAgeMs' in config ) ) {
         config.resourceCacheMaxAgeMs = 2 * 60 * 60 * 1000;
      }
      if( config.resourceCacheMaxAgeMs < 0 ) {
         return true;
      }
      return timestamp > Date.now() - config.resourceCacheMaxAgeMs;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   let alreadyRefreshing = false;
   function refreshCache() {
      if( alreadyRefreshing ) {
         return Promise.resolve();
      }

      alreadyRefreshing = true;

      const baseUrl = `http://localhost:${config.port}`;
      const startTime = Date.now();
      return getJson( `${baseUrl}${routes.CATEGORIES}` )
         .then( followAllLinksRecursively.bind( null, [] ) )
         .then( links => {
            console.log( `Refreshed cache in ${Date.now() - startTime}ms. Followed ${links.length} links.` );
         }, err => console.error( err ) )
         .then( () => alreadyRefreshing = false );

      function followAllLinksRecursively( seenLinks, halResponse ) {
         if( !halResponse || !halResponse._links ) {
            return Promise.resolve( seenLinks );
         }

         const links = Object.keys( halResponse._links )
            .filter( relation => relation !== 'self' )
            .map( relation => halResponse._links[ relation ] )
            .map( linkObject => Array.isArray( linkObject ) ? linkObject : [ linkObject ] )
            .reduce( ( links, linkObject ) => {
               return linkObject.reduce( ( objectLinks, { href } ) => {
                  if( seenLinks.indexOf( href ) === -1 ) {
                     seenLinks.push( href );
                     return [ ...objectLinks, `${baseUrl}${href}` ];
                  }
                  return objectLinks;
               }, links );
            }, [] );

         return links.reduce( ( promise, link ) => {
            return promise
               .then( seenLinks => {
                  return getJson( link )
                     .then( response => followAllLinksRecursively( seenLinks, response ) );
               } );
         }, Promise.resolve( seenLinks ) );
      }
   }
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hrefForComponentMap = () => createUrl( routes.COMPONENT_MAP, {} );
function resourceForComponentMap( componentMap ) {
   return new HalResource( componentMap, hrefForComponentMap() );
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

      if( embedded ) {
         repositoriesResource.link( relations.REPOSITORY, hrefForRepository( repository ) );
         repositoriesResource.embed( relations.REPOSITORY, repositoryResource, false );
      }
      else {
         repositoriesResource.link( relations.REPOSITORY, {
            href: hrefForRepository( repository ),
            title: repositoryResource.title
         } );
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
      pushedAt: repository.pushedAt,
      organization: repository.organization,
      mostRecentVersion: repository.mostRecentVersion
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
   const releaseHref = hrefForReleaseByRepository( repository, release );
   return new HalResource( release, releaseHref );
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hrefForReleasesByRepository = repository => createUrl( routes.REPOSITORY_RELEASES, { globalRepositoryId: globalRepositoryId( repository ) } );
function resourceForReleasesByRepository( repository, releases ) {
   const releasesHref = hrefForReleasesByRepository( repository );
   const releasesResource = new HalResource( {}, releasesHref );
   releases.forEach( release => {
      releasesResource.link( relations.RELEASE, {
         href: hrefForReleaseByRepository( repository, release ),
         title: release.title
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

//////////////////////////////////////////////////////////////////////////////////////////////////////////////

function readComponentMap( componentMapUrl ) {
   const [ , protocol, path ] =
      componentMapUrl.match( /^([a-z0-9]+):\/\/(.*)$/i ) || [ , 'file', componentMapUrl ];
   if( [ 'http', 'https' ].indexOf( protocol ) !== -1 ) {
      return cachedFetch().getJson( componentMapUrl );
   }
   else if( protocol === 'file' ) {
      return new Promise( ( resolve, reject ) => {
         readFile( path, ( err, string ) =>  err ? reject( err ) : resolve( string ) );
      } )
         .then( string => JSON.parse( string ) )
   }

   return Promise.reject( new Error( `Unsupported protocol "${protocol}".` ) );
}
