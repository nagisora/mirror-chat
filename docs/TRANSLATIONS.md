# Translation Workflow

[English](TRANSLATIONS.md) | [日本語](TRANSLATIONS_ja.md)

This repository currently supports documentation in English and Japanese.

## Scope

- English files without a language suffix are the canonical versions.
- Japanese files use the `_ja.md` suffix and should mirror the corresponding English files.
- Internal research notes can remain Japanese-only until they become part of the user or contributor experience.

## Update rules

1. Update the English canonical document first.
2. Update the Japanese counterpart in the same change whenever possible.
3. If both cannot be updated together, add a short note in the pull request describing which file still needs translation follow-up.

## File naming

- `README.md` and `README_ja.md`
- `CONTRIBUTING.md` and `CONTRIBUTING_ja.md`
- `docs/NAME.md` and `docs/NAME_ja.md`

## Review expectations

- Check that links point to the correct language variant.
- Keep section order aligned between English and Japanese unless there is a strong reason to diverge.
- Prefer precise technical wording over literal machine-translation phrasing.

## Non-goals for now

- No additional languages beyond English and Japanese yet.
- No language-specific directory layout such as `docs/ja/` until the number of translated files grows enough to justify it.