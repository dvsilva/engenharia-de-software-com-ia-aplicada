import { generateBrag, subscribe } from './brag-service.js';
import { instantiate, technologyBadges } from './views.js';

const renderCard = (brag) => {
  const card = instantiate('brag-card');
  card.setAttribute('href', `/detail/${encodeURIComponent(brag.id)}`);
  card.querySelector('h3').textContent = brag.title;
  card.querySelector('p').textContent = brag.context;
  card
    .querySelector('.technologies')
    .replaceChildren(...technologyBadges(brag.technologies));

  return card;
};

export const mountDashboard = (root) => {
  const form = root.querySelector('form');
  const field = form.querySelector('textarea');
  const button = form.querySelector('button[type=submit]');
  const spinner = button.querySelector('.spinner');
  const label = button.querySelector('.label');
  const list = root.querySelector('.brags');
  const empty = list.querySelector('.empty');
  let loading = false;

  const refreshButton = () => {
    button.disabled = !field.value.trim() || loading;
  };

  const render = (state) => {
    loading = state.loading;
    spinner.hidden = !loading;
    label.textContent = loading ? label.dataset.busy : label.dataset.idle;
    list.replaceChildren(
      ...(state.brags.length > 0 ? state.brags.map(renderCard) : [empty])
    );
    refreshButton();
  };

  field.addEventListener('input', refreshButton);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!field.value.trim()) return;

    generateBrag(field.value);
    field.value = '';
    refreshButton();
  });

  return subscribe(render);
};
