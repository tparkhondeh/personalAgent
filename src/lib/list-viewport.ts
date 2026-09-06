// List-only scrolling when there is enough room; zoom/small screens retain page scrolling.
export function fitProgramList(list: HTMLElement, today: boolean) {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const nav = document.querySelector<HTMLElement>(".mobile-nav, .bottom-nav");
  const navHeight = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().height : 0;
  const first = list.querySelector<HTMLElement>(".task-row, .item");
  const cardHeight = first?.getBoundingClientRect().height ?? 80;
  const available = height - list.getBoundingClientRect().top - navHeight - 48;
  const fits = height >= 640 && available >= cardHeight + 16;
  list.style.maxHeight = fits ? `${Math.floor(today ? Math.min(cardHeight + 8, available) : available)}px` : "none";
  list.dataset.scrollable = String(fits && list.scrollHeight > list.clientHeight + 1);
  return fits;
}
