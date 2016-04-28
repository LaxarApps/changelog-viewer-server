/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import sha1 from 'sha1';
import cachedFetch from '../cached_fetch';
import repositoryResourceFetcher from '../repository_resource_fetcher';
import { getMostRecentVersionFromReleases, VERSION_MATCHER } from './adapter_helper';


export default ( logger, { category, organization, oauthToken }, { resourceCachePath } ) => {

   const urlTemplates = {
      REPOSITORIES: `https://api.github.com/users/${organization}/repos?per_page=100`,
      TAGS: `https://api.github.com/repos/${organization}/[repository]/tags?per_page=100`,
      CHANGELOG: `https://raw.githubusercontent.com/${organization}/[repository]/[branch]/CHANGELOG.md`
   };

   const resourceFetcher = repositoryResourceFetcher( logger, { resourceCachePath } );
   const { getJson, clearCache } = cachedFetch( 60 * 60 * 1000 );
   const api = {
      getRepositories,
      getRepositoryById,
      clearCache: clearCache
   };
   const headers = { 'user-agent': 'node.js' };

   if( !oauthToken ) {
      logger.warn( `No oauth token for github adapter configured
                     (category: ${category}, organization: ${organization})` );
   }
   else {
      headers[ 'Authorization' ] = `token ${oauthToken}`;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getJson( urlTemplates.REPOSITORIES, headers )
         .then( repositories => Promise.all( repositories.map( createRepository ) ) );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById( repositoryId ) {
      return getRepositories()
         .then( repositories => repositories.filter( ( { id } ) => `${repositoryId}` === `${id}` ) )
         .then( repositories => repositories.length > 0 ? repositories[ 0 ] : null );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository( repositoryData ) {

      const normalizedData = {
         id: repositoryData.id,
         name: repositoryData.name,
         pushedAt: repositoryData.pushed_at,
         organization: repositoryData.full_name.split( '/' )[0]
      };
      const dataForFetch = { ...normalizedData, cacheHash: sha1( normalizedData.pushedAt ) };
      const get = url => resourceFetcher.fetch( dataForFetch, url, headers );

      const proto = {
         getReleases() {
            const url = urlTemplates.TAGS.replace( '[repository]', repositoryData.name );

            return get( url )
               .then( data => JSON.parse( data ) )
               .then( tags => tags.map( tag => tag.name ) )
               .then( versions => {
                  const versionData = versions.reduce( ( acc, version ) => {
                     const match = VERSION_MATCHER.exec( version );
                     if( match ) {
                        const [ name, major, minor, /*patch*/ ] = match;
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
            const baseUrl = urlTemplates.CHANGELOG.replace( '[repository]', repositoryData.name );
            const releaseUrl = baseUrl.replace( '[branch]', `release-${version}` );
            return get( releaseUrl )
               .then( changelog => {
                  return {
                     title: `v${version}`,
                     changelog: changelog
                  };
               } )
               .catch( err => {
                  // older releases often lack a changelog file. Hence we ignore this case here
                  return {
                     title: `v${version}`,
                     changelog: ''
                  };
                  logger.error( `Failed to get release for verion "${version}" (URL: "${releaseUrl}")` );
                  return logPossibleFetchError( err );
               } );
         }
      };

      return proto.getReleases()
         .then( getMostRecentVersionFromReleases )
         .then( mostRecentVersion => {
            return Object.create( proto, {
               id: {
                  enumerable: true,
                  value: normalizedData.id
               },
               name: {
                  enumerable: true,
                  value: normalizedData.name
               },
               pushedAt: {
                  enumerable: true,
                  value: normalizedData.pushedAt
               },
               organization: {
                  enumerable: true,
                  value: normalizedData.organization
               },
               mostRecentVersion: {
                  enumerable: true,
                  value: mostRecentVersion
               }
            } );
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

   return api;

};
