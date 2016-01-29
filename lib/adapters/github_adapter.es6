/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import cachedFetch from '../cached_fetch';


export default ( { category, organization, oauthToken } ) => {

   const urlTemplates = {
      REPOSITORIES: `https://api.github.com/users/${organization}/repos?per_page=100`,
      TAGS: `https://api.github.com/repos/${organization}/[repository]/tags?per_page=100`,
      CHANGELOG: `https://raw.githubusercontent.com/${organization}/[repository]/[branch]/CHANGELOG.md`
   };
   const VERSION_MATCHER = /^v(\d+)\.(\d+)\.(\d+)$/;

   const { getText, getJson, clearCache } = cachedFetch( 0 );
   const api = {
      getRepositories,
      getRepositoryById,
      clearCache: clearCache
   };
   let headers = { 'user-agent': 'node.js' };

   if( !oauthToken ) {
      console.warn( `No oauth token for github adapter configured
                     (category: ${category}, organization: ${organization})` );
   }
   else {
      headers[ 'Authorization' ] = `token ${oauthToken}`;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getJson( urlTemplates.REPOSITORIES, headers )
         .then( repositories => repositories.map( createRepository ) );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById( repositoryId ) {
      return getRepositories()
         .then( repositories => repositories.filter( ( { id } ) => `${repositoryId}` === `${id}` ) )
         .then( repositories => repositories.length > 0 ? repositories[ 0 ] : null );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository( repositoryData ) {

      const proto = {
         getReleases: () => {
            const url = urlTemplates.TAGS.replace( '[repository]', repositoryData.name );

            return getJson( url, headers )
               .then( tags => tags.map( tag => tag.name ) )
               .then( versions => {
                  const versionData = versions.reduce( ( acc, version ) => {
                     const match = VERSION_MATCHER.exec( version );
                     if( match ) {
                        const [ name, major, minor, patch ] = match;
                        const versionTag = `v${major}.${minor}.x`;
                        if( !( versionTag in acc ) ) {
                           acc[ versionTag ] = {
                              versions: [],
                              title: versionTag
                           }
                        }

                        acc[ versionTag ].versions.push( name );
                     }
                     return acc;
                  }, {} );

                  return Object.keys( versionData ).map( key => versionData[ key ] );
               } );
         },


         getReleaseByVersion: ( version ) => {
            const baseUrl = urlTemplates.CHANGELOG.replace( '[repository]', repositoryData.name );
            const releaseUrl = baseUrl.replace( '[branch]', `release-${version}` );
            return getText( releaseUrl, headers )
               .then( changelog => {
                  return {
                     title: `v${version}`,
                     changelog: changelog
                  }
               }, err => {
                  console.log( 'rejected:', err );
               } );
         }
      };

      return Object.create( proto, {
         id: {
            enumerable: true,
            value: repositoryData.id
         },
         name: {
            enumerable: true,
            value: repositoryData.name
         },
         pushedAt: {
            enumerable: true,
            value: repositoryData.pushed_at
         },
         organization: {
            enumerable: true,
            value: repositoryData.full_name.split( '/' )[0]
         }
      } );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;

};
