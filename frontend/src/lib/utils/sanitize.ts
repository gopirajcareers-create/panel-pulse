// Strip HTML tags and decode any HTML entities — output is plain text for React rendering
export function sanitizeText(input: string): string {
  if (!input) return '';
  const withoutTags = String(input).replace(/<[^>]*>/g, '');
  return withoutTags
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
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
