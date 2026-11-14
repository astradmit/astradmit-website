#!/usr/bin/env node
/*
  Astradmit: builds the Resources pages (articles and videos) from Markdown files.

  Input : content/posts/*.md           (one file per post; files starting with _ are ignored)
  Output: site/resources/<slug>.html   (one page per post)
          site/resources.html          (page 1 of the list, between the POSTS markers)
          site/resources/page-N.html   (list pages 2, 3, ...)
          site/feed.xml, site/sitemap.xml, site/llms.txt (updated)

  Uses only Node.js built-in modules. Runs automatically in GitHub Actions before every deploy.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const OUT_DIR = path.join(SITE, 'resources');
const PAGE_SIZE = 9;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const errors = [], warnings = [];
const fail = (file, msg) => errors.push({ file, msg });
const warn = (file, msg) => warnings.push({ file, msg });
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const rssDate = (iso) => new Date(`${iso}T09:00:00+05:30`).toUTCString();
const read = (p) => fs.readFileSync(p, 'utf8');

// ------------------------------------------------------------------ site shell (taken from resources.html)
const resourcesPath = path.join(SITE, 'resources.html');
if (!fs.existsSync(resourcesPath)) { console.error('site/resources.html not found'); process.exit(1); }
const resourcesSrc = read(resourcesPath);
const block = (name) => { const m = resourcesSrc.match(new RegExp(`<!--${name}:START-->[\\s\\S]*?<!--${name}:END-->`)); if (!m) { console.error(`Marker ${name} missing in site/resources.html`); process.exit(1); } return m[0]; };
const absolutize = (html) => html.replace(/\b(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
const GA = block('GA');
const HEADER = absolutize(block('HEADER')).replace('<a href="/resources.html">', '<a href="/resources.html" aria-current="page">');
const FOOTER = absolutize(block('FOOTER'));
const ORIGIN = (resourcesSrc.match(/<link rel="canonical" href="(https?:\/\/[^"\/]+)\/resources\.html"/) || [])[1];
if (!ORIGIN) { console.error('Could not read the website address from site/resources.html (canonical link)'); process.exit(1); }
const ORG_ID = `${ORIGIN}/#organization`, PERSON_ID = `${ORIGIN}/about.html#priyanka-khandelwal`;
const DEFAULT_IMG = `${ORIGIN}/assets/img/og-image.png`;
const FOUNDER_NAME = 'Priyanka Khandelwal';
const BOOK = (HEADER.match(/class="btn btn-gold" href="([^"]+)"/) || [])[1] || '/contact.html';
const BOOK_ATTR = /^https?:/.test(BOOK) ? ' target="_blank" rel="noopener"' : '';

function shell({ title, desc, canonical, ogType = 'website', ogImage = DEFAULT_IMG, robots = 'index, follow, max-image-preview:large', schema = [], body, extraMeta = '' }) {
  const ld = schema.map((o) => `<script type="application/ld+json">${JSON.stringify(o, null, 1)}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${GA}
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${robots}">
<meta name="author" content="${FOUNDER_NAME}">
<meta name="theme-color" content="#1E3A8A">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg"><link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Astradmit resources" href="/feed.xml">
<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="Astradmit"><meta property="og:locale" content="en_IN"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}"><meta property="og:image" content="${ogImage}">${extraMeta}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${ogImage}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
<script>document.documentElement.className='js';</script>
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${HEADER}
<main id="main">
${body}
</main>
${FOOTER}
<script src="/assets/js/main.js" defer></script>
</body>
</html>
`;
}

// ------------------------------------------------------------------ Markdown (small, safe subset)
function inline(text) {
  const codes = [];
  let t = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = esc(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src) => `<img src="${/^(https?:|\/)/.test(src) ? src : '/' + src}" alt="${alt}" loading="lazy" decoding="async">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, label, url) => {
    const ext = /^https?:\/\//.test(url);
    const href = ext || /^(\/|#|mailto:|tel:)/.test(url) ? url : '/' + url;
    return `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  t = t.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!_)/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function ytId(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
function videoFrame(id, title, image) {
  const img = image ? `<img src="${esc(normPath(image))}" alt="" loading="lazy" decoding="async">` : '';
  return `<div class="video-frame" data-yt="${id}" data-title="${esc(title)}">${img}<button type="button" aria-label="Play video: ${esc(title)}"><span><span class="play">${PLAY}</span><span>Play video</span></span></button></div>
<p class="meta"><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Watch on YouTube</a></p>`;
}
const normPath = (p) => (/^(https?:|\/)/.test(p) ? p : '/' + p);

function markdown(src, title) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isBlank = (l) => /^\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    // fenced code
    if (/^```/.test(line)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    // youtube shortcode
    const yt = line.match(/^\{\{\s*youtube\s+(\S+)\s*\}\}\s*$/i);
    if (yt) { const id = ytId(yt[1]); out.push(id ? videoFrame(id, title) : `<p><em>Video link not recognised.</em></p>`); i++; continue; }
    // raw html block
    if (/^<[a-zA-Z!]/.test(line)) { const buf = []; while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]); out.push(buf.join('\n')); continue; }
    // headings (# and ## become h2 so each page keeps a single h1)
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { const lvl = h[1].length <= 2 ? 2 : h[1].length === 3 ? 3 : 4; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    // blockquote
    if (/^>/.test(line)) { const buf = []; while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${markdown(buf.join('\n'), title)}</blockquote>`); continue; }
    // lists
    const ul = /^\s*[-*+]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line), re = ordered ? ol : ul, items = [];
      while (i < lines.length && !isBlank(lines[i]) && (re.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (re.test(lines[i])) items.push(lines[i].replace(re, '')); else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    // paragraph
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s|\{\{)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    const only = buf.length === 1 && buf[0].match(/^!\[[^\]]*\]\([^)]+\)$/);
    out.push(only ? `<figure>${inline(buf[0])}</figure>` : `<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ read posts
function parseFront(text, file) {
  const m = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) { fail(file, 'The file must start with a block of details between two lines of three dashes (---).'); return null; }
  const meta = {};
  for (const ln of m[1].split('\n')) {
    if (!ln.trim() || ln.trim().startsWith('#')) continue;
    const k = ln.match(/^([A-Za-z_]+)\s*:\s*(.*)$/);
    if (!k) { fail(file, `Could not read this line in the details block: "${ln}". Each line must look like  name: value`); continue; }
    let v = k[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[k[1].toLowerCase()] = v;
  }
  return { meta, body: m[2] };
}

const posts = [];
if (fs.existsSync(POSTS_DIR)) {
  const slugs = new Map();
  for (const f of fs.readdirSync(POSTS_DIR).sort()) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const rel = `content/posts/${f}`;
    const parsed = parseFront(read(path.join(POSTS_DIR, f)), rel);
    if (!parsed) continue;
    const { meta, body } = parsed;
    if (/^(true|yes)$/i.test(meta.draft || '')) { console.log(`Skipping draft: ${f}`); continue; }
    const before = errors.length;
    const type = (meta.type || 'article').toLowerCase();
    if (!['article', 'video'].includes(type)) fail(rel, 'type must be "article" or "video".');
    if (!meta.title) fail(rel, 'Missing title.');
    if (!meta.summary) fail(rel, 'Missing summary (one or two sentences).');
    if (!meta.date || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date) || isNaN(Date.parse(meta.date))) fail(rel, 'date must look like 2026-11-14 (year-month-day).');
    const yid = type === 'video' ? ytId(meta.youtube) : null;
    if (type === 'video' && !yid) fail(rel, 'A video post needs  youtube: <link or 11-character video ID>.');
    if (meta.image && !/^https?:/.test(meta.image) && !fs.existsSync(path.join(SITE, meta.image.replace(/^\//, '')))) fail(rel, `Image not found: ${meta.image}. Upload the picture to the site/assets/img/ folder first.`);
    if (errors.length > before) continue;
    const slug = (meta.slug || f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) { fail(rel, 'Could not make a web address from the file name.'); continue; }
    if (slugs.has(slug)) { fail(rel, `Two posts would use the same web address (${slug}). Rename one file. The other is ${slugs.get(slug)}.`); continue; }
    slugs.set(slug, rel);
    if (meta.title.length > 62) warn(rel, `Title is ${meta.title.length} characters. Search results usually show about 60, so consider shortening it.`);
    if (meta.summary.length > 160) warn(rel, `Summary is ${meta.summary.length} characters. About 150 to 160 is ideal for search results.`);
    const tags = (meta.tags || '').replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean);
    posts.push({ file: f, rel, slug, type, title: meta.title, date: meta.date, updated: meta.updated && /^\d{4}-\d{2}-\d{2}$/.test(meta.updated) ? meta.updated : meta.date,
      summary: meta.summary, image: meta.image || '', yid, tags, author: meta.author || FOUNDER_NAME, body });
  }
}
if (errors.length) {
  for (const e of errors) console.error(`::error file=${e.file}::${e.msg}`);
  console.error(`\nBuild stopped: ${errors.length} problem(s) found. Fix the file(s) above and commit again.`);
  process.exit(1);
}
for (const w of warnings) console.log(`::warning file=${w.file}::${w.msg}`);
posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.file < b.file ? 1 : -1));

// ------------------------------------------------------------------ pages
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const url = (p) => `${ORIGIN}/resources/${p.slug}.html`;
const imgAbs = (p) => (p.image ? (/^https?:/.test(p.image) ? p.image : ORIGIN + normPath(p.image)) : DEFAULT_IMG);

function card(p) {
  const isVideo = p.type === 'video';
  const thumb = p.image ? `<img src="${esc(normPath(p.image))}" alt="" loading="lazy" decoding="async">` : (isVideo ? PLAY : '');
  return `<article class="post-card"><a class="thumb" href="/resources/${p.slug}.html" tabindex="-1" aria-hidden="true">${thumb}</a><div class="pc-body"><div class="meta"><span class="badge${isVideo ? ' video' : ''}">${isVideo ? 'Video' : 'Article'}</span><time datetime="${p.date}">${fmtDate(p.date)}</time></div><h3><a href="/resources/${p.slug}.html">${esc(p.title)}</a></h3><p>${esc(p.summary)}</p><a class="more" href="/resources/${p.slug}.html">${isVideo ? 'Watch now' : 'Read article'}</a></div></article>`;
}
const pageCount = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
const pageHref = (n) => (n === 1 ? '/resources.html' : `/resources/page-${n}.html`);
function pager(n) {
  if (pageCount === 1) return '';
  const parts = [];
  if (n > 1) parts.push(`<a href="${pageHref(n - 1)}" rel="prev">Newer</a>`);
  for (let k = 1; k <= pageCount; k++) parts.push(k === n ? `<span aria-current="page">${k}</span>` : `<a href="${pageHref(k)}">${k}</a>`);
  if (n < pageCount) parts.push(`<a href="${pageHref(n + 1)}" rel="next">Older</a>`);
  return `<nav class="pager" aria-label="Resources pages">${parts.join('')}</nav>`;
}
function listing(n) {
  const slice = posts.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE);
  return `<div class="post-grid">${slice.map(card).join('\n')}</div>\n${pager(n)}\n<p class="meta" style="margin-top:22px;justify-content:center"><a href="/feed.xml">Subscribe with RSS</a></p>`;
}

// list page 1 (inside resources.html) and pages 2..N
if (posts.length) {
  const re = /<!--POSTS:START-->[\s\S]*?<!--POSTS:END-->/;
  fs.writeFileSync(resourcesPath, resourcesSrc.replace(re, () => `<!--POSTS:START-->\n${listing(1)}\n<!--POSTS:END-->`));
}
const CTA = `<section class="cta-band"><div class="container reveal"><h2>Want help turning this into a plan?</h2><p>Book a free 1:1 consultation and we will look at your profile, your goals and your timeline together.</p><a class="btn btn-gold" href="${BOOK}"${BOOK_ATTR}>Book a 1:1 Consultation</a></div></section>`;
const hero = (crumbs, h1, lead) => `<section class="page-hero"><div class="container"><p class="crumbs">${crumbs}</p><h1>${h1}</h1>${lead}</div></section>`;
for (let n = 2; n <= pageCount; n++) {
  const body = hero('<a href="/index.html">Home</a> / <a href="/resources.html">Resources</a> / Page ' + n, `Articles and videos, page ${n}`, '<p class="lead">Practical, honest guidance for MBA and Master\'s applicants.</p>')
    + `<section><div class="container">${listing(n)}</div></section>` + CTA;
  fs.writeFileSync(path.join(OUT_DIR, `page-${n}.html`), shell({ title: `Resources, Page ${n} | Astradmit`, desc: `Articles and videos for MBA and Master's applicants from Astradmit, page ${n}.`, canonical: `${ORIGIN}/resources/page-${n}.html`, body }));
}

// post pages
posts.forEach((p, idx) => {
  const newer = posts[idx - 1], older = posts[idx + 1];
  const words = p.body.split(/\s+/).filter(Boolean).length, mins = Math.max(1, Math.round(words / 200));
  const bodyHtml = markdown(p.body, p.title);
  const isVideo = p.type === 'video';
  const crumbs = `<a href="/index.html">Home</a> / <a href="/resources.html">Resources</a> / ${esc(p.title)}`;
  const metaLine = `<p class="meta" style="color:#B8C4DD"><span class="badge${isVideo ? ' video' : ''}">${isVideo ? 'Video' : 'Article'}</span><time datetime="${p.date}">${fmtDate(p.date)}</time><span>By ${esc(p.author)}</span>${isVideo ? '' : `<span>${mins} min read</span>`}</p>`;
  const nav = (newer || older) ? `<nav class="post-nav" aria-label="More posts">${older ? `<a href="/resources/${older.slug}.html" rel="prev"><small>Older</small>${esc(older.title)}</a>` : '<span></span>'}${newer ? `<a href="/resources/${newer.slug}.html" rel="next"><small>Newer</small>${esc(newer.title)}</a>` : '<span></span>'}</nav>` : '';
  const body = hero(crumbs, esc(p.title), metaLine)
    + `<section><div class="container"><article class="post">
${isVideo ? videoFrame(p.yid, p.title, p.image) : (p.image ? `<img src="${esc(normPath(p.image))}" alt="${esc(p.title)}" width="1200" height="630" style="border-radius:18px;margin-bottom:1.4em" decoding="async">` : '')}
<p class="quick"><strong>In short:</strong> ${esc(p.summary)}</p>
<div class="post-body">
${bodyHtml}
</div>
${p.tags.length ? `<p class="meta" style="margin-top:2em">Topics: ${p.tags.map(esc).join(', ')}</p>` : ''}
<p class="quick" style="margin-top:2em">Written by <a href="/about.html#founder">${esc(p.author)}</a>, founder of Astradmit, who has spent over a decade helping MBA and Master's applicants. Astradmit offers mentoring and process guidance and does not guarantee admissions or scholarships.</p>
${nav}
</article></div></section>` + CTA;
  const author = { '@type': 'Person', '@id': PERSON_ID, name: p.author, url: `${ORIGIN}/about.html` };
  const publisher = { '@type': 'Organization', '@id': ORG_ID, name: 'Astradmit', logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/img/logo.svg` } };
  const posting = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.summary, image: [imgAbs(p)], datePublished: `${p.date}T09:00:00+05:30`,
    dateModified: `${p.updated}T09:00:00+05:30`, author, publisher, mainEntityOfPage: { '@type': 'WebPage', '@id': url(p) }, inLanguage: 'en', ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}) };
  const schema = [posting];
  if (isVideo) schema.push({ '@context': 'https://schema.org', '@type': 'VideoObject', name: p.title, description: p.summary, thumbnailUrl: [imgAbs(p)], uploadDate: `${p.date}T09:00:00+05:30`,
    embedUrl: `https://www.youtube.com/embed/${p.yid}`, url: url(p), publisher, author });
  schema.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` }, { '@type': 'ListItem', position: 2, name: 'Resources', item: `${ORIGIN}/resources.html` }, { '@type': 'ListItem', position: 3, name: p.title, item: url(p) }] });
  const extra = `<meta property="article:published_time" content="${p.date}"><meta property="article:modified_time" content="${p.updated}"><meta property="article:author" content="${esc(p.author)}">`;
  fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), shell({ title: `${p.title} | Astradmit`, desc: p.summary, canonical: url(p), ogType: 'article', ogImage: imgAbs(p), schema, body, extraMeta: extra }));
});

// ------------------------------------------------------------------ feed, sitemap, llms.txt
const feedItems = posts.slice(0, 30).map((p) => `  <item><title>${esc(p.title)}</title><link>${url(p)}</link><guid isPermaLink="true">${url(p)}</guid><pubDate>${rssDate(p.date)}</pubDate><description>${esc(p.summary)}</description>${p.tags.map((t) => `<category>${esc(t)}</category>`).join('')}</item>`).join('\n');
fs.writeFileSync(path.join(SITE, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
  <title>Astradmit: articles and videos</title><link>${ORIGIN}/resources.html</link><atom:link href="${ORIGIN}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Practical, honest guidance for MBA and Master's applicants from Astradmit.</description><language>en</language>
${feedItems}
</channel></rss>
`);

const smPath = path.join(SITE, 'sitemap.xml');
if (fs.existsSync(smPath)) {
  let sm = read(smPath).replace(/\s*<url><loc>[^<]*\/resources\/[^<]*<\/loc>[^]*?<\/url>/g, '');
  const latest = posts.length ? posts[0].date : null;
  if (latest) sm = sm.replace(/(<loc>[^<]*\/resources\.html<\/loc><lastmod>)[^<]*/, `$1${latest}`);
  const add = [...posts.map((p) => `  <url><loc>${url(p)}</loc><lastmod>${p.updated}</lastmod></url>`), ...Array.from({ length: Math.max(0, pageCount - 1) }, (_, k) => `  <url><loc>${ORIGIN}/resources/page-${k + 2}.html</loc>${latest ? `<lastmod>${latest}</lastmod>` : ''}</url>`)].join('\n');
  fs.writeFileSync(smPath, sm.replace('</urlset>', `${add ? add + '\n' : ''}</urlset>`));
}
const llmsPath = path.join(SITE, 'llms.txt');
if (fs.existsSync(llmsPath) && posts.length) {
  const base = read(llmsPath).replace(/\n## Articles and videos[\s\S]*$/, '\n');
  fs.writeFileSync(llmsPath, `${base.trimEnd()}\n\n## Articles and videos\n${posts.slice(0, 50).map((p) => `- [${p.title}](${url(p)}): ${p.summary}`).join('\n')}\n`);
}
console.log(`Resources built: ${posts.length} post(s), ${pageCount} list page(s).`);
