# Stroke-guide data provenance

The handwriting guides use a small, reproducible subset of [KanjiVG](https://kanjivg.tagaini.net/). The project distributes these data under **Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)**. The app's software license does not replace this data license.

## Source and attribution

| Field | Value |
| --- | --- |
| Work | KanjiVG: Kanji Vector Graphics |
| Original copyright notice in the SVG files | Copyright (C) 2009/2010/2011 Ulrich Apel. |
| Official site | <https://kanjivg.tagaini.net/> |
| Repository | <https://github.com/KanjiVG/kanjivg> |
| Pinned source revision | [`610091ce618cf757ed1357a8954cd65283e015d6`](https://github.com/KanjiVG/kanjivg/tree/610091ce618cf757ed1357a8954cd65283e015d6), dated 2026-11-05 |
| License | <https://creativecommons.org/licenses/by-sa/3.0/> |
| Full upstream license and retained attribution | [`public/licenses/kanjivg.txt`](public/licenses/kanjivg.txt) |
| Extracted data | [`src/data/kana.ts`](src/data/kana.ts), also CC BY-SA 3.0 |
| Input integrity record | [`scripts/kanjivg-manifest.json`](scripts/kanjivg-manifest.json) |

The [official KanjiVG documentation](https://kanjivg.tagaini.net/files.html) describes the 109 × 109 coordinate system and schoolbook-based reference shapes. The standard, non-variant SVG filenames are Unicode code points in lower-case hexadecimal, padded to five characters; for example, `kanji/03042.svg` is あ.

## Exactly what changed

The subset contains the 46 modern basic hiragana, from あ through ん. It excludes obsolete ゐ/ゑ, small kana, voiced kana, semi-voiced kana, katakana, and kanji.

The importer copies each SVG path's `d` value verbatim, preserving the original path order and the `0 0 109 109` coordinate system. It removes XML wrappers, SVG styles, original stroke-number text labels, and other SVG metadata, then packages the paths in a TypeScript data module alongside the character, romaji, teaching-group ID, and alternative romanizations. No geometry is redrawn, simplified, or inferred. Any visual resizing by the app is uniform SVG scaling.

This extracted/repackaged dataset is an adaptation under **CC BY-SA 3.0**. Its source header, this document, and the shipped license retain attribution and identify these modifications. If you modify or redistribute the derived stroke data, preserve its license and attribution. No endorsement by KanjiVG or its authors is implied.

The default references use schoolbook-style stroke forms. Handwritten alternatives may legitimately differ, including joined or separated components. The guide shapes are teaching references; they are not a per-pixel grading rule or a claim that only one handwriting style is correct.

## Reproduce and verify

Python 3 and an internet connection are sufficient; there are no third-party Python dependencies.

```sh
python3 scripts/import-kanjivg.py
```

The script downloads the 46 SVGs and upstream `COPYING` from the pinned revision, verifies their SHA-256 hashes, then regenerates the TypeScript data and combined attribution/license file. Downloaded inputs need not be checked into this repository. Optional local caching:

```sh
python3 scripts/import-kanjivg.py --cache /tmp/practice-hiragana-kanjivg
```

The source URL for any input is `https://raw.githubusercontent.com/KanjiVG/kanjivg/610091ce618cf757ed1357a8954cd65283e015d6/` followed by its path in the manifest. Updating the upstream version is an explicit maintenance operation: review the new source and license, change the revision in the script and documentation, and use `--update-hashes` to regenerate the manifest. Normal regeneration refuses a source-hash mismatch.

## Reading labels

The primary labels use common Hepburn spellings: `shi`, `chi`, `tsu`, and `fu`. The metadata also records `si`, `ti`, `tu`, and `hu` as alternative romanizations. を is labeled `wo` to keep its practice prompt distinct from お (`o`); its usual particle pronunciation `o` is recorded as an alias. These aliases do not collapse two different kana into one answer.

は and へ retain their individual-character labels `ha` and `he`; their particle pronunciations depend on context. This app practices individual basic kana rather than Japanese spelling in full sentences.
