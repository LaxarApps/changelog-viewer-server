/**
 * Copyright 2015 aixigo AG
 * Released under the MIT license.
 */
import { Promise } from 'es6-promise';
import fetch from 'node-fetch';

const TWO_HOURS = 2 * 60 * 60 * 1000;

export default ( maxAgeMs=TWO_HOURS ) => {

   const now = () => new Date().getTime()
   const stillValid = ( { timestamp } ) => timestamp > now() - maxAgeMs;

   let cache = {};

   const api = {
      getText: ( url, headers ) => {
         const cacheEntry = cache[ url ];
         console.log( url );
         if( cacheEntry && stillValid( cacheEntry ) ) {
            return Promise.resolve( cacheEntry.responseData );
         }

         return fetch( url, { headers: headers || {} } )
            .then( response => {
               if( [ '4', '5' ].indexOf( `${response.status}`.charAt( 0 ) ) > -1 ) {
                  return null;
               }
               return response.text();
            } )
            .then( responseData => {
               cache[ url ] = { responseData, timestamp: now() };
               return responseData;
            } );
      },
      getJson: ( url, headers ) => api.getText( url, headers ).then( JSON.parse )
   };

   return api;

}
