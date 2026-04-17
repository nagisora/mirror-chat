# Contributing

[English](CONTRIBUTING.md) | [日本語](CONTRIBUTING_ja.md)

Thank you for your interest in contributing to MirrorChat.

## Development setup

1. Clone the repository.
2. Open `chrome://extensions/` in Chrome, enable Developer mode, and load the `ai-prompt-broadcaster` folder.
3. After each code change, reload the extension from the extensions page.

## Contribution flow

1. Check an existing issue or open a new one.
2. Create a branch such as `feature/xxx` or `fix/xxx`.
3. Make your changes and commit them.
4. Open a pull request.

## Coding rules

- Language: Vanilla JavaScript (ES2020+) with no build step
- `content-utils.js`: because it may be injected multiple times into the same tab, top-level constants must use `var` with an existing-value guard
- Commit messages should be written in Japanese in this repository

## Tests

```bash
cd e2e && pnpm test
```

You can run the full send-and-fetch flow with a logged-in Chrome profile.

## Translation workflow

See [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md) for the EN/JA documentation policy.

## Questions

If you are unsure about a change, open an issue.
