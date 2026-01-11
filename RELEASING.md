# npm Release Process

This document explains how to release Sierra DB Query to npm.

## One-Time Setup

### 1. Create npm Account

If you don't have one, create an account at [npmjs.com](https://www.npmjs.com/signup)

### 2. Generate npm Access Token

1. Go to [npmjs.com](https://www.npmjs.com) → Click your avatar → **Access Tokens**
2. Click **Generate New Token** → **Classic Token**
3. Select **Automation** (for CI/CD)
4. Copy the token (starts with `npm_`)

### 3. Add Token to GitHub Secrets

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Value: Paste your npm token
5. Click **Add secret**

---

## How to Release

### Method 1: GitHub Release (Recommended - Automated)

1. **Update version in package.json:**
   ```bash
   # On npm-release branch
   npm version patch  # or minor, or major
   git push origin npm-release --tags
   ```

2. **Create GitHub Release:**
   - Go to GitHub repo → **Releases** → **Create a new release**
   - Choose the tag you just created (e.g., `v1.0.1`)
   - Title: `v1.0.1`
   - Description: List changes
   - Click **Publish release**

3. **Automatic publish:**
   - GitHub Actions will automatically publish to npm
   - Check **Actions** tab for status

### Method 2: Manual Publish

```bash
# Login to npm (one-time)
npm login

# Build and publish
npm run build
npm publish
```

---

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

| Change Type | Command | Example |
|-------------|---------|---------|
| Bug fixes | `npm version patch` | 1.0.0 → 1.0.1 |
| New features (backward compatible) | `npm version minor` | 1.0.0 → 1.1.0 |
| Breaking changes | `npm version major` | 1.0.0 → 2.0.0 |

---

## After Publishing

### Verify on npm

```bash
# Check package info
npm view sierra-db-query

# Test installation
npx sierra-db-query --help
```

### Update Smithery

If you're also on Smithery, the npm package is separate. Smithery uses the GitHub repo directly.

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Development, features, docs |
| `npm-release` | Stable releases to npm |
| `client` | Browser client development |

### Workflow

1. Develop on `main` or feature branches
2. When ready to release, merge to `npm-release`
3. Create GitHub Release from `npm-release`
4. npm package is published automatically

---

## Troubleshooting

### "npm ERR! 403 Forbidden"
- Check if package name is taken: `npm view sierra-db-query`
- Verify NPM_TOKEN is correct in GitHub Secrets

### "npm ERR! 401 Unauthorized"
- Token may have expired
- Generate new token and update GitHub Secret

### Build Fails in CI
- Check Node.js version compatibility
- Run `npm run build` locally first

---

## Quick Commands Reference

```bash
# Check current version
npm version

# Bump version
npm version patch -m "Release %s"

# Push with tags
git push origin npm-release --tags

# Dry run publish (see what would be published)
npm publish --dry-run

# Publish for real
npm publish
```
