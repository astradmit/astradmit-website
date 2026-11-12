# Astradmit website

Static website for Astradmit (MBA and Master's mentoring), hosted on Firebase Hosting.

- `site/` holds the website files that are published.
- `firebase.json` and `.firebaserc` configure Firebase Hosting.
- `content/posts/` holds one Markdown file per article or video shown on the Resources page.
- `scripts/build-resources.mjs` turns those files into web pages every time the site is published.
- `.github/workflows/` builds the Resources pages, then deploys a preview for every pull request and the live site when a pull request is merged into `main`.

## How to change the website

1. Make your edit on a new branch and open a pull request.
2. Open the preview link that appears on the pull request and check your change.
3. Merge the pull request. The live site updates in about two minutes.

Never edit `main` directly. See the Astradmit Deploy and Update Guide for step-by-step instructions.

## Adding an article or video

1. In `content/posts/`, copy `_TEMPLATE-article.md` or `_TEMPLATE-video.md` and rename the copy, for example `2026-11-14-gmat-or-gre.md`.
2. Fill in the details at the top and write the post below them.
3. Open a pull request, check the preview link, and merge.

Files starting with `_` are templates and are never published. Add `draft: true` to hide a post until it is ready.
