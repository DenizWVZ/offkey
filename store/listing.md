# Offkey: Chrome Web Store copy

Text to paste into the store's developer dashboard. Only finished copy lives here; everything still to do
(including the TODOs that used to be in this file) is in [readiness.md](readiness.md).
The extension supports **YouTube and YouTube Music only**.

## Name and short description

**Name** (store and manifest)

> Offkey

**Short description** (manifest `description`, 93 characters; 132 maximum)

> Change pitch and speed, reduce vocals, and set quick cue points on YouTube and YouTube Music.

**Toolbar tooltip** (manifest `action.default_title`)

> Show or hide Offkey

## Detailed description

Plain text for the store's description field (no formatting carries over).

> Offkey puts a small player on top of YouTube and YouTube Music, so you can change how a song sounds while it plays. Made for singers and musicians who practise along with songs.
>
> • Pitch: move a song up or down by up to 7 semitones, without changing its speed.
> • Speed: play from 50% to 150%, without changing its key.
> • Vocals: turn the singing down with AI vocal separation, to sing or play along.
> • Cues: save up to five spots in a song and jump to them instantly, with a click or the number keys 1–5.
>
> Offkey remembers your settings and cues for the last 50 songs you changed, so a song sounds the way you left it when you come back.
>
> Everything runs on your computer. Offkey doesn't save, export or upload any audio, and nothing you do is sent anywhere.
>
> Good to know:
> • Vocals take a few seconds to get ready the first time you use them, and work best on a recent computer.
> • Vocals aren't available on videos longer than 20 minutes.
> • Ads play as normal: Offkey never skips or speeds them up.
>
> Vocal separation uses the UVR-MDX-NET 1 model from Ultimate Vocal Remover (UVR) by Anjok07 and aufr33 (MIT licence). Full open-source credits are in NOTICES.txt inside the extension.

Optional tagline for other places (not the promo tile): **Tweak what you're listening to.**

## Privacy tab

**Single purpose**

> Offkey changes playback on YouTube and YouTube Music with pitch, speed, vocal reduction and cue controls.

**Why `storage` is needed**

> Offkey stores playback settings and cue points for up to 50 recently adjusted YouTube videos, along with the widget's position and whether its Cues section is open, in Chrome's local extension storage. It also uses temporary session storage to reopen the widget after the extension is reloaded. These settings only restore the user's controls and are never sent to a server.

**Why access to `www.youtube.com` and `music.youtube.com` is needed**

> Offkey needs access to these two sites to show its widget, identify the playing video, and apply the pitch, speed, vocal and cue controls the user chooses. It does not request access to any other website.

**Remote code**

> No. Offkey does not download or run remote code. Its JavaScript, WebAssembly runtime and vocal-separation model are all packaged with the extension.

**If asked about `wasm-unsafe-eval`**

> The content security policy allows the packaged ONNX Runtime Web WebAssembly module to run the local vocal-separation model. It is not used to fetch or run remote code.

**Data-use checkboxes**

Google asks for data handled on the device too, not only data that's sent somewhere ("even when data is processed or stored locally"), so tick:
- **Web browsing activity**: the saved settings are keyed by YouTube video ID (which videos the user adjusted).
- **Website content**: the audio of the playing video, processed on the device for vocal separation.
- Leave every other category unticked (no personal details, location, communications, etc.).
- Tick all three Limited Use statements: no data is sold, used for advertising or creditworthiness, or transferred to anyone. Nothing leaves the device.

## Reviewer notes

> Offkey works on YouTube and YouTube Music. Open a video, start playback, and click the Offkey toolbar button to open the widget on the page. Change Pitch and Speed, then move Vocals below 100 to hear local vocal separation (the model takes a few seconds to load the first time). Open Cues and click an empty dot to set a cue at the current time; click it again, or press its number (1–5) while the widget is open, to jump back. Vocals are unavailable on videos longer than 20 minutes, and Offkey leaves ads untouched (no skipping or speed changes).
>
> For vocal separation, Offkey keeps parts of the playing audio temporarily in memory and processes them on the device. It never saves the audio to disk, offers no download or export, never uploads it, and never sends it to a third party. That buffer is used only for this feature. The package includes the model and the WebAssembly runtime; no remote code is run.

## Privacy policy

To publish at a stable public address you control (for example `yourportfolio.com/offkey/privacy`), then paste that address into the dashboard. Fill in the contact email first.

> # Offkey Privacy Policy
>
> Last updated: 2 October 2026
>
> Offkey is a Chrome extension that changes how audio plays on YouTube and YouTube Music.
>
> **Audio and page access.** Offkey accesses the currently playing media and its YouTube video ID to provide pitch, speed, vocal reduction and cue controls. Audio is processed on your device and held only in memory: while a YouTube or YouTube Music tab is open, Offkey keeps the current video's audio there (up to about 20 minutes) so vocal separation can start right away. Offkey does not save media files, offer an audio export, upload audio, or share audio with anyone.
>
> **Information stored in Chrome.** Offkey stores pitch, speed, vocal and cue settings for up to 50 recently adjusted videos, keyed by YouTube video ID, with the time each was last changed. It also stores the widget's position and whether its Cues section is open. These stay in Chrome's local extension storage on your device. Chrome's session storage may briefly hold a tab ID so the widget can reopen after the extension is reloaded. None of this is sent to the developer or anyone else.
>
> **Use and sharing.** Offkey uses this information only to provide its features and remember the settings you chose. It does not sell it, use it for advertising, or share it with third parties.
>
> **Retention and deletion.** When more than 50 videos have saved settings, the oldest are removed. You can remove all of Offkey's stored settings by removing the extension. Audio held in memory is discarded as playback moves on and is never kept as a file.
>
> **Changes and contact.** If these practices change, this page will be updated. For privacy questions, contact [contact email].

## Store graphics

- **Store icon:** `icon-128.png` (128×128: 96 px artwork with 16 px of transparent padding). Made from `Icon.svg` by `npm run icons`, which also makes the toolbar icons inside the extension.
- **Screenshots** (1280×800, upload in this order): `screenshot-1.png` (Pitch, Speed, Vocals, Cues on YouTube), `screenshot-2.png` (YouTube Music, settings remembered).
- **Small promo tile** (440×280, required): `Promo tile.png`.

## Dashboard details

- **Category:** Entertainment (alternative: Education, to stress practice).
- **Language:** English.
- **Homepage URL** and **Support URL** (both optional): the Offkey page on your portfolio, once it exists; otherwise leave empty.
- **Mature content:** no.

## References

- [Chrome Web Store: supplying images](https://developer.chrome.com/docs/webstore/images)
- [Chrome Web Store: listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Chrome Web Store: user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store: program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
