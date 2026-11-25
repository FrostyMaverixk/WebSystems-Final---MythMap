export function kindLabel(myth) {
  return myth?.type === 'sea' ? 'Sea deity' : 'Land spirit';
}

export function coordinatesLabel(myth) {
  if (!myth || !Number.isFinite(Number(myth.lat)) || !Number.isFinite(Number(myth.lng))) return '';
  return `${Number(myth.lat).toFixed(3)}° N, ${Number(myth.lng).toFixed(3)}° E`;
}

export function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTimeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'user') return 'Explorer';
  return 'Guest';
}

export function statusLabel(status) {
  switch (status) {
    case 'approved':
      return 'Published';
    case 'needs_revision':
      return 'Needs revision';
    case 'rejected':
      return 'Declined';
    default:
      return 'Awaiting review';
  }
}
