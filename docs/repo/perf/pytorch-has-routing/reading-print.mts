export function initializeReadingPrint() {
  let printing = false
  let restoreAfterPrint: HTMLDetailsElement[] = []

  window.addEventListener('beforeprint', () => {
    if (printing) {
      return
    }
    printing = true
    const article = document.querySelector('#reading-content')
    if (!article) {
      return
    }
    restoreAfterPrint = Array.from(article.querySelectorAll('details')).filter(
      details => !details.open,
    )
    for (const details of restoreAfterPrint) {
      details.open = true
    }
  })

  window.addEventListener('afterprint', () => {
    if (!printing) {
      return
    }
    printing = false
    const detailsToRestore = restoreAfterPrint
    restoreAfterPrint = []
    for (const details of detailsToRestore) {
      if (details.isConnected) {
        details.open = false
      }
    }
  })
}
