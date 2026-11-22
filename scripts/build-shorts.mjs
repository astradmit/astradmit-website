#!/usr/bin/env node
/*
  Astradmit: prepares the "Short videos" carousel (Home and Resources pages).

  Reads the public YouTube Shorts feed of the Astradmit channel, keeps the newest videos first,
  copies each video's thumbnail onto the website (so visitors' browsers do not contact YouTube
  until they press play) and writes the list the carousel shows.

  Output (created at publish time, never committed):
    site/assets/shorts.json          the list of videos, newest first
    site/assets/img/shorts/<id>.jpg  one thumbnail per video

  Uses only Node.js built-in modules. Runs automatically in GitHub Actions before every deploy
  and every 6 hours, so new YouTube Shorts appear on the website without any manual step.

  Settings (environment variables, all optional):
    SHORTS_STRICT=1        stop with an error if YouTube cannot be reached or the list is empty
                           (used by the scheduled run so the live site keeps its current carousel)
    SHORTS_FEED_FILE=path  read a saved copy of the feed instead of YouTube (for testing)
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
const STRICT = process.env.SHORTS_STRICT === '1';
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
for (const v of list) v.thumb = await getThumb(v.id);
if (!FEED_FILE) for (const v of list) if (!v.thumb) console.warn(`WARNING: no thumbnail for ${v.id}; its card will show a plain colour`);
finish(list);
