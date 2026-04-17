# Development Guide

[English](DEVELOPMENT.md) | [日本語](DEVELOPMENT_ja.md)

This guide describes the local development and test setup for MirrorChat.

## Local development

### Prerequisites

- No build step: the extension is plain Vanilla JavaScript (ES2020+) loaded directly by Chrome
- Source code lives in `ai-prompt-broadcaster/`
- The root `package.json` is only for development tooling such as ESLint

### Load the Chrome extension

1. Open `chrome://extensions/` in Chrome.
2. Turn on Developer mode.
3. Click Load unpacked and select `ai-prompt-broadcaster/`.
4. Reload the extension from the extensions page after every code change.

### Lint and tests

```bash
pnpm lint
cd e2e && pnpm test
```

See [e2e/README.md](../e2e/README.md) for more end-to-end details.

## Digest flow

- A question file is saved first with question text, summary, and every AI response section.
- The summary starts as a pending placeholder when digest is enabled and as not generated when disabled.
- After the raw answers are stored successfully, the background script requests an asynchronous digest through OpenRouter.
- Digest generation must not block or roll back raw answer storage.
- Free-model selection and fallback rules are isolated in [ai-prompt-broadcaster/openRouterFreeModels.js](../ai-prompt-broadcaster/openRouterFreeModels.js).
- Manual refresh of free-model candidates from OpenRouter `/models` is also handled there.
- OpenRouter API calls live in [ai-prompt-broadcaster/openRouterClient.js](../ai-prompt-broadcaster/openRouterClient.js), while prompt design and validation live in [ai-prompt-broadcaster/digestService.js](../ai-prompt-broadcaster/digestService.js).

## Cloud agent environment

### Launch Chrome headless with the extension

```bash
google-chrome --no-sandbox --disable-gpu --load-extension=/workspace/ai-prompt-broadcaster --no-first-run --disable-default-apps --start-maximized &
```

Adjust the path for your environment.

### Set up Obsidian for end-to-end testing

You can install Obsidian even in a cloud agent environment.

```bash
cd /tmp
curl -L -o Obsidian.AppImage "https://github.com/obsidianmd/obsidian-releases/releases/download/v1.8.9/Obsidian-1.8.9.AppImage"
chmod +x Obsidian.AppImage && ./Obsidian.AppImage --appimage-extract

mkdir -p /home/ubuntu/ObsidianVault
/tmp/squashfs-root/obsidian --no-sandbox --disable-gpu &
```

After launch, create or open a vault at `/home/ubuntu/ObsidianVault`, install Local REST API from Community Plugins, and enable it. The default HTTP port is 27123 and HTTPS is 27124. Then set the extension Options page to `http://127.0.0.1:27123/`.

### Full E2E with a logged-in profile

See [E2E_LOGIN_PROFILE.md](E2E_LOGIN_PROFILE.md) for the logged-in Chrome profile workflow. That document is currently available in Japanese only. After placing the profile archive at `e2e/chrome-profile.zip`, run:

```bash
cd e2e && pnpm test:with-profile:headed
```
