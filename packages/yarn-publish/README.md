# nx-yarn-publish

A plugin to help make nx with yarn a pleasant experience.

## Install

```shell
yarn add nx-yarn-publish
```

## Executors

### `nx-yarn-publish:publish`

Modifies the yarn workspace to point to the dist folder and runs `yarn` followed by `yarn npm publish`.
Cleanup points the workspace back to what it was originally and then runs `yarn` again.

These steps are required because you cannot publish a folder that is not a part of your yarn workspace.

Example usage for `project.json`:

```json
{
  "root": "packages/my-package",
  "sourceRoot": "packages/my-package/src",
  "projectType": "library",
  "targets": {
    "publish": {
      "executor": "nx-yarn-publish:publish",
      "options": {
        "outputPath": "dist/packages/my-package",
        "publishTag": "alpha",
        "access": "restricted"
      }
    }
  }
}
```
