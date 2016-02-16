/**
 * Copyright 2016 aixigo AG
 * Released under the MIT license.
 */
export const VERSION_MATCHER = /^v(\d+)\.(\d+)\.(\d+)$/;

export function getMostRecentVersionFromReleases( releases ) {
   const versionObject = releases.reduce( ( mostRecentVersion, { versions } ) => {
      return versions.reduce( ( mostRecentVersion, versionString ) => {
         const [ name, major, minor, patch ] = VERSION_MATCHER.exec( versionString );
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
