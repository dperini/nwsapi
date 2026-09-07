import { optimize } from 'svgo'
import type { Config as SvgoConfig } from 'svgo'

export const SVG_FLOAT_PRECISION = 2

// Keep structure, IDs, gradients, and transforms intact.
const SVGO_CONFIG: SvgoConfig = {
  js2svg: { indent: 0, pretty: false },
  multipass: true,
  plugins: [
    'removeComments',
    'removeMetadata',
    'cleanupAttrs',
    'cleanupNumericValues',
    {
      name: 'convertPathData',
      params: {
        applyTransforms: false,
        floatPrecision: SVG_FLOAT_PRECISION,
        // SVGO accepts false at runtime but omits it from the type.
        makeArcs: false as unknown as { threshold: number; tolerance: number },
      },
    },
    'removeEmptyContainers',
  ],
}

export function optimiseSvg(
  svg: string,
  options: { preservePathData?: boolean } = {},
): string {
  return optimize(svg.replace(/\r\n?/g, '\n'), {
    ...SVGO_CONFIG,
    plugins: options.preservePathData
      ? SVGO_CONFIG.plugins?.filter(
          plugin =>
            typeof plugin === 'string' || plugin.name !== 'convertPathData',
        )
      : SVGO_CONFIG.plugins,
  }).data
}

export function isSvgOptimized(
  svg: string,
  options: { preservePathData?: boolean } = {},
): boolean {
  return optimiseSvg(svg, options).trimEnd() === svg.trimEnd()
}
