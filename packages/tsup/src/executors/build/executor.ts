import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chdir, cwd } from 'node:process'

import { build } from 'tsup'

import { ExecutorContext } from '@nx/devkit'
import { CopyAssetsHandler } from '@nx/js/src/utils/assets/copy-assets-handler'
import { checkDependencies } from '@nx/js/src/utils/check-dependencies'

import { updatePackageJson } from '../../utils/package-json/update-package-json'
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
    skipPackageJsonGeneration = false,
    assets = [],
    ...rest
  } = options

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

  const { projectRoot, tmpTsConfig, target, dependencies } = checkDependencies(
    context,
    options.tsConfig,
  )
  if (tmpTsConfig) {
    options.tsConfig = tmpTsConfig
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

  const entryPoint =
    typeof main === 'string'
      ? main
      : Array.isArray(main)
        ? main[0]
        : main['index'] ?? main['main'] ?? main['src/index'] ?? main['src/main']

  if (!entryPoint) {
    throw new Error(
      'No entry point found. Please specify a "index" or "main" option in your tsup main field.',
    )
  }

  try {
    // Change directory to the project root so that tsup will be able to find the tsconfig.json and look for the package.json dependencies
    chdir(projectRoot)
    await build({
      ...rest,
      entry:
        typeof main === 'string'
          ? [resolveEntry(main, context.root, projectRoot)]
          : Array.isArray(main)
            ? main.map((item) => resolveEntry(item, context.root, projectRoot))
            : Object.keys(main).reduce(
                (acc, key) => ({
                  ...acc,
                  [key]: resolveEntry(main[key], context.root, projectRoot),
                }),
                {},
              ),
      dts: typings,
      sourcemap: sourceMap,
      outDir: resolve(context.root, outputPath, outDir ?? 'dist'),
      tsconfig: tsConfig,
      onSuccess: async () => {
        if (!assetsCopied) {
          if (!skipPackageJsonGeneration) {
            updatePackageJson(
              {
                ...options,
                outputPath: resolve(context.root, outputPath),
                entries: typeof main === 'string' ? [main] : main,
                outDir: outDir ?? 'dist',
                projectRoot,
                // @ts-expect-error iife is not a valid format for tsup
                format:
                  typeof options.format === 'string'
                    ? [options.format]
                    : options.format,
                // As long as d.ts files match their .js counterparts, we don't need to emit them.
                // TSC can match them correctly based on file names.
                skipTypings: true,
              },
              context,
              target,
              dependencies,
            )
          }
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

function resolveEntry(entry: string, contextRoot: string, projectRoot: string) {
  return entry.startsWith('.')
    ? resolve(contextRoot, projectRoot, entry)
    : resolve(contextRoot, entry)
}
