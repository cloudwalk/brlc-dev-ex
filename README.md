# brlc-dev-ex
This repository contains utilities for smart contracts development

## Content
1. Shared workflows to use in every Smart-contract repos
1. Prettier configuration
1. Eslint configuration

## Dev enviroment setup
1. Generate an NPM registry token with `read:packages` permission [here](https://github.com/settings/tokens).
1. Add token to your global `.npmrc` file for github npm registry [file reference](https://docs.npmjs.com/cli/v11/configuring-npm/npmrc):
    ```
    //npm.pkg.github.com/:_authToken=ghp_************
    ```
    Linux/MacOS: `~/.npmrc`
    
    Windows: `%USERPROFILE%\.npmrc`
