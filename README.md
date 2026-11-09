# Astradmit website

Static website for Astradmit (MBA and master's mentoring), hosted on Firebase Hosting.

- `site/` holds the website files that are published.
- `firebase.json` and `.firebaserc` configure Firebase Hosting.
- `.github/workflows/` deploys a preview for every pull request and the live site when a pull request is merged into `main`.

## How to change the website

1. Make your edit on a new branch and open a pull request.
2. Open the preview link that appears on the pull request and check your change.
3. Merge the pull request. The live site updates in about two minutes.

Never edit `main` directly. See the Astradmit Deploy and Update Guide for step-by-step instructions.
