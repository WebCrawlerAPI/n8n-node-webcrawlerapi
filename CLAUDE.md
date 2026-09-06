# Repository Notes

- When the user says "bump", update the npm package version and create a git tag with the exact same version string, without a leading `v`.

## Linting

Before publishing, always run the n8n community-node lint from this directory:

```bash
npx @n8n/node-cli@latest lint
```

It runs the local `eslint .`, whose config (`eslint.config.js`) includes
`@n8n/eslint-plugin-community-nodes` recommended rules — the same rules the n8n
review team runs via `npx @n8n/scan-community-package n8n-nodes-webcrawlerapi`
(that scanner only checks the *published* npm package, so it cannot verify local
changes). The lint must report 0 errors before publishing a new version.
