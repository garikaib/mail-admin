export const applyOnlyToText = (html, regex, replacement) => {
  return html
    .split(/(<[^>]+>)/g)
    .map((part, index) => (index % 2 === 0 ? part.replace(regex, replacement) : part))
    .join('');
};

export const highlightConfig = (code) => {
  if (!code) return "";

  let html = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = applyOnlyToText(html, /(#[^\n]*|\/\/[^\n]*)/g, '<span style="color:#94a3b8;font-style:italic;">$1</span>');
  html = applyOnlyToText(html, /("[^"]*"|'[^']*')/g, '<span style="color:#34d399;font-weight:600;">$1</span>');
  html = applyOnlyToText(html, /(^|\n)(\s*)([a-zA-Z0-9_/-]+)(\s*)(=|\s)/g, '$1$2<span style="color:#f472b6;font-weight:700;">$3</span>$4$5');
  html = applyOnlyToText(html, /([{}[\]()])/g, '<span style="color:#fbbf24;font-weight:700;">$1</span>');
  html = applyOnlyToText(html, /\b(\d+)\b/g, '<span style="color:#a78bfa;font-weight:700;">$1</span>');

  return html;
};

export const getNginxDirective = (content, directive, fallback = '') => {
  const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`(^|\\n)\\s*${escaped}\\s+([^;]+);`));
  return match ? match[2].trim() : fallback;
};

export const setNginxDirective = (content, directive, value) => {
  const line = `${directive} ${value};`;
  const escaped = directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|\\n)(\\s*)${escaped}\\s+[^;]+;`);
  if (regex.test(content)) {
    return content.replace(regex, `$1$2${line}`);
  }
  return `${line}\n${content}`;
};

export const configDisplayPath = (configId, files = []) => {
  if (!configId) return '';
  const config = files.find(cf => cf.id === configId);
  if (config?.path) return config.path;
  const filenames = {
    nginx_global: 'nginx.conf',
    rspamd_local: 'rspamd.local.lua',
    postfix_main: 'main.cf',
    postfix_master: 'master.cf',
    dovecot: 'dovecot.conf',
    sogo: 'sogo.conf'
  };
  return `/etc/${config?.service || 'config'}/${filenames[configId] || configId}`;
};

export const getFlagEmoji = (countryCode) => {
  if (!countryCode || countryCode === 'UNKNOWN' || countryCode === 'LOCAL') return '🏳️';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🏳️';
  }
};

export const parseUTC = (dateVal) => {
  if (!dateVal) return null;
  if (typeof dateVal === 'string') {
    let cleanVal = dateVal.trim();
    if (!cleanVal.endsWith('Z') && !cleanVal.includes('+') && !/-\d{2}:\d{2}$/.test(cleanVal)) {
      if (!cleanVal.includes('T') && cleanVal.includes(' ')) {
        cleanVal = cleanVal.replace(' ', 'T');
      }
      cleanVal = cleanVal + 'Z';
    }
    return new Date(cleanVal);
  }
  return new Date(dateVal);
};

export const formatDateTime = (dateVal) => {
  const d = parseUTC(dateVal);
  if (!d || isNaN(d.getTime())) return 'N/A';
  try {
    return d.toLocaleString(undefined, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Harare' });
  } catch {
    return d.toLocaleString();
  }
};

export const formatDateOnly = (dateVal) => {
  const d = parseUTC(dateVal);
  if (!d || isNaN(d.getTime())) return 'N/A';
  try {
    return d.toLocaleDateString(undefined, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Harare' });
  } catch {
    return d.toLocaleDateString();
  }
};

export const formatTimeOnly = (dateVal) => {
  const d = parseUTC(dateVal);
  if (!d || isNaN(d.getTime())) return 'N/A';
  try {
    return d.toLocaleTimeString(undefined, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Harare' });
  } catch {
    return d.toLocaleTimeString();
  }
};

export const generateSecurePassword = () => {
  const length = 16;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  const u = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const l = "abcdefghijklmnopqrstuvwxyz";
  const n = "0123456789";
  const s = "!@#$%^&*()_+";
  retVal += u.charAt(Math.floor(Math.random() * u.length));
  retVal += l.charAt(Math.floor(Math.random() * l.length));
  retVal += n.charAt(Math.floor(Math.random() * n.length));
  retVal += s.charAt(Math.floor(Math.random() * s.length));
  
  for (let i = 0, nCharset = charset.length; i < length - 4; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * nCharset));
  }
  return retVal.split('').sort(() => 0.5 - Math.random()).join('');
};
