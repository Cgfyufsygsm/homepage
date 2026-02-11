export const getContactType = (item) => {
  const label = String(item?.label || '').toLowerCase();
  const value = String(item?.value || '').toLowerCase();
  const url = String(item?.url || '').toLowerCase();
  const all = `${label} ${value} ${url}`;

  if (all.includes('mailto:') || all.includes('email')) return 'email';
  if (all.includes('github')) return 'github';
  if (all.includes('scholar')) return 'scholar';
  if (all.includes('linkedin')) return 'linkedin';
  if (all.includes('orcid')) return 'orcid';
  return 'link';
};

export const getContactIconClass = (type) => {
  const icons = {
    email: 'fa-solid fa-envelope',
    github: 'fa-brands fa-github',
    scholar: 'fa-solid fa-graduation-cap',
    linkedin: 'fa-brands fa-linkedin',
    orcid: 'fa-brands fa-orcid',
    link: 'fa-solid fa-link',
  };

  return icons[type] || icons.link;
};

export const splitParagraphs = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }

  return String(raw || '')
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
};

export const parseYear = (value) => {
  const m = String(value || '').match(/\d{4}/);
  return m ? Number(m[0]) : 0;
};

export const toPublicUrl = (value) => {
  if (!value) return '';
  if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(value)) return value;

  const clean = String(value).replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${clean}`;
};

export const getTopbarHeight = () => {
  const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--topbar-height');
  const parsed = Number.parseInt(cssVar, 10);
  return Number.isFinite(parsed) ? parsed : 64;
};
