import { mountDashboard } from './dashboard.js';
import { renderDetail } from './detail.js';
import { instantiate } from './views.js';

const DETAIL_PATH = /^\/detail\/([^/]+)$/;
const outlet = document.getElementById('outlet');
let unmount = () => {};

const isRoute = (path) => path === '/' || DETAIL_PATH.test(path);

const isPlainClick = (event) =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

const show = (path) => {
  const detail = path.match(DETAIL_PATH);

  unmount();
  unmount = () => {};

  if (detail) {
    outlet.replaceChildren(renderDetail(decodeURIComponent(detail[1])));
    return;
  }

  outlet.replaceChildren(instantiate('dashboard-view'));
  unmount = mountDashboard(outlet);
};

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link || link.origin !== location.origin) return;
  if (!isRoute(link.pathname) || !isPlainClick(event)) return;

  event.preventDefault();
  history.pushState(null, '', link.pathname);
  show(link.pathname);
});

window.addEventListener('popstate', () => show(location.pathname));

if (location.pathname === '/') unmount = mountDashboard(outlet);
