/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import cachedFetch from '../cached_fetch';
import { parseString as parseXmlString } from 'xml2js';
import { exec } from 'child_process';


export default ( { serverUrl, repositoriesRoot } ) => {

   const urlTemplates = {
      REPOSITORIES: `${serverUrl}gitweb/?a=project_index;pf=${repositoriesRoot}`,
      REPOSITORY: `${serverUrl}gitweb/?p=[repository];a=atom`,
      REPOSITORY_TAGS: `${serverUrl}gitweb/?p=[repository];a=tags`,
      CHANGELOG: `${serverUrl}gitweb/?p=[repository];a=blob_plain;f=CHANGELOG.md;hb=refs/heads/[branch]`
   };
   const VERSION_MATCHER = /^v(\d+)\.(\d+)\.(\d+)$/;

   const { getText, clearCache } = cachedFetch();
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
      return getText( url, headers )
         .then( text => {
            if( !text ) {
               return null;
            }

            return new Promise( ( resolve, reject ) => {
               parseXmlString( text, ( err, result ) => err ? reject( err ) : resolve( result ) );
            } );
         } )
         .then( tree => {
            const updated = ( tree && tree.feed && tree.feed.updated && tree.feed.updated[0] ) || null;
            // fuzzy logic for organizations: take the path fragment right before the *.git part
            const [ , organization, name ] = repositoryId.match( /([^\/]+)\/([^\/]+)\.git$/ );
            return {
               id: repositoryId,
               name: name,
               organization: organization,
               pushedAt: updated
            };
         } )
         .then( createRepository );
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createRepository( repositoryData ) {

      const proto = {
         getReleases: () => {
            const url = urlTemplates.REPOSITORY_TAGS.replace( '[repository]', repositoryData.id );
            return getText( url, headers )
               .then( text => {
                  if( !text ) {
                     return null;
                  }

                  return new Promise( ( resolve, reject ) => {
                     parseXmlString( text, ( err, result ) => err ? reject( err ) : resolve( result ) );
                  } );
               } )
               .then( tree => {
                  const body = ( tree && tree.html && tree.html.body && tree.html.body[0] );
                  const table = ( body && body.table && body.table[0] );
                  const tds = ( table && table.tr && table.tr.map( tr => tr.td && tr.td[1] && tr.td[1] ) );
                  const as = tds && tds.map( td => td.a && td.a[0] && td.a[0] );
                  const texts = as && as.map( a => a._ && a._.trim() );
                  return texts || [];
               } )
               .then( tags => {
                  const versionData = tags.reduce( (acc, tag) => {
                     const match = VERSION_MATCHER.exec( tag );
                     if( match ) {
                        const [ name, major, minor, patch ] = match;
                        const versionTag = `v${major}.${minor}.x`;
                        if( !( versionTag in acc ) ) {
                           acc[ versionTag ] = {
                              versions: [],
                              title: versionTag
                           }
                        }

                        acc[ versionTag ].versions.push( `refs/tags/${name}` );
                     }
                     return acc;
                  }, {} );

                  return Object.keys( versionData ).map( key => versionData[ key ] );
               } );
         },


         getReleaseByVersion: ( version ) => {
            const baseUrl = urlTemplates.CHANGELOG.replace( '[repository]', repositoryData.id );
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

   function runGitLsRemote( repositoryUrl ) {
      return new Promise( ( resolve, reject ) => {
         const command = `git ls-remote --tags ${repositoryUrl}`;

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
