# Plan: where things stand

Locked decisions live in `CLAUDE.md`. How we got here (milestones 1–3, measurements, model
comparison, Cues): `docs/history.md`.

## Now: publishing (branch `publishing`)
Getting onto the Chrome Web Store: a distinct name, an icon, the store listing
(`store/listing.md`; checklist in `store/readiness.md`), privacy answers and screenshots. Merge into `main` when Deniz says so.
- The extension is named Offkey (manifest, demo page, docs). Nothing depends on the name: the check
  script finds the widget by extension id.

## Open, after publishing
- **Stage 5: retest the vocals by ear on YouTube** with the test panel (`npm run build:ext:dev`):
  Remember (last 60 s vs this song), While not ready, real jump delays, the glow timing.
- **Before any public release:** bundle the model (as now) or download it on first use.
- DialKit adds ~285 KB to the extension script (~67 KB compressed).
- The handle fade at Vocals 100, and hover/press states.

## Cues, open items
- **Setting cues with the number keys** (idea, not built): a key on an unset cue would set it at the current time (today it shakes), a key on a set cue plays it. Also considered: setting an empty dot on pointer down (not release), and grey numbers shown only while hovering an empty dot.
- **Hold / performance mode** (later): hold a key to play from the cue, release to stop. Pads (`cue-pads.ts`) are its base.
- Pitched takeover measured with a recording probe: seams within ~6 ms at Pitch 0 and +3; at −6 two
  of four readings were ~100 ms off, likely measuring noise, unconfirmed. Check by ear.
- Cues restored from an earlier visit fall back to a plain jump until YouTube has downloaded that part
  (pads are made from what's been downloaded).
- Speed: the video uses the browser's own time-stretch, pads use the pitch library; could sound
  slightly different at the takeover away from 100%.

## Known, not urgent
- **Memory:** "last 60 s" only covers the separated vocals. The song's original audio is kept whole
  (~85 MB per 4 min, `separation/engine.ts`), plus up to 20 MB of YouTube's audio in the page
  (`hook.ts`, the audio tap). The test panel shows both numbers.
- `youtube-source.ts` never forgets old streams (ads, earlier songs); small, grows over a long session.
- The widget's Next button is only re-checked when the track info changes (`content.tsx`); if
  YouTube enables its own next button later, ours may stay dimmed. Not confirmed.
- The two check scripts each start Chrome their own way; could share code.

## Future: other sites (scope properly before building)
Idea: bring Offkey to sites beyond YouTube, starting with SoundCloud. Only researched so far
(2026-10-05); needs a proper look and a plan before any work.
- **SoundCloud first.** Its web player plays an `<audio>` element fed through Media Source (MP3, Opus
  or AAC in short pieces), so Pitch, Speed and Cues should carry over through the `player` interface,
  and the audio tap (`hook.ts`) should mostly work as it is.
- **Rough approach:** a SoundCloud version of the page-specific parts (finding the player, track info,
  prev/next, telling songs apart, ads if any), an AAC/MP3 decoder next to `webm.ts` for Vocals, and
  SoundCloud added to `manifest.json`. SoundCloud uses Web Audio itself (fades), so Offkey would need
  to connect to its audio before SoundCloud does.
- **To check when scoping:** whether premium (Go+) tracks are encrypted (then no Vocals on those),
  SoundCloud's terms, and anything else site-specific.
- **Not planned:** Spotify, Apple Music and similar. Their audio is encrypted, so Vocals can't work as
  built, and Spotify's developer policy bans pitch and speed changes. Capturing a tab's whole sound
  (works on any site) was also considered: no Speed, Vocals only live, and a permission prompt each time.

## Model file
Not in git (`public/models/`). `scripts/fetch-model.mjs` downloads it from Ultimate Vocal Remover's
official release and checks its fingerprint; `npm run build:ext` and `npm run build:demo` run it.
To fetch it by hand: `node scripts/fetch-model.mjs`.
