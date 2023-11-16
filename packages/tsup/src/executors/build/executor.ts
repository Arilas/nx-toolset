import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chdir, cwd } from 'node:process'

import { build } from 'tsup'

import { ExecutorContext } from '@nx/devkit'
import { CopyAssetsHandler } from '@nx/js/src/utils/assets/copy-assets-handler'

import type { BuildExecutorSchema } from './schema'

export default async function runExecutor(
  options: BuildExecutorSchema,
  context: ExecutorContext,
) {
  const {
    main,
    outputPath,
    outDir,
    tsConfig,
    typings,
    sourceMap,
    assets,
    ...rest
  } = options
  const projectRoot = resolve(
    context.root,
    context.workspace.projects[context.projectName].root,
  )

  if (options.clean) {
    try {
      await rm(resolve(context.root, outputPath), {
        recursive: true,
      })
    } catch (error) {
      if (error.code !== 'ENOENT') {
        return {
          success: false,
          error: error,
        }
      }
    }
  }

  const assetHandler = new CopyAssetsHandler({
    projectDir: projectRoot,
    rootDir: context.root,
    outputDir: resolve(context.root, outputPath),
    assets: assets,
  })

  let assetsCopied = false
  let unregisterWatchAssets: () => void | null = null
  const originalCwd = cwd()

  try {
    // Change directory to the project root so that tsup will be able to find the tsconfig.json and look for the package.json dependencies
    chdir(projectRoot)
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
      outDir: resolve(context.root, outputPath, outDir ?? 'dist'),
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
    if (unregisterWatchAssets) {
      unregisterWatchAssets()
    }
    return {
      success: false,
      error: error,
    }
  }
  chdir(originalCwd)

  if (unregisterWatchAssets) {
    unregisterWatchAssets()
  }
  return {
    success: true,
  }
}
