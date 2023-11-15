# Nx Toolset

This monorepo contains a set of tools for working with Nx workspaces.

## Nx tsup

`tsup` is a tool for bundling TypeScript projects. This executor allows you to use `tsup` to build your packages instead of the ones provided by `@nx/js`.

## Nx Yarn Publish

When working with Nx and Yarn, it can be difficult to publish packages. This executor allows you to publish packages using `yarn npm publish`. By default yarn will not publish packages that are not listed in the workspaces and adding your dist folder to the workspaces will cause duplicate packages error. This executor will publish your packages without having to add your dist folder to the workspaces.
