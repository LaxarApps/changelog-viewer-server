/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import sha1 from 'sha1';
import cachedFetch from '../cached_fetch';
import repositoryResourceFetcher from '../repository_resource_fetcher';
import { parseString as parseXmlString } from 'xml2js';
import { getMostRecentVersionFromReleases, VERSION_MATCHER } from './adapter_helper';


export default ( logger, { serverUrl, repositoriesRoot }, { resourceCachePath } ) => {

   const urlTemplates = {
      REPOSITORIES: `${serverUrl}gitweb/?a=project_index;pf=${repositoriesRoot}`,
      REPOSITORY: `${serverUrl}gitweb/?p=[repository];a=atom`,
      REPOSITORY_TAGS: `${serverUrl}gitweb/?p=[repository];a=tags`,
      CHANGELOG: `${serverUrl}gitweb/?p=[repository];a=blob_plain;f=CHANGELOG.md;hb=refs/heads/[branch]`
   };

   const resourceFetcher = repositoryResourceFetcher( logger, { resourceCachePath } );
   const { getText, clearCache } = cachedFetch( 60 * 60 * 1000 );
   const api = {
      getRepositories,
      getRepositoryById,
      clearCache: clearCache
   };
   const headers = {};

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getText( urlTemplates.REPOSITORIES, headers )
         .then( text => {
            return Promise.all( ( text || '' ).split( '\n' )
               .map( line => line.split( ' ' )[0] )
               .filter( repositoryId => !!repositoryId )
               .map( repositoryId => getRepositoryById( repositoryId ) ) );
         } );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById( repositoryId ) {
      const url = urlTemplates.REPOSITORY.replace( '[repository]', repositoryId );
      const tagsUrl = urlTemplates.REPOSITORY_TAGS.replace( '[repository]', repositoryId );

      return Promise.all( [ getText( url, headers ), getText( tagsUrl, headers ) ] )
         .then( ( [ repoText, tagsText ] ) => {
            if( !repoText ) {
               return [ null, null ];
            }

            return Promise.all( [
               new Promise( ( resolve, reject ) => {
                  parseXmlString( repoText, ( err, result ) => err ? reject( err ) : resolve( result ) );
               } ),
               new Promise( ( resolve, reject ) => {
                  parseXmlString( tagsText, ( err, result ) => err ? reject( err ) : resolve( result ) );
               } )
            ] );
         } )
         .then( ( [ repoTree, tagsTree ] ) => {
            // the underscore references a node's character content
            // we don't want to have the newest version here, but the tag most recently pushed
            const mostRecentTag = path( tagsTree, 'html.body.0.table.0.tr.0.td.1.a.0._', '' ).trim();
            const updated = path( repoTree, 'feed.updated.0', null );
            // fuzzy logic for organizations: take the path fragment right before the *.git part
            const [ , organization, name ] = repositoryId.match( /([^\/]+)\/([^\/]+)\.git$/ );

            return {
               id: repositoryId,
               name: name,
               organization: organization,
               pushedAt: updated,
               cacheHash: sha1( mostRecentTag )
            };
         } )
         .then( createRepository );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository( repositoryData ) {
      const get = url => resourceFetcher.fetch( repositoryData, url, headers );
      const proto = {
         getReleases() {
            const url = urlTemplates.REPOSITORY_TAGS.replace( '[repository]', repositoryData.id );

            return get( url )
               .then( text => {
                  if( !text ) {
                     return null;
                  }

                  return new Promise( ( resolve, reject ) => {
                     parseXmlString( text, ( err, result ) => err ? reject( err ) : resolve( result ) );
                  } );
               } )
               .then( tree => {
                  const tagTableRows = path( tree, 'html.body.0.table.0.tr', [] );
                  // the underscore references a node's character content
                  return tagTableRows.map( row => path( row, 'td.1.a.0._', '' ).trim() );
               } )
               .then( tags => {
                  const versionData = tags.reduce( (acc, tag) => {
                     const match = VERSION_MATCHER.exec( tag );
                     if( match ) {
                        const [ name, major, minor/*, patch*/ ] = match;
                        const versionTag = `v${major}.${minor}.x`;
                        if( !( versionTag in acc ) ) {
                           acc[ versionTag ] = {
                              versions: [],
                              title: versionTag
                           };
                        }

                        acc[ versionTag ].versions.push( name );
                     }
                     return acc;
                  }, {} );

                  return Object.keys( versionData ).map( key => versionData[ key ] );
               } )
               .catch( err => {
                  logger.error( `Failed to get releases for repository "${repositoryData.name}" (URL: "${url}")` );
                  return logPossibleFetchError( err );
               } );
         },


         getReleaseByVersion( version ) {
            const baseUrl = urlTemplates.CHANGELOG.replace( '[repository]', repositoryData.id );
            const releaseUrl = baseUrl.replace( '[branch]', `release-${version}` );
            return get( releaseUrl )
               .then( changelog => {
                  return {
                     title: `v${version}`,
                     changelog: changelog
                  };
               } )
               .catch( err => {
                  if( err.status === 404 ) {
                     // older releases often lack a changelog file. Hence we ignore this case here
                     return {
                        title: `v${version}`,
                        changelog: ''
                     };
                  }
                  logger.error( `Failed to get release for verion "${version}" (URL: "${releaseUrl}")` );
                  return logPossibleFetchError( err );
               } );
         }
      };

      return proto.getReleases()
         .then( getMostRecentVersionFromReleases )
         .then( mostRecentVersion => {
            const repository = Object.create( proto );
            repositoryData.mostRecentVersion = mostRecentVersion;
            Object.keys( repositoryData )
               .forEach( key => {
                  Object.defineProperty( repository, key, {
                     enumerable: true,
                     value: repositoryData[ key ]
                  } );
               } );
            return repository;
         } );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function logPossibleFetchError( err ) {
      if( err.headers && err.status ) {
         logger.error( `Response Status: %s`, err.status );
         logger.error( `Response Headers: %j`, err.headers );
      }
      else {
         logger.error( `Error: `, err );
      }
      return Promise.reject( err );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function path( obj, path, optionalDefault ) {
      const val = path.split( '.' ).reduce( ( node, fragment ) => node ? node[ fragment ] : node, obj );
      return val !== undefined ? val : optionalDefault;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;

};
