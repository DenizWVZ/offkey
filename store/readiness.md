# Store readiness

What's still needed before sending Offkey to testers and submitting it to the Chrome Web Store.
Started from the audit on 2026-10-02 (`publishing` branch). Finished copy lives in [listing.md](listing.md);
this file holds everything still to do.

## Before submitting

- [x] **Name: Offkey.** Renamed everywhere (manifest, tooltip, vocals page, demo page, docs, package name).
      Chosen because a store extension called "Transpose ▲▼" already offers similar features.
- [x] **Manifest description.** Now the short description from listing.md.
- [x] **Icons in the extension.** `npm run icons` makes 16/32/48/128 px from `store/Icon.svg` into
      `src/extension/icons/` (in the build, set in the manifest) and the store icon `store/icon-128.png`.
- [x] **One logo.** The ring of dots everywhere: toolbar and store icons (darker grey, #8A8A8A, for
      legibility on light and dark toolbars), the widget's header and the demo/playground artwork (#B3B3B3).
- [ ] **Audio tap (`hook.ts`, formerly "audio copier"), the main review risk.** Store policy forbids enabling unauthorized downloads
      of copyrighted media, and reviewers are strict about YouTube. Ours keeps the audio in memory only, for
      vocal separation, and never saves or sends it.
  - [x] Say so in the reviewer notes and the store description (listing.md).
  - [x] Reword the code comments: it's now the "audio tap", which reads the audio YouTube loads for playback, in memory only.
  - [ ] Never add an export or save feature.
- [ ] **Privacy.**
  - [x] Single purpose, permission reasons, remote code, `wasm-unsafe-eval` and the privacy policy text (listing.md).
  - [x] Data-use answers: tick "Web browsing activity" and "Website content". Google requires declaring data
        handled on the device too (listing.md has the exact boxes). The privacy policy matches.
  - [ ] **You:** a contact email for the privacy policy (your professional email works; it will be public).
  - [ ] **You:** publish the privacy policy at a public address you control (e.g. a page on your portfolio)
        and add the address to the dashboard.
- [x] **Description.** Rewritten in listing.md: YouTube and YouTube Music only, with the limits.
- [x] **Store images.**
  - [x] Screenshots: `screenshot-1.png` and `screenshot-2.png` (1280×800).
  - [x] Store icon: `icon-128.png` (128×128, made by `npm run icons`).
  - [x] Small promo tile: `Promo tile.png` (440×280).
- [x] **Dashboard details.** Drafted in listing.md: Entertainment, English, optional portfolio links.
- [ ] **You:** create the developer account (Google account, one-time $5 fee, verified contact email).
- [ ] **Final check on the zip you upload.** Follow the reviewer notes step by step on that exact build,
      and confirm it makes no network requests beyond YouTube's own.
- [ ] **Version.** `0.1.0` is fine to start; every upload needs a higher number than the last.

## Smaller things worth doing

- [x] **Minimum Chrome version.** Set to 111 (the audio tap needs it).
- [x] **Memory on every YouTube tab.** Until the widget is first opened, the audio tap holds only the current
      video's audio, and at most 20 MB (was 40 MB, any video). Checked on YouTube: opening mid-song or after a
      song change still gives Vocals the whole song.
- [x] **Files YouTube can see** (`web_accessible_resources`). Kept as is. `use_dynamic_url` was tried: it stops
      the vocals frame from loading the model, so it's off. `chunks/*` stays (empty today, needed if the build
      ever splits the widget script).
- [x] **Vocals page accepts any connection.** Now only the first connection (the widget's) is accepted.
- [x] **Leftover test hooks.** Kept: the YouTube check script needs them, and the page can't see them.
- [x] **Pitch library patch.** The extension build now stops with a message if the patch is missing.
- [x] **Model runtime credits.** Checked: the ONNX Runtime package ships only its own MIT licence, already in `NOTICES.txt`.

## Decisions

- **Model: bundled** (decided 2026-10-02). Vocals work the first time and offline, with nothing to host; the
  model is only loaded the first time Vocals is used, so performance is the same. The zip is 33 MB.
  If this ever changes, update the remote-code answer, reviewer notes and privacy policy in listing.md.
- **How testers install it** (decided 2026-10-05): first round with a ready-made zip on GitHub Releases
  (`npm run zip`, install and update steps in the README; updates by hand). Then a **Private (trusted testers)**
  store listing, which updates testers automatically; switch it to Public when ready.

## Already fine

- Manifest V3, background service worker.
- Only the `storage` permission; access to `www.youtube.com` and `music.youtube.com` only.
- No remote code: no CDN addresses or `eval` in the build; the model runtime is bundled.
- The test panel and tuning code are left out of the regular build.
- Minified, not obfuscated (allowed). Licence credits in `NOTICES.txt`.
- Ads are never skipped or sped up.

## Sources

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
