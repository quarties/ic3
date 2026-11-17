export interface Tooltip {
  /** Show the tooltip on hover over `target`, with the text of its `data-tip`. */
  attach(target: HTMLElement): void;
  /** Hide the tooltip if it shows for `target`. Call it before `target` leaves the page. */
  release(target: HTMLElement): void;
}

/** Tooltip in <body>. The native `title` attribute does not show on ebilet.intercity.pl. */
export function createTooltip(doc: Document = document, win: Window = window): Tooltip {
  let el: HTMLDivElement | null = null;
  /** The element that the tooltip shows for now. */
  let owner: HTMLElement | null = null;

  function show(target: HTMLElement) {
    const text = target.dataset.tip;
    if (!text) return;
    if (!el) {
      el = doc.createElement('div');
      el.className = 'ic3-tip';
      doc.body.appendChild(el);
    }
    owner = target;
    el.textContent = text;
    el.style.display = 'block';
    const r = target.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + el.offsetHeight > win.innerHeight - 8) top = r.top - el.offsetHeight - 6;
    el.style.left = `${Math.max(8, Math.min(r.left, win.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(8, top)}px`;
  }

  function hide() {
    owner = null;
    if (el) el.style.display = 'none';
  }

  return {
    attach(target) {
      target.addEventListener('mouseenter', () => show(target));
      target.addEventListener('mouseleave', hide);
    },
    release(target) {
      if (owner === target) hide();
    },
  };
}
