import { resolve } from 'node:path'

import { build } from 'tsup'

import { ExecutorContext } from '@nx/devkit'
import { CopyAssetsHandler } from '@nx/js/src/utils/assets/copy-assets-handler'

import type { BuildExecutorSchema } from './schema'

export default async function runExecutor(
  options: BuildExecutorSchema,
  context: ExecutorContext,
) {
  const { main, outputPath, tsConfig, typings, sourceMap, assets, ...rest } =
    options
  const projectRoot = resolve(
    context.root,
    context.workspace.projects[context.projectName].root,
  )

  const assetHandler = new CopyAssetsHandler({
    projectDir: projectRoot,
    rootDir: context.root,
    outputDir: outputPath,
    assets: assets,
  })

  let assetsCopied = false
  let unregisterWatchAssets: () => void | null = null

  try {
    await build({
      ...rest,
      entry:
        typeof main === 'string'
          ? [resolve(context.root, main)]
          : Array.isArray(main)
            ? main.map((item) => resolve(context.root, item))
            : Object.keys(main).reduce(
                (acc, key) => ({
                  ...acc,
                  [key]: resolve(context.root, main[key]),
                }),
                {},
              ),
      dts: typings,
      sourcemap: sourceMap,
      outDir: resolve(context.root, outputPath),
      tsconfig: tsConfig,
      onSuccess: async () => {
        if (!assetsCopied) {
          await assetHandler.processAllAssetsOnce()
          assetsCopied = true
          if (options.watch) {
            unregisterWatchAssets =
              await assetHandler.watchAndProcessOnAssetChange()
          }
        }
      },
    })
  } catch (error) {
    console.log(error)
    if (unregisterWatchAssets) {
      unregisterWatchAssets()
    }
    return {
      success: false,
      error: error,
    }
  }

  if (unregisterWatchAssets) {
    unregisterWatchAssets()
  }
  return {
    success: true,
  }
}
