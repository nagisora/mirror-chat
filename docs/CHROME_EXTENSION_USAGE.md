# MirrorChat Chrome Extension Usage Guide

[English](CHROME_EXTENSION_USAGE.md) | [日本語](CHROME_EXTENSION_USAGE_ja.md)

## 1. Install the extension

1. Place the `ai-prompt-broadcaster` folder anywhere on your machine.
2. Open `chrome://extensions/` in Chrome.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select the `ai-prompt-broadcaster` folder.

## 2. Prepare Obsidian

1. Launch Obsidian and open your vault.
2. Go to Settings, Community plugins, and disable Restricted mode if needed.
3. Search for and install Local REST API.
4. Enable the plugin and check the following in its settings:
   - Port number, typically 27124 for HTTPS or 27123 for HTTP
   - API token, if one is required for your setup

## 3. Configure the extension

1. Right-click the extension icon and open Options.
2. Set Obsidian Local REST API Base URL, for example `https://127.0.0.1:27124/`.
3. Enter the API token from Obsidian if needed.
4. Set Storage Root Path, for example `200-AI Research`.
5. If you want digests, enable asynchronous digest generation after saving answers and set your OpenRouter API key.
6. Click Save.
7. If you want the latest free-model candidates, click Refresh free candidates.

## 4. Use the extension

1. Log in to ChatGPT, Claude, Gemini, or Grok in your browser ahead of time if possible.
2. Click the extension icon.
3. Enter your question and click Send.
4. The extension opens the AI sites in sequence and submits the prompt automatically.
5. After the answers are collected, a file such as `01-question-prefix.md` is created under `storage-root/YYYYMMDD-sequence-question-prefix/` in your Obsidian vault.
6. Each question file contains `## Question`, `## Summary`, and the response sections for every AI. When digest is enabled, the summary initially shows a pending placeholder and is replaced later with an OpenRouter-generated digest.
7. If digest generation fails, the raw answers remain saved and the summary section reflects the failure state.

## 5. Troubleshooting

### Saving fails

- Make sure Obsidian is running.
- Make sure the Local REST API plugin is enabled.
- Verify that the base URL and API token are correct.
- Failed items can be retried from the extension.

### One AI service fails to fetch a response

- Confirm that you are logged in to that service.
- Adjust the DOM selectors in the Options page if the provider UI changed.
- Inspect the page in browser developer tools and update the selectors accordingly.
