const markdownLoaders = import.meta.glob<string>(
  ['../../../**/*.md', '../../../../README.md'],
  { query: '?raw', import: 'default' },
)
const reportLoaders = import.meta.glob<string>(
  [
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-crossed-2026-10-05.html',
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-jit-2026-10-05.html',
  ],
  { query: '?raw', import: 'default' },
)
const markdownSourceUrls = import.meta.glob<string>(
  ['../../../**/*.md', '../../../../README.md'],
  {
    query: '?url&no-inline',
    import: 'default',
  },
)
const reportSourceUrls = import.meta.glob<string>(
  [
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-crossed-2026-10-05.html',
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-jit-2026-10-05.html',
  ],
  {
    query: '?url&no-inline',
    import: 'default',
  },
)
const guideSourceUrls = import.meta.glob<string>(
  '../pytorch-has-routing.html',
  {
    query: '?url&no-inline',
    import: 'default',
  },
)

function repositoryPath(file: string) {
  return new URL(
    file,
    'https://guide.invalid/docs/repo/perf/pytorch-has-routing/',
  ).pathname.slice(1)
}

function titleFromPath(path: string) {
  const filename =
    path
      .split('/')
      .pop()
      ?.replace(/\.(md|html)$/, '') ?? path
  if (filename === 'README') {
    return 'nwsapi repository overview'
  }
  return filename
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function categoryFromPath(path: string) {
  if (path.startsWith('docs/fleet/')) {
    return 'Shared engineering guidance'
  }
  if (path.includes('/testing/')) {
    return 'Testing'
  }
  if (path.includes('/perf/') || path.startsWith('assets/repo/bench/')) {
    return 'Performance and evidence'
  }
  if (path.startsWith('docs/repo/')) {
    return 'Repository documentation'
  }
  return 'Project overview'
}

const supportedLoaders = Object.fromEntries(
  Object.entries({ ...markdownLoaders, ...reportLoaders }).map(
    ([file, load]) => [repositoryPath(file), load],
  ),
) as Record<string, () => Promise<string>>
const supportedSourceUrlLoaders: Record<string, () => Promise<string>> =
  Object.fromEntries(
    Object.entries({
      ...markdownSourceUrls,
      ...reportSourceUrls,
      ...guideSourceUrls,
    }).map(([file, url]) => [repositoryPath(file), url]),
  )
let retryNonce = 0

export const interactiveGuidePath = 'docs/repo/perf/pytorch-has-routing.html'

export type DocumentRelation = {
  path: string
  label: string
}

export type DocumentMetadata = {
  path: string
  title: string
  summary: string
  category: string
  type: string
  status?: string
  date?: string
  related?: DocumentRelation[]
}

export function documentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    Document: 'Doc',
    'Experiment result': 'Results',
    'Interactive guide': 'Walkthrough',
  }
  return labels[type] ?? type
}

export function documentCategoryKey(category: string) {
  const categories: Record<string, string> = {
    'Repository documentation': 'repository',
    'Performance and evidence': 'performance',
    Testing: 'testing',
    'Shared engineering guidance': 'shared',
    'Project overview': 'overview',
  }
  return categories[category] ?? 'overview'
}

const reviewedDocuments: Record<string, Partial<DocumentMetadata>> = {
  'docs/repo/selector/selector-cache.md': {
    title: 'Selector caching',
    summary:
      'Compiled-plan retention, cache budgets, host configuration, and measured tradeoffs.',
    category: 'Repository documentation',
    type: 'Guide',
    status: 'Current',
  },
  [interactiveGuidePath]: {
    title: 'PyTorch :has() route planner walkthrough',
    summary:
      'Interactive guide to exact forward and inverse DOM searches, planner eligibility, fixed model training, source, and performance evidence.',
    category: 'Performance and evidence',
    type: 'Interactive guide',
    status: 'Experimental',
    related: [
      {
        path: 'docs/repo/perf/pytorch-for-beginners.md',
        label: 'Beginner explanation',
      },
      {
        path: 'docs/repo/perf/neural-dispatch-crossed-outcome.md',
        label: 'Crossed-query results',
      },
      {
        path: 'docs/repo/perf/neural-dispatch-jit-outcome.md',
        label: 'Dispatch follow-up',
      },
      {
        path: 'docs/repo/perf/neural-planner-integration.md',
        label: 'Implementation notes',
      },
    ],
  },
  'docs/repo/perf/pytorch-for-beginners.md': {
    title: 'How the routing model works',
    summary:
      'Plain-language explanation of the two exact search routes, the model’s limited route choice, its training and runtime checks, with local guide setup.',
    category: 'Performance and evidence',
    type: 'Guide',
    status: 'Experimental',
    related: [
      { path: interactiveGuidePath, label: 'Interactive guide' },
      {
        path: 'docs/repo/perf/neural-dispatch-crossed-outcome.md',
        label: 'Crossed-query results',
      },
      {
        path: 'docs/repo/perf/neural-dispatch-jit-outcome.md',
        label: 'Dispatch follow-up',
      },
      {
        path: 'docs/repo/perf/neural-planner-integration.md',
        label: 'Implementation notes',
      },
    ],
  },
  'docs/repo/perf/neural-planner-integration.md': {
    title: 'Current planner integration',
    summary:
      'Describes the experimental policies enabled by the current runtime and the checks that keep selector matching exact.',
    category: 'Performance and evidence',
    type: 'Implementation',
    status: 'Current · experimental',
    related: [
      {
        path: 'docs/repo/perf/neural-dispatch-crossed-outcome.md',
        label: 'Crossed-query results',
      },
      {
        path: 'docs/repo/perf/neural-dispatch-jit-outcome.md',
        label: 'Dispatch follow-up',
      },
      { path: interactiveGuidePath, label: 'Interactive guide' },
    ],
  },
  'docs/repo/perf/neural-dispatch-crossed-outcome.md': {
    title: 'Crossed-query results',
    summary:
      'Reports whether the route model still helps when layouts use independent combinations of selector filters.',
    category: 'Performance and evidence',
    type: 'Experiment result',
    status: 'Recorded results',
    related: [
      {
        path: 'docs/repo/perf/neural-dispatch-jit-outcome.md',
        label: 'Dispatch follow-up',
      },
      {
        path: 'docs/repo/perf/neural-planner-integration.md',
        label: 'Current planner integration',
      },
    ],
  },
  'docs/repo/perf/neural-dispatch-jit-outcome.md': {
    title: 'Dispatch follow-up',
    summary:
      'Records the follow-up measurements of dispatch cost and query behavior for the experimental route policies.',
    category: 'Performance and evidence',
    type: 'Experiment result',
    status: 'Recorded results',
    related: [
      {
        path: 'docs/repo/perf/neural-dispatch-crossed-outcome.md',
        label: 'Crossed-query results',
      },
      {
        path: 'docs/repo/perf/neural-planner-integration.md',
        label: 'Current planner integration',
      },
    ],
  },
  'docs/repo/perf/selector-optimization-luna-plan.md': {
    summary:
      'Plan for improving complete selector query time while preserving exact results, with qualification steps for implementation experiments.',
    type: 'Implementation',
  },
  'docs/repo/selector/attributes.md': {
    summary:
      'Tests the attribute-equality fast path across case rules, escaped values, missing attributes, XML and SVG attributes, cached queries, and custom operators.',
  },
  'assets/repo/bench/survey-2026-10-03/neural-dispatch-crossed-2026-10-05.html':
    {
      title: 'Crossed-query report',
      category: 'Performance and evidence',
      type: 'Report',
    },
  'assets/repo/bench/survey-2026-10-03/neural-dispatch-jit-2026-10-05.html': {
    title: 'Dispatch and JIT report',
    category: 'Performance and evidence',
    type: 'Report',
  },
}

export const documentLoaders = supportedLoaders
const loadedDocuments = Object.keys(supportedLoaders)
  .toSorted((left, right) => left.localeCompare(right))
  .map(path => {
    const reviewed = reviewedDocuments[path] ?? {}
    const title = reviewed.title ?? titleFromPath(path)
    const category = reviewed.category ?? categoryFromPath(path)
    const type =
      reviewed.type ?? (path.endsWith('.html') ? 'Report' : 'Document')
    return {
      path,
      title,
      summary: reviewed.summary ?? `${type} in ${category.toLowerCase()}.`,
      category,
      type,
      ...(reviewed.status ? { status: reviewed.status } : {}),
      ...(reviewed.date ? { date: reviewed.date } : {}),
      ...(reviewed.related ? { related: reviewed.related } : {}),
    }
  })

const interactiveMetadata = reviewedDocuments[interactiveGuidePath]!
const interactiveGuide: DocumentMetadata = {
  path: interactiveGuidePath,
  title: interactiveMetadata.title!,
  summary: interactiveMetadata.summary!,
  category: interactiveMetadata.category!,
  type: interactiveMetadata.type!,
  ...(interactiveMetadata.status ? { status: interactiveMetadata.status } : {}),
  ...(interactiveMetadata.related
    ? { related: interactiveMetadata.related }
    : {}),
}

export const documents: DocumentMetadata[] = [
  ...loadedDocuments,
  interactiveGuide,
].toSorted((left, right) => left.title.localeCompare(right.title))

const documentIndex = new Map(
  documents.map(document => [document.path, document]),
)

export function hasReviewedTitle(path: string) {
  return (
    Boolean(reviewedDocuments[path]?.title) || path === interactiveGuidePath
  )
}

export function hasReviewedSummary(path: string) {
  return (
    Boolean(reviewedDocuments[path]?.summary) || path === interactiveGuidePath
  )
}

export function getDocument(path: string) {
  return documentIndex.get(path)
}

export function documentHref(path: string) {
  return path === interactiveGuidePath
    ? './pytorch-has-routing.html'
    : `./model-guide-reading.html?doc=${encodeURIComponent(path)}`
}

export async function loadDocumentSource(path: string) {
  const loadSourceUrl = supportedSourceUrlLoaders[path]
  if (!loadSourceUrl) {
    return undefined
  }
  const url = new URL(await loadSourceUrl(), import.meta.url)
  if (import.meta.env.PROD && path.startsWith('assets/repo/bench/')) {
    url.pathname += '.source.txt'
  }
  url.searchParams.set('catalog-retry', String(++retryNonce))
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to load ${path}: HTTP ${response.status}`)
  }
  return response.text()
}

export async function loadDocument(
  path: string,
  options: { retry?: boolean } = {},
) {
  if (options.retry) {
    return loadDocumentSource(path)
  }
  const load = documentLoaders[path]
  if (!load) {
    return undefined
  }
  return load()
}
