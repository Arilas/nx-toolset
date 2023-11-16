// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { existsSync } from 'fs'
import { basename, join } from 'path'

import { writeFileSync } from 'fs-extra'
import {
  createLockFile,
  getLockFileName,
} from 'nx/src/plugins/js/lock-file/lock-file'
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { createPackageJson } from 'nx/src/plugins/js/package-json/create-package-json'
import { readFileMapCache } from 'nx/src/project-graph/nx-deps-cache'
import { fileExists } from 'nx/src/utils/fileutils'
import type { PackageJson } from 'nx/src/utils/package-json'

import {
  detectPackageManager,
  ExecutorContext,
  getOutputsForTargetAndConfiguration,
  joinPathFragments,
  ProjectFileMap,
  ProjectGraph,
  ProjectGraphExternalNode,
  ProjectGraphProjectNode,
  readJsonFile,
  workspaceRoot,
  writeJsonFile,
} from '@nx/devkit'
import { DependentBuildableProjectNode } from '@nx/js/src/utils/buildable-libs-utils'

export type SupportedFormat = 'cjs' | 'esm'

export interface UpdatePackageJsonOption {
  projectRoot: string
  entries: string[] | Record<string, string>
  outDir: string
  additionalEntryPoints?: string[]
  format?: SupportedFormat[]
  outputPath: string
  outputFileName?: string
  outputFileExtensionForCjs?: `.${string}`
  outputFileExtensionForEsm?: `.${string}`
  typings?: boolean
  generateExportsField?: boolean
  excludeLibsInPackageJson?: boolean
  updateBuildableProjectDepsInPackageJson?: boolean
  buildableProjectDepsInPackageJsonType?: 'dependencies' | 'peerDependencies'
  generateLockfile?: boolean
}

export function updatePackageJson(
  options: UpdatePackageJsonOption,
  context: ExecutorContext,
  target: ProjectGraphProjectNode,
  dependencies: DependentBuildableProjectNode[],
  fileMap: ProjectFileMap = null,
): void {
  let packageJson: PackageJson
  if (fileMap == null) {
    fileMap = readFileMapCache()?.fileMap?.projectFileMap || {}
  }

  if (options.updateBuildableProjectDepsInPackageJson) {
    packageJson = createPackageJson(
      context.projectName,
      context.projectGraph,
      {
        target: context.targetName,
        root: context.root,
        // By default we remove devDependencies since this is a production build.
        isProduction: true,
      },
      fileMap,
    )

    if (options.excludeLibsInPackageJson) {
      dependencies = dependencies.filter((dep) => dep.node.type !== 'lib')
    }

    addMissingDependencies(
      packageJson,
      context,
      dependencies,
      options.buildableProjectDepsInPackageJsonType,
    )
  } else {
    const pathToPackageJson = join(
      context.root,
      options.projectRoot,
      'package.json',
    )
    packageJson = fileExists(pathToPackageJson)
      ? readJsonFile(pathToPackageJson)
      : { name: context.projectName, version: '0.0.1' }
  }

  // update package specific settings
  packageJson = getUpdatedPackageJsonContent(packageJson, options)

  // save files
  writeJsonFile(`${options.outputPath}/package.json`, packageJson)

  if (options.generateLockfile) {
    const packageManager = detectPackageManager(context.root)
    const lockFile = createLockFile(
      packageJson,
      context.projectGraph,
      packageManager,
    )
    writeFileSync(
      `${options.outputPath}/${getLockFileName(packageManager)}`,
      lockFile,
      {
        encoding: 'utf-8',
      },
    )
  }
}

function isNpmNode(
  node: ProjectGraphProjectNode | ProjectGraphExternalNode,
  graph: ProjectGraph,
): node is ProjectGraphExternalNode {
  return !!(graph.externalNodes[node.name]?.type === 'npm')
}

function isWorkspaceProject(
  node: ProjectGraphProjectNode | ProjectGraphExternalNode,
  graph: ProjectGraph,
): node is ProjectGraphProjectNode {
  return !!graph.nodes[node.name]
}

function addMissingDependencies(
  packageJson: PackageJson,
  {
    projectName,
    targetName,
    configurationName,
    root,
    projectGraph,
  }: ExecutorContext,
  dependencies: DependentBuildableProjectNode[],
  propType: 'dependencies' | 'peerDependencies' = 'dependencies',
) {
  const workspacePackageJson = readJsonFile(
    joinPathFragments(workspaceRoot, 'package.json'),
  )
  dependencies.forEach((entry) => {
    if (isNpmNode(entry.node, projectGraph)) {
      const { packageName, version } = entry.node.data
      if (
        packageJson.dependencies?.[packageName] ||
        packageJson.devDependencies?.[packageName] ||
        packageJson.peerDependencies?.[packageName]
      ) {
        return
      }
      if (workspacePackageJson.devDependencies?.[packageName]) {
        return
      }

      packageJson[propType] ??= {}
      packageJson[propType][packageName] = version
    } else if (isWorkspaceProject(entry.node, projectGraph)) {
      const packageName = entry.name
      // eslint-disable-next-line no-extra-boolean-cast
      if (!!workspacePackageJson.devDependencies?.[packageName]) {
        return
      }

      if (
        !packageJson.dependencies?.[packageName] &&
        !packageJson.devDependencies?.[packageName] &&
        !packageJson.peerDependencies?.[packageName]
      ) {
        const outputs = getOutputsForTargetAndConfiguration(
          {
            project: projectName,
            target: targetName,
            configuration: configurationName,
          },
          {},
          entry.node,
        )

        const depPackageJsonPath = join(root, outputs[0], 'package.json')

        if (existsSync(depPackageJsonPath)) {
          const version = readJsonFile(depPackageJsonPath).version

          packageJson[propType] ??= {}
          packageJson[propType][packageName] = version
        }
      }
    }
  })
}

interface Exports {
  '.': {
    [key in 'import' | 'require']?: {
      types?: string
      default: string
    }
  }

  [name: string]:
    | string
    | {
        [key in 'import' | 'require']?: {
          types?: string
          default: string
        }
      }
}

export function getExports(
  options: Pick<
    UpdatePackageJsonOption,
    | 'entries'
    | 'typings'
    | 'outDir'
    | 'projectRoot'
    | 'outputFileName'
    | 'additionalEntryPoints'
  > & {
    fileExt: string
  },
  isEsm = false,
): Exports {
  const main = options.entries
  const entryPoint =
    typeof main === 'string'
      ? main
      : Array.isArray(main)
        ? main[0]
        : main['index'] ?? main['main'] ?? main['src/index'] ?? main['src/main']

  const additionalEntryPoints =
    typeof main === 'string'
      ? []
      : Array.isArray(main)
        ? main
            .slice(1)
            .map((entry) => basename(entry).replace(/\.[mc]?[tj]s$/, ''))
        : Object.keys(main).filter((key) => main[key] !== entryPoint)

  const mainFile = basename(entryPoint).replace(/\.[mc]?[tj]s$/, '')
  const relativeMainFileDir = `./${options.outDir}/`
  const exports: Exports = {
    '.': {
      [isEsm ? 'import' : 'require']: options.typings
        ? {
            types:
              relativeMainFileDir +
              mainFile +
              '.d' +
              options.fileExt.replace('js', 'ts'),
            default: relativeMainFileDir + mainFile + options.fileExt,
          }
        : {
            default: relativeMainFileDir + mainFile + options.fileExt,
          },
    },
  }

  if (additionalEntryPoints) {
    for (const key of additionalEntryPoints) {
      exports[`./${key}`] = {
        [isEsm ? 'import' : 'require']: options.typings
          ? {
              types:
                relativeMainFileDir +
                key +
                '.d' +
                options.fileExt.replace('js', 'ts'),
              default: relativeMainFileDir + key + options.fileExt,
            }
          : {
              default: relativeMainFileDir + key + options.fileExt,
            },
      }
    }
  }

  return exports
}

export function getUpdatedPackageJsonContent(
  packageJson: PackageJson,
  options: UpdatePackageJsonOption,
): PackageJson {
  // Default is CJS unless esm is explicitly passed.
  const hasCjsFormat = !options.format || options.format?.includes('cjs')
  const hasEsmFormat = options.format?.includes('esm')

  if (options.generateExportsField) {
    packageJson.exports =
      typeof packageJson.exports === 'string' ? {} : { ...packageJson.exports }
    packageJson.exports['./package.json'] = './package.json'
  }

  if (hasEsmFormat) {
    const esmExports = getExports(
      {
        ...options,
        fileExt:
          options.outputFileExtensionForEsm ?? packageJson.type === 'module'
            ? '.js'
            : '.mjs',
      },
      true,
    )

    packageJson.module = esmExports['.'].import.default

    if (!hasCjsFormat) {
      packageJson.type = 'module'
      packageJson.types = esmExports['.'].import.types
    }

    if (options.generateExportsField) {
      for (const [exportEntry, filePath] of Object.entries(esmExports)) {
        if (typeof filePath === 'string') {
          packageJson.exports[exportEntry] = filePath
          continue
        }
        packageJson.exports[exportEntry] = {
          ...(packageJson.exports[exportEntry] ?? {}),
          ...filePath,
        }
      }
    }
  }

  // CJS output may have .cjs or .js file extensions.
  // Bundlers like rollup and esbuild supports .cjs for CJS and .js for ESM.
  // Bundlers/Compilers like webpack, tsc, swc do not have different file extensions (unless you use .mts or .cts in source).
  if (hasCjsFormat) {
    const cjsExports = getExports({
      ...options,
      fileExt:
        options.outputFileExtensionForCjs ?? packageJson.type === 'module'
          ? '.cjs'
          : '.js',
    })

    packageJson.main = cjsExports['.'].require.default
    if (!hasEsmFormat) {
      packageJson.type = 'commonjs'
      packageJson.types = cjsExports['.'].require.types
    }

    if (options.generateExportsField) {
      for (const [exportEntry, filePath] of Object.entries(cjsExports)) {
        if (typeof filePath === 'string') {
          packageJson.exports[exportEntry] = filePath
          continue
        }
        packageJson.exports[exportEntry] = {
          ...(packageJson.exports[exportEntry] ?? {}),
          ...filePath,
        }
      }
    }
  }

  return packageJson
}
