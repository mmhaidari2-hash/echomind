# Persian — understanding in chat and voice

Mahdi's direction (2026-11-26): EchoMind must understand Persian like
Muse does — in chat and in voice. "میخوام مثل تو فارسی بفهمه چه باچت
چه ویس".

## What "understand" means here — two layers

### Layer 1 — deterministic understanding (works now, no key)
The intent layer (`services/persian.py`, `services/intent.py`) runs
before the LLM on every chat message — typed Persian, typed English,
mixed language, colloquial Persian, and spoken transcripts (voice
input arrives as text through the existing speech hook, so it takes
the same path).

- **Normalisation**: Arabic ي/ك → Persian ی/ک, Persian/Arabic digits →
  Latin digits, ZWNJ stripped for matching, colloquial forms mapped
  (میخوام → می خواهم, میشه → می شود, یادم بنداز → یادآوری کن). The
  original text is kept for display; only matching uses the canonical
  form.
- **Intents** (Persian + English, high confidence): morning brief
  (امروز چی دارم؟), add an obligation (یادم بنداز فردا ...), delegate
  to a project (برو تو پروژه اکومایند ...), confirm (تایید), renewals
  (تمدید), trips (سفرم رو چک کن), Delay Repay, consumer rights,
  promise chase, verify, evidence, greeting.
- **Entities**: relative dates (امروز/فردا/پس‌فردا/۵ روز دیگه/weekday
  names), £ amounts, project name + instruction.
- **Wiring**: `pillars.process_message` runs the intent layer first.
  A high-confidence structured intent is executed deterministically
  and answered in the owner's language — no LLM call, no key. Anything
  else falls through to the existing Gemini/pack path, byte-identical
  to before. `POST /chat/understand` exposes the layer directly.
- **Project names in Persian**: اکومایند → EchoMind, اپ‌سازی →
  appsazi, لانچر → orbit-shell-launcher (alias table in
  `services/projects.py`; transliteration alone does not bridge
  scripts, so aliases are explicit).

### Layer 2 — open-ended understanding (needs Mahdi's Gemini key)
A message with no structured intent still needs a language model to be
understood the way Muse understands it. That is Gemini
(`generate_with_memory` in `services/gemini.py`), gated on
`GEMINI_API_KEY`. Without the key the chat falls back to the fixed
pillar packs. This is the honest boundary: structured Persian works
today; open-ended Persian understanding at Muse's level needs the key.

## Voice

### Speech-to-text (works now, no key)
The app already has `useSpeechRecognition` (Web Speech API, fa-IR /
en-GB). The transcript flows into the composer and is sent as a normal
chat message — so spoken Persian takes the exact same intent path as
typed Persian. No server STT is implemented; the browser's recogniser
is the working path. (Server STT via Google/Azure fa-IR exists as a
fallback option and needs a key.)

### Text-to-speech — the voice options, researched 2026-11-26
| Provider | Persian | What it is | Needs |
|----------|---------|-----------|-------|
| **Gemini-TTS** (pick) | fa-IR in **preview**, 30 voices (Kore, Aoede, Charon, Puck...) | Natural, language auto-detected | Mahdi's Gemini API key — the SAME key as chat |
| **Azure** | Exactly two named neural voices: fa-IR-DilaraNeural (female), fa-IR-FaridNeural (male); SSML; free tier 0.5M chars/month | The most dependable named Persian voices | Azure Speech key + region, plus provider wiring |
| **ElevenLabs v3/v4** | Persian listed (74 languages); most natural in independent tests; paid-leaning | Best raw naturalness | ElevenLabs key, plus provider wiring |
| **Google Cloud TTS** (standard catalog) | **None** — no fa-IR voice in the standard list | Not an option for Persian | — |
| **Device speechSynthesis** (today) | fa-IR if the phone ships one; quality varies | Works with no key | Nothing — this is the fallback |

Sources: Azure language-support table (learn.microsoft.com),
Google Cloud TTS voice list, Gemini-TTS language list, and the
November 2026 Persian-TTS comparisons (zharf.ai, amisus.io,
texttospeechh.com, sonexlabs.com). Voice lineups change — re-check
before committing to one.

### What is implemented
- `services/voice.py`: `voice_readiness()` (providers + selected),
  Gemini-TTS request builder + response parser + `pcm_to_wav`
  (Gemini returns raw PCM; the server wraps it in a WAV header so
  `<audio>` plays it), `synthesize()` that fails closed with a clear
  error when no cloud voice is configured.
- `GET /voice/readiness`, `POST /voice/speak` (returns WAV audio, or
  503 when no cloud voice is configured — no key is ever sent to the
  client).
- `AssistantReply`: tries the server voice first when readiness says
  a cloud voice is configured; any failure (including 503) falls back
  to the device voice. Behaviour with no key is identical to before.
- Frontend clients: `getVoiceReadiness`, `speakText` (blob).

### What is NOT verified
- **No natural voice has been heard.** The Gemini-TTS call is built
  and unit-tested (request shape, response parsing, WAV header) but
  has never run against the live API — there is no key in hand.
  Azure and ElevenLabs are reported in readiness as researched
  alternatives, not implemented. Do not claim a native voice until a
  key is provided and the audio is listened to.

## Known limits
- Jalali month names (فروردین ... اسفند) are NOT converted to dates —
  relative dates and weekday names are supported; Jalali conversion is
  a named next step.
- The deterministic layer covers structured requests only. Sarcasm,
  long multi-turn references ("اون چیزی که گفتم") and open questions
  still need the LLM.
- The intent layer never sends email, money or repo writes. Creating
  a Life Graph obligation or a *proposed* task from chat is a normal
  record write; execution still needs the owner's confirmation.

## Verify
```bash
pytest backend/tests/test_persian.py backend/tests/test_intent_chat.py backend/tests/test_voice.py -q
```
Checks: normalisation (Arabic letters/digits, ZWNJ, colloquial),
language detection, relative dates, money, intent routing in Persian/
English/mixed, delegate parsing, confirm, the chat branch (brief,
obligation add, delegate → propose → confirm, unknown falls through),
readiness with no keys, synthesize failing closed, TTS request shape,
WAV header, speak endpoint 503.
