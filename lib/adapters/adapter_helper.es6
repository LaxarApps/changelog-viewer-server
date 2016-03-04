/**
 * Copyright 2016 aixigo AG
 * Released under the MIT license.
 */
export const VERSION_MATCHER = /^v(\d+)\.(\d+)\.(\d+)$/;

const isNum = _ => /^[0-9]+$/.test( _ );

export function getMostRecentVersionFromReleases( releases ) {
   const versionObject = releases.reduce( ( mostRecentVersion, { versions } ) => {
      return versions.reduce( ( mostRecentVersion, versionString ) => {
         const [ , major, minor, patch ] = VERSION_MATCHER.exec( versionString )
            .map( part => isNum( part ) ? parseInt( part, 10 ) : part );
         const versionObject = { major, minor, patch };
         if( !mostRecentVersion ) {
            return versionObject;
         }
         if( major > mostRecentVersion.major ) {
            return versionObject;
         }
         else if( major === mostRecentVersion.major ) {
            if( minor > mostRecentVersion.minor ) {
               return versionObject;
            }
            else if( minor === mostRecentVersion.minor && patch > mostRecentVersion.patch ) {
               return versionObject;
            }
         }

         return mostRecentVersion;
      }, mostRecentVersion );
   }, null );
   return versionObject ? `v${versionObject.major}.${versionObject.minor}.${versionObject.patch}` : null;
}
