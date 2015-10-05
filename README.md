
# ChangelogViewerServer

> [JSON HAL](https://tools.ietf.org/html/draft-kelly-json-hal-07) interface for browsing versions and changelogs from different sources

This server allows browsing the versions and `CHANGELOG.md` file contents of a set of repositories.
Currently plain git hosts with [gitweb](https://git-scm.com/docs/gitweb) enabled, and [GitHub](www.github.com) repositories are supported.

Repositories are grouped by user defined categories.
In case of GitHub all repositories of one organization can be assigned to one or more categories.
The assignment of single repositories into one or more categories isn't possible for the time being.
For simple git servers categorizing is different, since they are not necessarily structured as organizational units, but instead expose a simple directory tree.
Thus, for them the assignment of categories takes place by configuring folders containing the relevant repositories.
How this configuration takes place, can be seen in the [configuration example](config_example.json).
For a simple start, you can copy this file to `config.json` and adjust it to your needs.


## Configuration

### port

The port, the server listens on when started.
If not configured, 8000 is used.


### categories

A map from category identifier to human readable name.
For now different translations are not supported.


### sources

A list of sources to fetch version information and changelogs from.
Each source has at least a `type` and `category` property.
All the other properties depend on the underlying adapter type.


#### category

The category this source will be merged into.
This has to be one of the categories defined as key in the `categories` map.


#### type

Type of the source and adapter to instantiate when fetching version data.
Currently the following types are supported.

##### github

A simple github organization.


###### organization (mandatory)

All repositories belonging to this organization will be queried for version information and `CHANGELOG.md` files


###### oauthToken (optional)

Personal OAuth token for querying the github API.
If not configured the number of requests per hour is limited to 50, otherwise 5000 requests per hour are possible.


##### gitweb

A simple git server with running gitweb service.


###### serverUrl (mandatory)

HTTP url of the git server.


###### repositoriesRoot (mandatory)

Root directory to search for repositories.
All repositories found within this directory will be queried for version information.


## Available Relations

*categories*: a list of categories

*category*: a single category with all available *repositories*

*repositories*: a list of repositories

*repository*: a single repository with all available *releases*

*releases*: a list of releases

*release*: a single release


## Available Routes

The following routes are provided by the REST interface.
The routes should not be guessed and queried directly, but resolved by following the according relation.
All routes except for `/categories` only return links for relations.
In case of `/categories` everything up to the list of repositories is embedded, since this is the common use case for our client.

`/` - API entry point (this should be the only url you need to know)

`/categories` - list of all available categories

`/categories/:categoryId` - a single category

`/categories/:categoryId/repositories` - a list of repositories belonging to the given category

`/repositories` - all repositories from all sources

`/repositories/:globalRepositoryId` - a single repository

`/repositories/:globalRepositoryId/releases` - all releases of a single repository

`/repositories/:globalRepositoryId/releases/:releaseId` - a release of a repository, carrying the contents of the `CHANGELOG.md` for the branch of the release