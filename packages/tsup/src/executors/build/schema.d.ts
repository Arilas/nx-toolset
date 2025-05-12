import type { Options } from 'tsup'

export interface BuildExecutorSchema {
  main: Options['entry'] | string
  assets?: string[]
  outputPath: string
  outDir?: Options['outDir']
  generateExportsField?: boolean
  skipPackageJsonGeneration?: boolean
  format?: Options['format']
  clean?: boolean
  sourceMap?: Options['sourcemap']
  typings?: Options['dts']
  dtsResolve?: Options['dtsConfig']
  experimentalDts?: Options['experimentalDts']
  watch?: boolean
  tsConfig?: Options['tsconfig']
}
