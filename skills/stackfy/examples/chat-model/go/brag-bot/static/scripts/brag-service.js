const state = { brags: [], loading: false };
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener(state));

const setLoading = (loading) => {
  state.loading = loading;
  notify();
};

const toBrag = (answer) => ({
  id: answer.id || crypto.randomUUID(),
  title: answer.title,
  context: answer.context,
  impact: answer.businessImpact || answer.impact,
  metrics: Array.isArray(answer.metrics)
    ? answer.metrics.join(', ')
    : answer.metrics,
  technologies: answer.technologiesUsed || answer.technologies || [],
});

const requestBrag = async (definition) => {
  const response = await fetch('/api/brag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ definition }),
  });

  if (!response.ok) throw new Error(`/api/brag answered ${response.status}`);

  return response.json();
};

export const subscribe = (listener) => {
  listeners.add(listener);
  listener(state);

  return () => listeners.delete(listener);
};

export const generateBrag = async (definition) => {
  setLoading(true);

  try {
    state.brags = [toBrag(await requestBrag(definition)), ...state.brags];
  } catch (error) {
    console.error('Falha ao gerar brag:', error);
  }

  setLoading(false);
};

export const getBragById = (id) => state.brags.find((brag) => brag.id === id);
