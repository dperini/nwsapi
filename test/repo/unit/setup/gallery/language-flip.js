// Browser design preview. The terminal implementation will need cell-based frames.
(() => {
  const running = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const characters = text => [...segmenter.segment(text)].map(item => item.segment);

  function capture(section) {
    return new Map([...section.querySelectorAll('[data-flip]')].map(element =>
      [element.dataset.flip, element.innerHTML]));
  }

  function finish(section) {
    running.get(section)?.();
  }

  function textParts(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return [...template.content.childNodes].map(node => node.textContent || '');
  }

  function cell(oldChar, newChar) {
    const container = document.createElement('span');
    container.className = 'flip-cell';
    for (const [name, text] of [['old', oldChar], ['new', newChar]]) {
      const face = document.createElement('span');
      face.className = `flip-face flip-${name}`;
      face.textContent = text || ' ';
      container.append(face);
    }
    return container;
  }

  function populate(element, oldHtml) {
    const original = element.innerHTML;
    const oldParts = textParts(oldHtml);
    const nodes = [...element.childNodes];
    const visual = document.createElement('span');
    visual.className = 'flip-visual';
    visual.setAttribute('aria-hidden', 'true');
    const readable = document.createElement('span');
    readable.className = 'flip-readable';
    readable.textContent = element.textContent;
    nodes.forEach((node, partIndex) => {
      if (node.nodeType !== Node.TEXT_NODE) {
        visual.append(node.cloneNode(true));
        return;
      }
      const before = characters(oldParts[partIndex] || '');
      const after = characters(node.textContent || '');
      let word = document.createElement('span');
      word.className = 'flip-word';
      visual.append(word);
      for (let i = 0; i < Math.max(before.length, after.length); i++) {
        // Break at destination spaces while preserving a fixed-width cell grid.
        if (after[i] === ' ') {
          visual.append(cell(before[i], after[i]));
          word = document.createElement('span');
          word.className = 'flip-word';
          visual.append(word);
        } else {
          word.append(cell(before[i], after[i]));
        }
      }
    });
    element.replaceChildren(readable, visual);
    return () => { element.innerHTML = original; };
  }

  function enabled() {
    return !reducedMotion.matches &&
      document.querySelector('#motion').checked &&
      new URLSearchParams(location.search).get('animations') !== '0';
  }

  function play(section, previous) {
    if (!enabled()) return;
    const restores = [];
    const animations = [];
    const speed = document.querySelector('#slow').checked ? 2.5 : 1;
    const terminal = section.querySelector('.terminal');
    const base = terminal.getBoundingClientRect();
    const originalHeight = terminal.style.minHeight;
    terminal.style.minHeight = `${base.height}px`;
    for (const element of section.querySelectorAll('[data-flip]')) {
      const oldHtml = previous.get(element.dataset.flip);
      if (oldHtml === undefined || oldHtml === element.innerHTML) continue;
      restores.push(populate(element, oldHtml));
    }
    for (const glyph of terminal.querySelectorAll('.flip-cell')) {
      const [oldFace, newFace] = glyph.children;
      if (oldFace.textContent === newFace.textContent) {
        oldFace.remove();
        continue;
      }
      const box = glyph.getBoundingClientRect();
      const delay = ((box.top - base.top) * 1.2 + (box.left - base.left) * .45) * speed;
      const options = {duration: 360 * speed, delay, fill: 'both', easing:'cubic-bezier(.35,0,.2,1)'};
      animations.push(oldFace.animate([
        {transform:'rotateX(0deg) translateY(0)',opacity:1,offset:0},
        {transform:'rotateX(-90deg) translateY(35%)',opacity:.25,offset:.52},
        {transform:'rotateX(-90deg) translateY(35%)',opacity:0,offset:1},
      ],options));
      animations.push(newFace.animate([
        {transform:'rotateX(90deg) translateY(-35%)',opacity:0,offset:0},
        {transform:'rotateX(90deg) translateY(-35%)',opacity:.3,offset:.45},
        {transform:'rotateX(0deg) translateY(0)',opacity:1,offset:1},
      ],options));
    }
    const cleanup = () => {
      if (running.get(section) !== cleanup) return;
      running.delete(section);
      animations.forEach(animation => animation.cancel());
      restores.forEach(restore => restore());
      terminal.style.minHeight = originalHeight;
      section.dataset.animating = 'false';
    };
    running.set(section, cleanup);
    section.dataset.animating = 'true';
    Promise.all(animations.map(animation => animation.finished)).then(cleanup, () => {});
  }

  function finishAll() {
    for (const section of running.keys()) finish(section);
  }
  reducedMotion.addEventListener('change', finishAll);
  addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('#motion');
    toggle.checked = !reducedMotion.matches && new URLSearchParams(location.search).get('animations') !== '0';
    toggle.addEventListener('change', finishAll);
  });
  window.wizardFlip = {capture, play, finish, finishAll};
})();
