declare module '@jetbrains/postcss-require-hover' {
  import type { PluginCreator } from 'postcss'

  const requireHover: PluginCreator<Record<string, never>>
  export default requireHover
}
