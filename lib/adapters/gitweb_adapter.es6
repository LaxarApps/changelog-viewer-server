/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import cachedFetch from '../cached_fetch';
import xml from 'xml-selector';
import { exec } from 'child_process';


export default ( { serverUrl, repositoriesRoot } ) => {

   const urlTemplates = {
      REPOSITORIES: `${serverUrl}gitweb/?a=project_index;pf=${repositoriesRoot}`,
      REPOSITORY: `${serverUrl}gitweb/?p=[repository];a=atom`,
      REPOSITORY_GIT_URL: `${serverUrl}[repository]`,
      CHANGELOG: `${serverUrl}gitweb/?p=[repository];a=blob_plain;f=CHANGELOG.md;hb=refs/heads/[branch]`
   };
   const VERSION_MATCHER = /refs\/tags\/v(\d+)\.(\d+)\.(\d+)$/;

   const { getText } = cachedFetch();
   const api = {
      getRepositories,
      getRepositoryById
   };
   const headers = {};

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositories() {
      return getText( urlTemplates.REPOSITORIES, headers )
         .then( text => {
            return Promise.all( text.split( '\n' )
               .map( line => line.split( ' ' )[0] )
               .map( repository => getRepositoryById( repository ) ) );
         } );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function getRepositoryById( repositoryId ) {
      const url = urlTemplates.REPOSITORY.replace( '[repository]', repositoryId );
      return getText( url, headers )
         .then( text => {
            const pushedAt = xml( text ).find( '> feed > updated' ).first().text();
            return {
               id: repositoryId,
               name: repositoryId,
               pushed_at: pushedAt
            };
         } )
         .then( createRepository );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository( repositoryData ) {

      const proto = {
         getReleases: () => {
            const url = urlTemplates.REPOSITORY_GIT_URL.replace( '[repository]', repositoryData.id );
            return runGitLsRemote( url, '--tags' )
               .then( text => {
                  const versionData = text.split( '\n' )
                     .reduce( ( acc, line ) => {
                        const match = VERSION_MATCHER.exec( line.trim() );
                        if( match ) {
                           const [ name, major, minor, patch ] = match;
                           const release = `${major}.${minor}.x`;
                           if( !( release in acc ) ) {
                              acc[ release ] = {
                                 versions: [],
                                 name: release
                              }
                           }

                           acc[ release ].versions.push( name );
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

      let repository = Object.create( proto );
      Object.keys( repositoryData )
         .forEach( key => {
            Object.defineProperty( repository, key, {
               enumerable: true,
               value: repositoryData[ key ]
            } );
         } );
      return repository;
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function runGitLsRemote( repository, args ) {
      return new Promise( ( resolve, reject ) => {
         const command = `git ls-remote ${args} ${repository}`;

         exec( command, ( err, stdout, stderr ) => {
            if( err ) {
               console.error( stderr );
               return reject( err );
            }

            resolve( stdout );
         } );
      } );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return api;

};
