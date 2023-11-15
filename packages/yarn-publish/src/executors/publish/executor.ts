import { exec } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import type { PackageJson } from 'nx/src/utils/package-json'

import { logger, type ExecutorContext } from '@nx/devkit'
import { updateJsonFile } from '@nx/workspace'

import { PublishExecutorSchema } from './schema'

const execAsync = promisify(exec)

export default async function executor(
  { outputPath, publishTag, access }: PublishExecutorSchema,
  context: ExecutorContext,
) {
  const projectRoot = resolve(
    context.root,
    context.workspace.projects[context.projectName].root,
  )
  const outputPathAbsolute = resolve(context.root, outputPath)

  try {
    await ensureIsDir(projectRoot)
  } catch (e) {
    logger.fatal('Invalid project root!')
    if (context.isVerbose) {
      logger.fatal('Inner error:', e)
    }
    return { success: false }
  }
  try {
    await ensureIsDir(outputPathAbsolute)
  } catch (e) {
    logger.fatal('Invalid outputPath!')
    if (context.isVerbose) {
      logger.fatal('Inner error:', e)
    }
    return { success: false }
  }

  let success = true
  let packageJsonUpdated = false
  let workspaces: string[] | { packages: string[] }
  try {
    updateJsonFile(
      resolve(context.root, 'package.json'),
      (packageJson: PackageJson) => {
        ;({ workspaces } = packageJson)
        if (Array.isArray(workspaces)) {
          packageJson.workspaces = [
            outputPath,
            ...(workspaces || []).filter(
              (w) => w !== context.workspace.projects[context.projectName].root,
            ),
          ]
        } else {
          packageJson.workspaces = {
            ...workspaces,
            packages: [
              outputPath,
              ...(workspaces.packages || []).filter(
                (w) =>
                  w !== context.workspace.projects[context.projectName].root,
              ),
            ],
          }
        }
        return packageJson
      },
    )
    packageJsonUpdated = true

    await execAsync('yarn')

    let cmd = `yarn npm publish`
    if (publishTag) {
      cmd += ` --tag=${publishTag}`
    }
    if (access) {
      cmd += ` --access=${access}`
    }
    await execAsync(cmd, { cwd: outputPathAbsolute })
  } catch (e) {
    logger.fatal(e)
    success = false
  } finally {
    if (packageJsonUpdated) {
      updateJsonFile(
        resolve(context.root, 'package.json'),
        (packageJson: PackageJson) => {
          packageJson.workspaces = workspaces
          return packageJson
        },
      )
      await execAsync('yarn')
    }
  }
  return {
    success,
  }
}

async function ensureIsDir(dir: string) {
  if (!(await stat(dir)).isDirectory()) {
    throw new Error(`${dir} is not a directory`)
  }
}
