import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createHash } from 'node:crypto';

const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const accept = 'text/html,application/xhtml+xml,image/jpeg,image/png,image/webp';
const clean = (value) => typeof value === 'string' ? value
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, digits) => {
    const code = /^x/i.test(digits) ? Number.parseInt(digits.slice(1), 16) : Number(digits);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  })
  .replace(/&(amp|quot|apos|nbsp|lt|gt|#39|#34);/gi, (_, key) =>
    ({ amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>', '#39': "'", '#34': '"' })[key.toLowerCase()])
  .replace(/\s+/g, ' ').trim() : '';
const properties = (tag) => Object.fromEntries(Array.from(
  tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g),
  ([, name, double, single, bare]) => [name.toLowerCase(), double ?? single ?? bare]
));

function asUrl(value, base) {
  try {
    const link = new URL(value, base);
    if (!['https:', 'http:'].includes(link.protocol) || link.username || link.password || link.port) return;
    link.hash = '';
    return link;
  } catch {}
}

const resizeParameters = ['w', 'h', 'width', 'height', 'q', 'quality', 'dpr'];

function groupImageVariants(urls) {
  const groups = new Map();
  for (const source of urls) {
    const url = new URL(source);
    const thumbnailPath = /\/(?:thumb|thumbs|thumbnail|thumbnails)\//i;
    const sizeSuffix = /[-_](\d{2,4})x(\d{0,4})(?=\.(?:jpe?g|png|webp)$)/i;
    const embeddedThumbnail = /^(.*)\/thumblibrary\/(.+)_([0-9]{2,4})_([0-9]{2,4})_([^/]+\.(?:jpe?g|png|webp))$/i;
    const embedded = url.pathname.match(embeddedThumbnail);
    const dimensions = url.pathname.match(sizeSuffix) || (embedded ? ['', embedded[3], embedded[4]] : null);
    const widths = [dimensions?.[1], url.searchParams.get('width'), url.searchParams.get('w')].map(Number).filter(value => value > 0);
    const score = widths.length ? Math.min(...widths) : thumbnailPath.test(url.pathname) ? 0 : Infinity;
    url.pathname = embedded ? embedded[1] + '/imagelibrary/' + embedded[2] + '_' + embedded[5]
      : url.pathname.replace(thumbnailPath, '/').replace(sizeSuffix, '');
    if (/\.(?:jpe?g|png|webp)$/i.test(url.pathname) || url.searchParams.has('url')) {
      for (const key of resizeParameters) {
        if (/^\d+(?:\.\d+)?$/.test(url.searchParams.get(key) ?? '')) url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    const key = url.href;
    const group = groups.get(key) ?? [];
    group.push({ source, score });
    groups.set(key, group);
  }
  return [...groups.values()].map(group => group.sort((a, b) => a.score === b.score ? 0 : b.score - a.score).map(item => item.source));
}

function elementContent(html, start, name, limit = html.length) {
  const tags = new RegExp('</?' + name + '(?=[\\s/>])[^>]*>', 'gi');
  tags.lastIndex = start;
  let depth = 1;
  for (let match; (match = tags.exec(html)) && match.index < limit;) {
    if (match[0].startsWith('</')) depth--;
    else if (!match[0].endsWith('/>')) depth++;
    if (depth === 0) return html.slice(start, match.index);
  }
  return '';
}

function readProductMicrodata(html) {
  const markup = html.replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  const tags = /<([a-z][\w-]*)\b[^>]*>/gi;
  for (const opening of markup.matchAll(tags)) {
    if (!/\bitemscope\b/i.test(opening[0]) ||
        !/^https?:\/\/schema\.org\/Product\/?$/i.test(properties(opening[0]).itemtype || '')) continue;
    const start = opening.index + opening[0].length;
    const body = elementContent(markup, start, opening[1]);
    if (!body) continue;
    const fields = { image: [] };
    let skipUntil = 0;
    for (const match of body.matchAll(tags)) {
      if (match.index < skipUntil) continue;
      const attrs = properties(match[0]);
      if (/^https?:\/\/schema\.org\/Product\/?$/i.test(attrs.itemtype || '')) {
        const nestedStart = match.index + match[0].length;
        skipUntil = nestedStart + elementContent(body, nestedStart, match[1]).length;
        continue;
      }
      const names = attrs.itemprop?.toLowerCase().split(/\s+/) || [];
      if (names.includes('image') && ['img', 'meta', 'link'].includes(match[1].toLowerCase())) {
        fields.image.push(attrs['data-src'], attrs.src, attrs.content, attrs.href);
      }
      for (const name of ['name', 'description', 'sku', 'mpn', 'model', 'brand']) {
        if (!names.includes(name) || fields[name]) continue;
        const value = attrs.content ?? elementContent(body, match.index + match[0].length, match[1]);
        if (value) fields[name] = clean(value).slice(0, name === 'description' ? 6500 : 220);
      }
    }
    if (fields.name || fields.description || fields.image.length) return fields;
  }
}

export function parseProductReference(html, url) {
  const products = [];
  const visit = (item) => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!item || typeof item !== 'object') return;
    if ([item['@type']].flat().includes('Product')) products.push(item);
    for (const key of ['@graph', 'mainEntity', 'item']) visit(item[key]);
  };
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (properties(attrs).type?.toLowerCase() !== 'application/ld+json') continue;
    try { visit(JSON.parse(body.trim())); } catch {}
  }
  // Prefer the page's main entity over unrelated products from recommendation widgets.
  const key = value => asUrl(value, url)?.pathname.replace(/\/$/, '');
  const product = products.find(item => [item.url, item['@id'], item.mainEntityOfPage?.['@id']]
    .some(value => typeof value === 'string' && key(value) === key(url))) ?? products[0];
  const meta = new Map();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = properties(tag);
    const name = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (name && attrs.content) meta.set(name, [...(meta.get(name) || []), attrs.content]);
  }
  const first = name => meta.get(name)?.[0];
  const structured = readProductMicrodata(html);
  const structuredName = clean(structured?.name).toLowerCase();
  const jsonName = clean(product?.name).toLowerCase();
  const microdata = !jsonName || (structuredName && structuredName === jsonName) ? structured : undefined;
  const title = clean(product?.name || microdata?.name || first('og:title') || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]).slice(0, 220);
  const brand = clean((typeof product?.brand === 'string' ? product.brand : product?.brand?.name) || microdata?.brand);
  const identifiers = [...new Set([product?.mpn || microdata?.mpn, product?.model || microdata?.model, product?.sku || microdata?.sku].map(clean).filter(Boolean))];
  const sources = [product?.description, microdata?.description, first('description'), first('og:description')].map(clean).filter(Boolean);
  const specs = [product?.additionalProperty].flat().flatMap(prop => {
    const name = clean(prop?.name);
    const value = ['string', 'number'].includes(typeof prop?.value) ? clean(String(prop.value)) : '';
    return name && value ? [name + ': ' + value + (prop.unitText ? ' ' + clean(prop.unitText) : '')] : [];
  });
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const content = clean(row);
    if (content.length <= 240 && /\b(barrel|diameter|length|width|height|angle|range|bore|clamp|spring|mass|projectile)\b/i.test(content)) specs.push(content);
    if (specs.length >= 16) break;
  }
  const imageUrls = [product?.image].flat().map(item =>
    typeof item === 'string' ? item : item?.contentUrl || item?.url || item?.['@id']);
  if (!imageUrls.some(Boolean) && microdata?.image) imageUrls.push(...microdata.image);
  const titleWords = title.toLowerCase().match(/[a-z0-9]+/g)?.filter(word => word.length > 2) || [];
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = properties(tag);
    const altWords = clean(attrs.alt).toLowerCase().match(/[a-z0-9]+/g) || [];
    if ((titleWords.length >= 2 && titleWords.every(word => altWords.includes(word))) ||
      identifiers.some(id => id.length >= 5 && clean(attrs.alt).toLowerCase().includes(id.toLowerCase()))) {
      const srcset = (attrs['data-srcset'] || attrs.srcset || '').split(',')
        .map(entry => entry.trim().match(/^(\S+)\s+(\d+)w$/))
        .filter(Boolean).sort((a, b) => Number(b[2]) - Number(a[2]));
      imageUrls.push(attrs['data-large_image'], attrs['data-zoom-image'], ...srcset.slice(0, 3).map(entry => entry[1]),
        attrs['data-src'], attrs.src);
    }
  }
  const uniqueUrls = values => [...new Set(values.filter(Boolean).map(image => asUrl(clean(image), url)?.href).filter(Boolean))];
  const galleryImageUrls = uniqueUrls(imageUrls).slice(0, 24);
  const images = uniqueUrls([...galleryImageUrls, ...(meta.get('og:image') || []), ...(meta.get('og:image:secure_url') || []),
    first('twitter:image'), first('image')]).slice(0, 28);
  const text = [...new Set([title, brand && 'Manufacturer: ' + brand,
    ...identifiers.map(id => 'Model or catalog code: ' + id), ...sources, ...specs].filter(Boolean))].join('\n').slice(0, 10_000);
  return { title, brand, identifiers, text, imageUrls: images, galleryImageUrls };
}

function publicIPv4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return a > 0 && a < 224 && a !== 10 && a !== 127 &&
    !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) &&
    !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) && !(a === 203 && b === 0 && c === 113);
}

async function fetchReference(url, deadline, imageOnly = false) {
  for (let redirects = 0; redirects <= 4; redirects++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || !url) throw new Error('Reference timed out');
    const signal = AbortSignal.timeout(remaining);
    const hostname = url.hostname;
    if (!hostname.includes('.') || hostname.endsWith('.local')) throw new Error('A public product link is required');
    const addresses = await lookup(hostname, { family: 4, all: true });
    const address = addresses.find(item => publicIPv4(item.address))?.address;
    if (!address || addresses.some(item => !publicIPv4(item.address))) throw new Error('A public product link is required');
    const fetch = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const reply = await new Promise((resolve, reject) => {
      const req = fetch(url, {
        signal, family: 4,
        // Bind the socket to the address that was checked, including after redirects.
        lookup: (_host, _options, callback) => callback(null, address, 4),
        headers: { 'User-Agent': 'Mozilla/5.0 EuropaLab/2.0', Accept: imageOnly ? 'image/jpeg,image/png,image/webp' : accept, 'Accept-Encoding': 'identity' },
      }, res => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.destroy();
          resolve({ redirect: asUrl(res.headers.location, url) });
          return;
        }
        const type = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const isPhoto = photoTypes.has(type);
        const max = isPhoto ? 2_500_000 : 1_500_000;
        if (status !== 200 || (!isPhoto && (imageOnly || !['text/html', 'application/xhtml+xml'].includes(type))) ||
            ![undefined, 'identity'].includes(res.headers['content-encoding']) || Number(res.headers['content-length']) > max) {
          res.destroy();
          reject(new Error('Unsupported product response'));
          return;
        }
        let count = 0;
        const chunks = [];
        res.on('error', reject);
        res.on('data', chunk => {
          count += chunk.length;
          if (count > max) { res.destroy(new Error('Reference exceeds size limit')); return; }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ type, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
    });
    if ('redirect' in reply) { url = reply.redirect; continue; }
    return { ...reply, url: url.href };
  }
  throw new Error('Too many product redirects');
}

export async function collectProductReference(value, maxPhotos = 4, fetcher = fetchReference) {
  const url = asUrl(value.includes('://') ? value : 'https://' + value);
  if (!url) throw new Error('Invalid product link');
  const deadline = Date.now() + 10_000;
  const page = await fetcher(url, deadline);
  const toPhoto = ({ type, body }) => 'data:' + type + ';base64,' + body.toString('base64');
  if (photoTypes.has(page.type)) return { url: page.url, photos: maxPhotos ? [toPhoto(page)] : [],
    photoUrls: maxPhotos ? [page.url] : [], text: '', identifiers: [] };
  const reference = parseProductReference(page.body.toString('utf8'), page.url);
  const seen = new Set();
  const photos = [];
  const photoUrls = [];
  const fetchGallery = async urls => {
    const groups = groupImageVariants(urls).slice(0, Math.min(8, maxPhotos + 3));
    const candidates = await Promise.all(groups.map(async group => {
      for (const image of group) {
        if (Date.now() >= deadline) break;
        try {
          const result = await fetcher(new URL(image), deadline, true);
          if (photoTypes.has(result.type)) return result;
        } catch {}
      }
    }));
    for (const image of candidates) {
      if (!image) continue;
      const key = createHash('sha256').update(image.body).digest('hex');
      if (seen.has(key)) continue;
      seen.add(key);
      photos.push(toPhoto(image));
      photoUrls.push(image.url);
      if (photos.length === maxPhotos) break;
    }
  };
  if (maxPhotos > 0) {
    await fetchGallery(reference.galleryImageUrls);
    if (!photos.length) {
      await fetchGallery(reference.imageUrls.filter(url => !reference.galleryImageUrls.includes(url)));
    }
  }
  return { ...reference, url: page.url, photos, photoUrls };
}
