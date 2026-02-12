
function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function isLongHex(s) {
  return /^[0-9a-f]{16,}$/i.test(s);
}

function normalizePathname(pathname) {
  let p = pathname.trim();
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);

  const parts = p.split("/").filter(Boolean);

  const normalized = parts.map((seg) => {
    const dec = decodeURIComponent(seg);

    if (/^\d+$/.test(dec)) return ":id";
    if (isUuid(dec)) return ":id";
    if (isLongHex(dec)) return ":id";

    return dec;
  });

  return "/" + normalized.join("/");
}

function routeKeyFromUrl(urlStr) {
  const u = new URL(urlStr);
  const domain = u.hostname.toLowerCase();
  const normalizedPath = normalizePathname(u.pathname);
  return `${domain}${normalizedPath}`;
}

function isAllowedDomain(urlStr, allowedDomains) {
  const u = new URL(urlStr);
  const host = u.hostname.toLowerCase();
  return allowedDomains.some(
    (d) => host === d || host.endsWith("." + d)
  );
}

function stripHash(urlStr) {
  const u = new URL(urlStr);
  u.hash = "";
  return u.toString();
}

module.exports = {
  normalizePathname,
  routeKeyFromUrl,
  isAllowedDomain,
  stripHash,
};
