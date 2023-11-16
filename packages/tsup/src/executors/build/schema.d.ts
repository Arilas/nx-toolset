import type { Options } from 'tsup'

export interface BuildExecutorSchema {
  main: Options['entry'] | string
  assets?: string[]
  outputPath: string
  outDir?: Options['outDir']
  sourceMap?: Options['sourcemap']
  typings?: Options['dts']
  watch?: boolean
  tsConfig?: Options['tsconfig']
}
