import { getBragById } from './brag-service.js';
import { instantiate, technologyBadges } from './views.js';

export const renderDetail = (id) => {
  const brag = getBragById(id);
  if (!brag) return instantiate('missing-view');

  const view = instantiate('detail-view');
  view.querySelector('article h1').textContent = brag.title;
  view
    .querySelector('article header .technologies')
    .replaceChildren(...technologyBadges(brag.technologies));
  view.querySelector('.context p').textContent = brag.context;
  view.querySelector('.impact p').textContent = brag.impact;
  view.querySelector('.metrics p').textContent = brag.metrics;

  return view;
};
