import { useEffect, useRef } from "react";

function nearestScrollParent(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const oy = window.getComputedStyle(node).overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      node.scrollHeight > node.clientHeight + 8
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

/** Amène le panneau qui vient de s’ouvrir dans le champ de vision. */
export function scrollRevealedElement(el: HTMLElement) {
  const parent = nearestScrollParent(el);
  const parentRect = parent.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const delta = elRect.top - parentRect.top - 16;
  const isPage =
    parent === document.documentElement ||
    parent === document.body ||
    parent === document.scrollingElement;
  const nextTop = Math.max(0, (isPage ? window.scrollY : parent.scrollTop) + delta);
  parent.scrollTo({ top: nextTop, behavior: "smooth" });
  el.classList.remove("reveal-flash");
  void el.offsetWidth;
  el.classList.add("reveal-flash");
  const focusable = el.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
  );
  (focusable ?? el).focus({ preventScroll: true });
}

/** Ref à poser sur le bloc qui apparaît après un clic (formulaire, fiche salle…). */
export function useRevealScroll<T extends HTMLElement>(
  active: boolean,
  key?: string | number | boolean | null,
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const id = window.setTimeout(() => scrollRevealedElement(el), 50);
    return () => window.clearTimeout(id);
  }, [active, key]);
  return ref;
}
