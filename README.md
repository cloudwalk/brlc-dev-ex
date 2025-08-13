# brlc-dev-ex
This repository contains utilities for smart contracts development

## Content
1. Shared workflows to use in every Smart-contract repos
1. Prettier configuration
1. Eslint configuration

## Using NPM Packages

To use GitHub NPM packages, you need to authenticate your npm client with the GitHub npm registry. This only needs to be done once.

For step-by-step instructions, refer to the [GitHub documentation on authenticating with a personal access token](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-with-a-personal-access-token).

**Quick Start:**

1. Generate a personal access token [here](https://github.com/settings/tokens).
2. Run the following command in your terminal:
```bash
$ npm login --scope=@cloudwalk --auth-type=legacy --registry=https://npm.pkg.github.com

> Username: USERNAME
> Password: TOKEN
```