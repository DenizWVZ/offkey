# History: how the extension was built (milestones 1–3, then Cues)

The old working plan, kept as a record of decisions and measurements. It is **not current**: many
files named here were later removed or renamed (the waveform scrubber, `analyser.ts`, the
center-channel vocal reducer, the model lab `lab.html` and `src/lab/`). For where things stand now,
see `docs/plan.md`.

## Context
Milestone 1 is committed (`6b4f0d6`): the widget matches the Figma mock, floats top left over the YouTube screenshot, and play/pause controls the real MP3 through `src/audio/player.ts`. Milestone 2 turns the static visuals into live ones and makes the controls do something. It follows your order: **scrubber → live visuals → audio controls → interactions → polish.** Each stage is small and gets checked in the browser before the next one. Detailed choices get settled at the start of each stage, not all now.

What we build on:
- `src/audio/player.ts`: play, pause, toggle, seek, setRate and `subscribe`. Seek and setRate already exist and haven't been used yet.
- `src/widget/usePlayerState.ts`: keeps the widget in sync with the player.
- `Scrubber.tsx`: takes a list of bar heights (`levels`) and how far into the track we are (`progress`). `DotSpectrum.tsx` takes `levels` and `active`. `DotSlider.tsx` and `ValueBadge.tsx` take `value`. So the live versions only need to feed these real numbers.
- `tokens.ts`: the `motion` group is empty and waiting for animation values.


## Where we left off
- Milestone 2 (playground, controls, AI vocals) and Milestone 3 stages 1–4 (the extension, see below) are done and pushed. `main` holds that working version, tagged `working-extension-v1`.
- **UI and interaction polish** (branch `ui-polish`, started 2026-09-29) was merged into `main` on 2026-09-29 and tagged `working-extension-v2`. `main` is the single source of truth.
- **Now: publishing to the Chrome Web Store** on the `publishing` branch: name, icon, listing, privacy and screenshots.
- **UI polish, round 1 (2026-09-29), built:** Figma frame 131:19405. Widget 360 wide with new radii and sizes; artwork 96 with no play button; 26-column spectrum; titles fade out. The waveform scrubber is replaced by a thin player bar (handle on hover), times in Geist Mono, and previous / play-pause / next (prev/next use YouTube's and YouTube Music's own buttons). Transpose is renamed Pitch, and its badge widens for two digits. Speed (50–150, 100 in the middle) and Vocals are DialKit sliders. The Vocals loader is now a pulsing gradient glow. Checked in the playground and on YouTube (fonts, styles, next, previous).
  - Ads (fixed the same day): scrubbing could skip an ad and Speed could speed one up. Now the player ignores seek and speed during ads and plays them in their own key. The bar keeps showing the ad's progress, dimmed, and the Pitch, Speed and Vocals rows fade their contents. Checked on YouTube during a real ad (the key change is not yet checked by ear).
  - Also: long titles scroll in a loop with rests; header spacing (14 px, then 16 px between panels) and a 23 × 23 logo, as in Figma.
  - Glow rebuilt from `References/Gradient references/` (Siri edge glow): an edge mask with an eased falloff plus drifting gradient layers, plain CSS, only transform/opacity animated. The test panel has live Glow controls (`GlowControls.tsx`, via `src/widget/tuning.ts`). Deniz tuned the values, and they're in `tokens.ts`. The Vocals slider has no tick marks.
  - Cleanups: tabs left open during an extension reload no longer log "Extension context invalidated" (storage calls skip when the widget script is cut off, `src/extension/storage.ts`). Vocals memory now keeps only the last 60 s behind the playhead (~20 MB cap) instead of the whole song.
  - Public demo page for sharing (`demo.html`, `src/demo/`): visitors pick an audio file from their own computer (no song is hosted), with a neutral backdrop. `npm run build:demo` → `dist-demo/` (55 MB, only the UVR 1 model). Built without cross-origin isolation headers, because with them the built AI engine hung while loading.
  - Open: DialKit adds ~285 KB to the extension script (~67 KB compressed). The handle fade at Vocals 100, and hover/press states.
- **Then: Milestone 3 stage 5,** retesting the vocals by ear on YouTube.
- **Model licence (checked 2026-09-29):** UVR 1 comes from Ultimate Vocal Remover (MIT), which asks apps using its models to credit UVR and its developers. Credited in `src/extension/NOTICES.txt` (copied into every build) and in the store description (`docs/store-listing.md`). Our file is identical to UVR's official download (SHA-256 below).
- **Model files** aren't in git (`public/models/`). After a fresh clone:
  ```
  mkdir -p public/models && cd public/models
  # The widget's model, from Ultimate Vocal Remover's official download:
  curl -LO https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR_MDXNET_1_9703.onnx
  shasum -a 256 UVR_MDXNET_1_9703.onnx  # should be 229ad3bb96a037e89d8ed86732d6d3675856e6a07c3e3f02896eac01ec7ee4be
  # lab only:
  curl -LO https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/Kim_Vocal_2.onnx
  curl -LO https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx
  ```

## Stage 1: Scrubber (fills in as played, and seeking) ✅ done
Target: `References/Scrubber ver 2.png`. Because the fill-in needs the audio analyser, the waveform part of the old stage 2 moves into this stage.
- **Audio side, `src/audio/analyser.ts`:** connects a browser audio analyser to the same audio element. It's the approach extensions use on YouTube's video. It starts on the first click on play, because browsers only allow audio processing after a click. It also keeps a loudness history: the track is split into 81 slices, one per bar, about 2.7s each, and while a slice plays its loudness is recorded. The player exposes that history, so the UI still only reads numbers.
- **Fixed loudness scale:** bar heights use a fixed scale, not "relative to the loudest part so far". That way bars never shrink when a louder part comes along.
- **How it looks (your pick):**
  - Heard and behind the playhead: dark bars.
  - Heard but ahead of the playhead (after going back): light gray bars, like the first mock.
  - Never heard: dots, dark behind the playhead and light ahead.
  - The playhead: orange.
- **Playhead follows playback:** progress = current time ÷ track length.
- **Seeking:** click anywhere on the scrubber to jump there, or drag to scrub. The drag keeps working if the pointer leaves the panel. While dragging, the playhead follows the pointer and the song jumps when you let go, which avoids stuttery audio mid-drag.
- `Scrubber.tsx` gets per-bar "heard or not" information alongside the heights. The mock data is removed.
- Check: in the paused state before playing, the scrubber is all dots with the playhead at the start. Clicking to seek moves the playhead. You confirm the fill-in by eye and ear.

## Stage 2: Live spectrum ✅ done
- Reuses the analyser from stage 1. 25 frequency bands (low to high) mapped to 1–6 dots, updated every frame with a short fall-off so it doesn't flicker. Paused = the gray single row, as it is now.
- Check: by ear and eye (see Verification).

## Later, not in this milestone: a full waveform upfront (like SoundCloud)
- Not possible in general for streamed audio: YouTube only downloads a little ahead of what's playing.
- Realistic paths later: remember the waveform per video once heard, so replays and loops show it complete, and maybe decode the whole file on sites that serve plain audio files.
- The scrubber takes a full list of bar heights either way, so that would be an audio-side change only.

## Stage 3: Audio controls ✅ done
- **Pitch row:** removed. There are two controls, Transpose and Speed.
- **Transpose:** ±7 semitones, one per dot. The pitch shifting is real, done by Signalsmith Stretch (MIT) in `src/audio/graph.ts`. It delays the sound by about 0.12s.
- **Speed:** ±35% in 5% steps, and the badge shows the change, e.g. "−15". The browser keeps the key the same.
- **Input:** click a dot, use ← → when focused, and click the badge to reset. Hover, drag and animation are stage 4.

## Stage 4: Interactions ✅ done
- Dot slider behavior from `Controls interaction.png`: hover turns dots into pills, press lengthens the center, drag fills orange with the current step tallest, release returns to dots. Keyboard arrows also work.
- **Sizes (measured from the reference):** dot 4×4, pill 4×10, tall pill about 4×20, centered.
- **Decided:**
  - Sound changes live at every step while dragging.
  - Pressing anywhere jumps to that step, and you can keep dragging from there.
  - Springs use the Motion library, approved as a new dependency.
  - On hover, the dots become pills in a quick ripple out from the center, with the delay set by a token.
- **Defaults (can change):**
  - Only the dot strip reacts to hover, not the label or badge.
  - Keyboard focus shows the pill state.
  - Touch presses go straight to the pressed state.
  - The badge fades gray ↔ orange.
  - Reduced motion makes the changes instant.
- **Code:** mostly `DotSlider.tsx` and its CSS. Tokens go in `size.pill*` and `motion.*`. The check script gets hover, press and release steps.

## Vocals, step A: slider + center-channel reduction ✅ done
Added to the scope on 2026-09-28. Reference: the Vocals row of `References/Vocals slider.png` (the rest of that mock isn't a reference).
- **Sound:** element → vocal reducer → pitch shifter → analyser. The reducer (`src/audio/vocal-reducer.worklet.ts`, no library) cuts the sound into short slices and turns down what's identical in left and right, only between about 150 Hz and 8 kHz, so bass and kick stay. It adds about 0.035s of delay. Tuning constants are at the top of the file.
- **Limits:** reverb and wide backing vocals survive, and centered instruments like the snare dip too. Mono songs can't be separated, so the row dims and shows "–".
- **Slider:** 0–100, where 100 is the song as released. Press to jump, drag to change it live, ← → for ±1 (Shift for ±10), Home/End for 0/100. Click the number to reset to 100. The fill springs on jumps and follows the pointer exactly while dragging. The full fill stops just before the number.
- **Measured:** on the same passage at 0, the voice-range spectrum bands dropped from about 0.3 to 0.05, and the bass stayed the same.

## Vocals, step B: AI separation (in progress)
Step A sounded muffled, not like an instrumental, so we're testing AI models. They run on the user's computer, are downloaded once on first use, and cost nothing per use.

**B0. YouTube check ✅ (2026-09-28):** a script that starts before YouTube's code can copy the audio YouTube downloads (Opus, stereo, 44.1 kHz) and decode it. YouTube held **30–40 s of audio ahead** of the playhead. So separating ahead of playback, with no delay, looks possible in the extension (as a content script that runs at page start).

**B1. Model lab ✅:** `lab.html` (dev only). Model files go in `public/models/` (git-ignored). Uses `onnxruntime-web`.
Time the AI model took to separate **30 s** of Melatonin on an M3 Pro (lower is better; under 30 s = faster than playback):

| Model | Download | Graphics chip | Processor, 11 cores | Processor, 2 cores (≈ weak laptop) |
|---|---|---|---|---|
| MDX-Net Kim Vocal 2 (community) | 67 MB | 4.0 s | 20.8 s | 49.4 s (too slow) |
| MDX-Net UVR 1 (older, lighter) | 30 MB | 1.2 s | 7.6 s | 15.0 s |
| HTDemucs v4 (Meta, MIT) | 181 MB | 4.5 s | 13.1 s | 24.2 s |

- **Model time only:** the table leaves out my frequency-conversion code (`src/lab/fft.ts`). It runs slower in a background tab; in the extension it would go on a separate background thread or the graphics chip.
- **Budget Chromebook guess:** its cores are roughly 2–4× slower than these M3 cores. UVR 1 would be around playback speed, and the other two too slow without a graphics chip that supports WebGPU. A newer "Chromebook Plus" with WebGPU is probably fine.
- **Next:** Deniz listens in the lab and picks the sound, then B2 (integration) is planned around that model.

**B2. In the widget ✅ (2026-09-28):** the picked model is UVR 1.
- **How it runs:** a background worker (`src/audio/separation/`) separates about 6 s segments ahead of the playhead. They play through a second Signalsmith node, so speed, key and sync all work.
- **Test switches:** the playground feeds the audio in pieces like YouTube (`src/playground/stream-simulator.ts`). A test panel next to the widget has switches for memory, while-not-ready behaviour, network and computer speed.
- **Measured (M3 Pro):**
  - first use: 1.2 s (includes loading the model)
  - jump to an unheard part: about 1.6 s
  - jump back: instant when remembering this song, about 0.7 s when remembering nothing
  - 4× slower computer: still 3.4× faster than playback
- **Library fix:** Signalsmith 1.3.2 crashes when playing across buffer boundaries. `scripts/patch-signalsmith.mjs` fixes it (runs after `npm install`).
- **Memory:** about 80 MB for a whole 4-min song while it's open (could be halved later).
- **Decided:** while not ready, keep playing and fade the vocals down when ready. A small loader (ring of dots) next to the Vocals label shows while it's working. It's rough for now and gets polished later.
- **Memory:** Deniz couldn't hear a difference between "Nothing" and "This song" in the playground.
- **Retest once it's an extension on real YouTube:** memory (Nothing vs This song), the while-not-ready behaviour, real jump delays, and the loader timing.

## Milestone 3: the widget as a Chrome extension (YouTube + YouTube Music)
Opened and closed with the toolbar icon. Four parts: an **audio copier** that runs inside YouTube's page from the start (copies the audio YouTube downloads, from B0), the **widget script** (finds the video, wraps it in a Player, shows the widget in a shadow root), the **toolbar button** (background), and a hidden **vocals frame** owned by the extension that runs the AI model, since YouTube's security rules block background threads.
- **Build:** `npm run build:ext` (or `npm run dev:ext` to rebuild on save) → `dist-extension/`. Load it once in `chrome://extensions` (Developer mode → Load unpacked). After a rebuild, press reload on the extension and refresh the tab. Build script: `scripts/build-extension.mjs`.
- **Placement:** top left like the playground, draggable by anything that isn't a control, and the position is remembered.
- **Sound processing starts** the first time the page allows audio (opening or touching the widget, if YouTube has already been clicked). Before that, YouTube plays untouched, because once a video is routed through our processing there's no way back.

Stages, each checked on real YouTube before the next:
1. **Shell + Transpose and Speed** ✅ built. The pitch library loads its audio code from the extension (YouTube blocks its default way).
2. **Track info and moving between videos** ✅ built. Title, artist and artwork come from the browser's "now playing" info. A new video clears the waveform, and the spectrum goes gray while nothing is audible. Transpose and Speed glide back to 0 one step at a time (`motion.glideStepMs`); the badge reset glides too, while slider clicks and drags stay instant. The last 50 songs' settings are remembered (`src/extension/song-settings.ts`) and come back when you return to a song.
   - **Ads** don't add to the waveform. Transpose applies during ads, but speed doesn't: YouTube loads each ad and song as a new source, which silently resets the speed. So each song's intended speed is kept, and put back whenever the song itself plays. Speed changes you make (widget or YouTube's menu) count; YouTube's silent resets don't.
3. **YouTube's audio → vocal separation** ✅ built.
   - **Audio copier** (`src/extension/hook.ts`): runs in YouTube's page from the start and keeps copies of the audio YouTube adds to its Media Source (up to ~40 MB). It hands them over when the widget script asks.
   - **Reader** (`webm.ts`, `youtube-source.ts`): reads whole clusters out of the pieces and decodes them to 44.1 kHz. Each batch is decoded together with the cluster before it, and then lined up with the previous batch by matching their sound, because decoding trims a few unpredictable milliseconds. Without that, 10 ms gaps showed up every 10 s.
   - **Songs vs ads:** each song and ad is its own stream. A stream is judged 1 s after it starts playing (YouTube changes the address and the source in either order), and ads' audio is dropped. MP4 audio (some ads) is skipped.
   - Videos over 20 minutes get no vocals, since the whole song is kept in memory (~85 MB per 4 minutes).
   - **Measured on real YouTube:** about 34–38 s of audio ready ahead of the playhead, and after a jump to 2:00 the audio there arrived within a few seconds. Correctly passed on after an ad.
4. **The AI model in the vocals frame** ✅ built. `frame-separator.ts` adds a hidden extension page (`separator.html`) to YouTube's page and talks to it through a message channel. The frame runs the same `worker.ts` as the playground. The separation engine takes any "separator" with the worker's messages (`startSeparator` in the player options). The model is bundled in the extension, copied from `public/models/` at build time. The extension needs `'wasm-unsafe-eval'` for the model engine.
   - **Measured on real YouTube (M3 Pro, invisible Chrome):** runs on the graphics chip, 10.5× faster than playback, about 32–38 s separated ahead, and the sound switches to the separated route.
   - **Fixed after Deniz's listening check:** the separated sound now follows the video's volume and mute (YouTube's loudness normalisation and volume slider had made 100 → 99 jump louder). It only plays while the video is playing the song, which is judged by YouTube's ad marker and by the length matching; an ad after a song had played the song's separated audio from 0:00. The loader is hidden at the song's end.
   - **No flicker after a jump:** the sound switches to separated only once 10 s is ready ahead (`READY_AHEAD_TO_SWITCH_SECONDS` in `graph.ts`). Before, it switched as soon as the first bit was ready, then fell back for a moment while YouTube's next piece arrived. Measured on YouTube: one switch about 2.2 s after a jump (was 1.4 s, followed by a flicker).
   - **Test panel:** `npm run build:ext:dev` builds with the vocals test panel under the widget (no Network switch; YouTube is the network).
- **Opening after an extension reload** (fixed 2026-09-29): a YouTube tab that was open during a reload or update keeps the old widget script, cut off from the extension, and it can't be restarted in place. Re-injecting it just returned the old copy, and the video's sound may already be routed through it. Now, when no widget script answers the click on a YouTube tab, the tab refreshes itself and the widget opens once it has loaded (`background.ts`). Reproduced and checked with `npm run check:ext -- <video> toggle reload-extension toggle`.
- **Header:** star logo on the left and a close button (×) on the right, from `References/Header reference (logo + close button).png`. Close hides the widget like the toolbar button; the header also works as a drag handle. Hover/pressed states come with the Figma pass.
5. **Retest the vocals notes** (memory, while-not-ready, jump delays, loader) on real YouTube.

Not in this milestone: visual polish, other sites, full screen, store publishing, bundled vs downloaded model (bundled for now).

## Cues (2026-09-30 – 10-01, on `publishing`) ✅ built
Five cue points per song, set from a collapsible Cues row (designs: `References/Cues.png`,
`References/Cue buttons interactions and states.png`), shown as coloured markers on the player bar,
played with keys 1–5.
- **Keys** (`src/widget/useCueKeys.ts`): only while the widget is open; ignored while typing, with
  modifiers, or during ads. Checked on youtube.com that YouTube's own 1–9 shortcuts (jump to 10–90%)
  run after ours, so 1–5 can be kept from the page without a page-start script.
- **Delay on a press, and the fixes:**
  - The pitch shifter delayed all sound by 0.12 s, even at Pitch 0. It's now skipped at Pitch 0.
  - **Cue pads** (`src/audio/cue-pads.ts`): 4 s from each cue, prepared ahead in the current key and
    speed from the song copy vocal separation keeps. A key plays the pad at once; the video jumps
    behind it, silenced, and takes over with a ~30 ms crossfade once it plays the same moment.
  - Cues are stored where the sound heard was, not at the video's reported time, which runs ahead by
    Chrome's buffering (~24 ms), the shifter (0.12 s when pitched) and the speakers' delay. 20 ms
    earlier still, to catch the start of the beat.
- **Measured** (recording the output and matching it against the song, and clicks through the pitch
  library): pads land within ~1 ms at any key and speed; takeover seams within ~6 ms at Pitch 0 and +3.
  Lesson from getting stuck here: two measurements made against pitch-shifted copies were biased
  (a 93 ms "shifter delay", a ±37 ms "speed shift"); clicks showed the library's own numbers were right.
  A "listen and match" alignment step was built and then removed as unnecessary.
- **Vocals around cues:** separation prepares the 16 s after each cue, before the rest of the look-ahead.
  Fixed: a cue set right after a jump was never prepared (its first chunk's audio was incomplete), and
  one unpreparable pad blocked the others.
- **Vocals below 100 raised the pitch** (fixed, was a suspected bug): separated audio is 44.1 kHz but the
  sound engine ran at the device's 48 kHz, so it played ~1.5 semitones high. The engine now runs at 44.1 kHz.
- **Widget fixes found along the way:** markers measured the bar before the widget's styles loaded on
  YouTube and sat ~5× too far right (now placed in %); clicks left focus on buttons, so a cue key made
  Chrome show the focus ring and Space pressed the button (focus is now released after pointer presses);
  YouTube's view transitions drew its player above the widget when changing videos (the widget now has
  its own `view-transition-name`); the Cues row dims fully during ads, with a grey caret.
- **Click plays, hold resets (2026-10-01):** clicking a coloured dot felt like it should use the cue, not
  clear it. Now a click on a set dot plays it (same as its key); holding it ~0.55 s clears it: a light halo
  shows the dot's full size while the colour and number shrink inside, then a quick pop, then the grey dot
  settles in. Letting go early grows it back, and doesn't play the cue once the shrinking has started (a
  plain tap still plays). Tapping the grey dot right after a reset sets a cue at once. Reference:
  `Cue buttons interactions and states (updated).png`.
- **Tuning the animation:** the test panel (`?test`) has a "Cue dots" section with the hold, halo, pop and
  grey-dot values per dot (1–5), to compare side by side; "Copy values" gives the `tokens.ts` lines
  (`src/playground/CueControls.tsx`, `useCueParams` in `src/widget/tuning.ts`). Deniz tuned the values by
  eye and they're now the tokens. The rest of the test panel (vocals switches, Glow) is hidden by
  `CUES_ONLY` in `TestPanel.tsx`; set it to `false` to bring it back.

## Stage 5: Polish
- Play button states: playing, paused, and hover for each.
- Animated switch between playing and paused (spectrum and icon). Fill in the `motion` tokens.
- Experiment: stepped / retro spectrum. Set `motion.spectrumStepMs` to ~80 in `tokens.ts` and compare with the smooth version.

## Working notes
- **Suggested model per stage:** Opus at high effort for stages 1 and 3 (audio analysis, trade-offs, harder debugging). Sonnet at medium for stages 2, 4 and 5: the spectrum reuses stage 1's analyser, and the rest is well specified by your mocks.

## Verification
- After each stage: `npm run build` passes; I check the page in Chrome (screenshots, console errors) and compare against the mocks.
- Known limit: the Chrome tab I control reports itself as hidden, so audio doesn't load there. For anything that needs sound moving (the playhead following playback, live spectrum, waveform fill-in), I'll check the parts I can: layout, clicking to seek, paused states, no errors. You confirm the live behavior by eye and ear.
- Commit only when you say so.
