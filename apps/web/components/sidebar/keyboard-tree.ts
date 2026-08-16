/**
 * Roving keyboard navigation for the sidebar tree (featureslist.md §0.1 —
 * "keyboard-navigable tree"). Rather than hand-maintaining a parallel focus
 * model, this queries the DOM for every focusable nav item inside the tree
 * container at keydown time — simple, always in sync with what's actually
 * rendered/visible (collapsed groups naturally disappear from the query).
 */
const FOCUSABLE_SELECTOR = '[data-nav-item="true"]';

export function handleTreeKeyDown(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (container === null) {
    return;
  }
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (items.length === 0) {
    return;
  }
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault();
      const next = items[(currentIndex + 1 + items.length) % items.length];
      next?.focus();
      break;
    }
    case 'ArrowUp': {
      event.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev?.focus();
      break;
    }
    case 'Home': {
      event.preventDefault();
      items[0]?.focus();
      break;
    }
    case 'End': {
      event.preventDefault();
      items[items.length - 1]?.focus();
      break;
    }
    default:
      break;
  }
}
