#!/usr/bin/env node
/*
  Astradmit: prepares the "Short videos" carousel (Home and Resources pages).

  Reads the public YouTube Shorts feed of the Astradmit channel, keeps the newest videos first,
  copies each video's thumbnail onto the website (so visitors' browsers do not contact YouTube
  until they press play) and writes the list the carousel shows.

  Output (created at publish time, never committed):
    site/assets/shorts.json          the list of videos, newest first
    site/assets/img/shorts/<id>.jpg  one thumbnail per video

  Uses only Node.js built-in modules. Runs automatically in GitHub Actions before every deploy.
  A scheduled run (every 6 hours) first runs this script in CHECK mode (see SHORTS_COMPARE_URL), and the
  site is only rebuilt and published when YouTube has a Short that the live carousel does not have yet.

  Settings (environment variables, all optional):
    SHORTS_STRICT=1        stop with an error if YouTube cannot be reached or the list is empty
                           (used by the scheduled run so the live site keeps its current carousel)
    SHORTS_FEED_FILE=path  read a saved copy of the feed instead of YouTube (for testing)
    SHORTS_COMPARE_URL=u   CHECK mode: compare the YouTube feed with the shorts.json that is already live
                           (a web address, or a file path for testing). Nothing is written or downloaded.
                           Prints "changed=true" or "changed=false" (and writes it to GITHUB_OUTPUT when that
                           exists). If the live list cannot be read, it reports changed=true so the site is
                           refreshed rather than left stale.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL_ID = 'UC2kbaCmQCtwkBG3R37TDoyw';
const CHANNEL_URL = `https://www.youtube.com/channel/${CHANNEL_ID}`;
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${CHANNEL_ID.slice(2)}`; // UUSH... = the channel's Shorts
const KEEP = 15; // YouTube's feed holds the latest 15 videos; the pages show the newest 8 (Home) and 12 (Resources)
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const THUMB_DIR = path.join(SITE, 'assets', 'img', 'shorts');
const OUT = path.join(SITE, 'assets', 'shorts.json');
const COMPARE = process.env.SHORTS_COMPARE_URL;
const STRICT = process.env.SHORTS_STRICT === '1' || !!COMPARE; // check mode never replaces the live carousel with an empty one
const FEED_FILE = process.env.SHORTS_FEED_FILE;
const UA = { 'User-Agent': 'AstradmitSiteBuild/1.0 (+https://www.astradmit.com)' };
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function finish(videos, note) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), channel: CHANNEL_URL, videos }, null, 1));
  console.log(`Shorts carousel: ${videos.length} video(s)${note ? ' (' + note + ')' : ''}`);
}
function problem(msg) {
  if (STRICT) { console.error('ERROR: ' + msg); process.exit(1); }
  console.warn('WARNING: ' + msg + '. The carousel will be hidden until the next successful run.');
  finish([], 'feed unavailable');
  process.exit(0);
}

const decode = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
// Titles on YouTube often end with #hashtags; they look noisy on the website, so they are removed here.
const cleanTitle = (t) => decode(t).replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim() || 'Short video';

async function getFeed() {
  if (FEED_FILE) return fs.readFileSync(FEED_FILE, 'utf8');
  let last;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(FEED_URL, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { last = e; if (i < 3) await sleep(i * 1500); }
  }
  throw last;
}

async function getThumb(id) {
  const file = path.join(THUMB_DIR, id + '.jpg');
  if (fs.existsSync(file) && fs.statSync(file).size > 2000) return true;
  if (FEED_FILE) return false; // test mode: no downloads
  for (const name of ['maxresdefault', 'sddefault', 'hqdefault']) { // best quality first
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 2000) continue;
      fs.mkdirSync(THUMB_DIR, { recursive: true });
      fs.writeFileSync(file, buf);
      return true;
    } catch (e) { /* try the next size */ }
  }
  return false;
}

let xml;
try { xml = await getFeed(); } catch (e) { problem('could not read the YouTube Shorts feed (' + (e.message || e) + ')'); }

const videos = [];
for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
  const b = m[1];
  const id = (b.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
  const title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  const published = (b.match(/<published>([^<]+)<\/published>/) || [])[1];
  if (!id || !ID_RE.test(id) || !title || !published || isNaN(Date.parse(published))) continue;
  videos.push({ id, title: cleanTitle(title), published });
}
if (!videos.length) problem('the YouTube Shorts feed has no videos');

videos.sort((a, b) => Date.parse(b.published) - Date.parse(a.published)); // newest first
const list = videos.slice(0, KEEP);

// CHECK mode: is there a Short on YouTube that the live site does not show yet? Writes nothing, downloads nothing.
async function liveIds() {
  try {
    let text;
    if (/^https?:\/\//.test(COMPARE)) {
      const r = await fetch(COMPARE + (COMPARE.includes('?') ? '&' : '?') + 't=' + Date.now(), { headers: { ...UA, 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      text = await r.text();
    } else text = fs.readFileSync(COMPARE, 'utf8');
    const data = JSON.parse(text);
    if (!Array.isArray(data.videos)) throw new Error('no video list in the file');
    return new Set(data.videos.map((v) => v.id));
  } catch (e) {
    console.warn('WARNING: could not read the live carousel list (' + (e.message || e) + '). Treating this as "changed" so the site gets refreshed.');
    return null;
  }
}
if (COMPARE) {
  const live = await liveIds();
  const fresh = live ? list.filter((v) => !live.has(v.id)) : list;
  const changed = fresh.length > 0;
  const msg = changed
    ? (live ? `${fresh.length} new Short(s) on YouTube: ${fresh.map((v) => v.id).join(', ')}. Rebuilding and publishing.` : 'Live list unavailable. Rebuilding and publishing.')
    : `No new Shorts on YouTube (${list.length} checked, all already on the live site). Nothing to publish.`;
  console.log(`Shorts check: changed=${changed}. ${msg}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**Shorts check:** ${msg}\n`);
  process.exit(0);
}

for (const v of list) v.thumb = await getThumb(v.id);
if (!FEED_FILE) for (const v of list) if (!v.thumb) console.warn(`WARNING: no thumbnail for ${v.id}; its card will show a plain colour`);
finish(list);
