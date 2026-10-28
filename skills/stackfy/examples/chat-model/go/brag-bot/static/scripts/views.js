export const instantiate = (templateId) =>
  document.getElementById(templateId).content.firstElementChild.cloneNode(true);

export const technologyBadges = (technologies) =>
  technologies.map((technology) => {
    const badge = instantiate('technology-badge');
    badge.textContent = technology;

    return badge;
  });
