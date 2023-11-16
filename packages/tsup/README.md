# nx-tsup

tsup executor for nx.

Tsup is a zero-config TypeScript bundler powered by esbuild. It's fast, supports TypeScript out of the box, and can be extended via plugins.
It's also provides ability to generate types for your bundled code, esm and cjs bundles, supports decorators, etc.

## Install

```shell
yarn add nx-tsup
```

or with npm

```shell
npm install nx-tsup
```

## Executors

### `nx-tsup:build`

Builds a package using tsup. For more information on tsup, see [tsup](https://tsup.egoist.dev/).

Example usage for `project.json`:

```json
{
  "root": "packages/my-package",
  "sourceRoot": "packages/my-package/src",
  "projectType": "library",
  "targets": {
    "publish": {
      "executor": "nx-tsup:build",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/packages/my-package",
        "main": "packages/my-package/src/index.ts",
        "tsConfig": "packages/my-package/tsconfig.lib.json",
        "assets": [
          "packages/my-package/*.md",
          {
            "input": "./packages/my-package/src",
            "glob": "**/!(*.ts)",
            "output": "./src"
          }
        ]
      }
    }
  }
}
```
