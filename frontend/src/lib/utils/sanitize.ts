// Remove HTML tags and then escape remaining text to avoid XSS
export function sanitizeText(input: string): string {
  if (!input) return '';
  // Strip any HTML tags first
  const withoutTags = String(input).replace(/<[^>]*>/g, '');
  // Escape remaining special characters
  return withoutTags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

export default sanitizeText;

export function escapeHtml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
