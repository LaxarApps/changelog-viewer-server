/**
 * Copyright 2016 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import fs from 'fs-promise';
import path from 'path';
import sanitize from 'sanitize-filename';
import sha1 from 'sha1';
import cachedFetch from './cached_fetch';

export default ( logger, { resourceCachePath } ) => {

   const { getText } = cachedFetch( 0 );

   const memCache = {};

   return {
      fetch( repository, url, headers={} ) {
         const filename = cacheFileName( repository, url );

         const cacheData = memCache[ filename ];
         if( cacheData && cacheData.cacheHash === repository.cacheHash ) {
            logger.verbose( `FROM CACHE (memory): ${url}` );
            return Promise.resolve( cacheData.data );
         }

         return fs.exists( filename )
            .then( exists => {
               if( !exists ) {
                  return null;
               }

               return fs.readFile( filename )
                  .then( string => JSON.parse( string ) )
                  .then( cacheData => {
                     if( cacheData.cacheHash !== repository.cacheHash ) {
                        return null;
                     }

                     logger.verbose( `FROM CACHE (file): ${url}` );
                     memCache[ filename ] = cacheData;
                     return cacheData.data;
                  } );
            } )
            .then( data => {
               if( data != null ) {
                  return data;
               }

               logger.verbose( `FETCHING: ${url}` );

               return getText( url, headers )
                  .then( data => {
                     memCache[ filename ] = {
                        url: url,
                        cacheHash: repository.cacheHash,
                        data: data
                     };
                     return fs.writeFile( filename, JSON.stringify( memCache[ filename ], null, 2 ) )
                        .then( () => data );
                  } );
            } );
      }
   };

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function cacheFileName( repository, url ) {
      const sanitizedCacheFile = sanitize( `${repository.organization}_${repository.name}_${sha1(url)}` );
      return path.join( resourceCachePath, sanitizedCacheFile );
   }

};
