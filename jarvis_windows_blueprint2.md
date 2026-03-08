# JARVIS for Windows 11 — production blueprint

## 1) Product target
A desktop AI companion for Windows 11 that:
- responds to the wake word “Jarvis” / “Hey Jarvis”
- addresses the user as “Mr. Stark”
- supports low-latency speech-to-speech conversation
- can search the web and cite sources in the UI
- renders a cinematic overlay HUD with waveform animation
- supports interruption, quick follow-up, and screen-aware help
- stores secrets locally and never exposes the long-lived OpenAI API key to the webview

## 2) Recommended stack
### Core stack
- **Tauri 2** for Windows desktop shell
- **Rust** for secure backend, window control, local tooling, key storage, orchestration
- **TypeScript + React + Vite** for UI and state management
- **Canvas 2D / Web Audio API** for waveform visualization
- **OpenAI Realtime API (WebRTC)** for voice conversation
- **OpenAI Responses API** for web search and deep tool-backed responses
- **SQLite** for local memory/profile/preferences
- **Porcupine** for local wake-word detection

### Why this stack
- Rust keeps key handling and OS integrations out of the renderer.
- Tauri gives a native desktop app with Windows integration, tray, global shortcuts, transparent windows, always-on-top, and click-through behavior.
- React/Vite makes it easy to build a cinematic UI fast.
- WebRTC gives lower-latency and cleaner audio handling than a raw WebSocket voice stack for this use case.

## 3) Product modes
### A. Idle mode
Small orb / mask fragment in a corner.
- click-through
- always-on-top
- low-opacity ambient animation
- microphone/wake-word status hint

### B. Listening mode
Triggered by wake word or hotkey.
- overlay expands
- input meter visible
- caption: “Listening, Mr. Stark.”
- subtitle transcript appears under the mask

### C. Speaking mode
Jarvis answers.
- central HUD appears
- waveform animates from real playback audio
- short spoken answer
- optional detailed text panel
- source cards if web search was used

### D. Action mode
Used for web search, screen analysis, or local tools.
- temporary scanning animation
- small “searching / analyzing” state badge
- answer returns in either speaking or summary mode

## 4) Main windows
### 1. `overlay`
The cinematic HUD.
- transparent look
- frameless
- always-on-top
- can toggle click-through
- no taskbar icon

### 2. `settings`
Regular configuration window.
- OpenAI key
- voice choice
- wake word sensitivity
- startup behavior
- permissions
- debug toggles

### 3. `debug-console`
Only for dev builds.
- Realtime events
- tool calls
- VAD state
- reconnect state
- audio device diagnostics

## 5) High-level architecture
```text
[Overlay UI / Settings UI]  (React + TS)
          |
          | Tauri IPC
          v
[Rust core]
- secure key storage
- session init for Realtime
- tool broker
- local memory store
- wake-word process manager
- tray / shortcuts / permissions
          |
    +-----+----------------+
    |                      |
    v                      v
[OpenAI Realtime]   [OpenAI Responses + tools]
```

## 6) Core modules
### `src-tauri/src/app_state.rs`
Global application state:
- current session status
- selected voice
- active overlay mode
- current device IDs
- user profile handle (“Mr. Stark”)

### `src-tauri/src/secrets.rs`
- save / load OpenAI key via Windows Credential Manager
- validate key format
- never send raw key to frontend

### `src-tauri/src/realtime_session.rs`
- receives SDP offer from UI
- creates Realtime session against `/v1/realtime/calls`
- injects base session config
- returns SDP answer
- handles session restart and recovery

### `src-tauri/src/tools/mod.rs`
Broker for safe tools:
- `search_web`
- `save_memory`
- `read_memory`
- `capture_screen_once`
- `open_url`
- later: `launch_app`, `read_clipboard`, `summarize_selection`

### `src-tauri/src/wakeword.rs`
- local always-listening wake word engine
- event → `WakeWordDetected`
- temporary cooldown after trigger
- optional speaker lock later

### `src-tauri/src/db.rs`
SQLite store:
- profile
- preferences
- memory facts
- recent summaries
- conversation bookmarks

### `src/lib/realtime/*`
Frontend Realtime helpers:
- RTCPeerConnection setup
- remote audio playback
- datachannel events
- session.update events
- transcript and item state

### `src/lib/audio/*`
- getUserMedia
- input meter
- playback analyser
- waveform extraction
- audio device switching

### `src/components/overlay/*`
- Orb
- MaskHUD
- Waveform
- SubtitleStrip
- SourceCards
- StatusBadges

## 7) Realtime flow
### Session creation
1. UI creates local `RTCPeerConnection`.
2. UI creates SDP offer.
3. UI sends offer to Rust via Tauri command.
4. Rust reads API key from secure store.
5. Rust posts multipart request to OpenAI Realtime unified endpoint.
6. Rust returns SDP answer to UI.
7. UI sets remote description.
8. UI starts audio + datachannel event loop.

### Conversation loop
1. Microphone audio flows to Realtime over WebRTC.
2. Realtime VAD detects speech start/stop.
3. UI changes visual state to `listening` / `thinking` / `speaking`.
4. Jarvis audio arrives from remote track.
5. UI pipes remote stream to `<audio>` and to Web Audio analyser.
6. Waveform is driven by real amplitude/time-domain data.

### Tool loop
1. User asks: “Jarvis, search the web…”
2. Model emits function call.
3. Frontend forwards function request to Rust tool broker.
4. Rust executes allowed tool.
5. Tool output is added back into the conversation.
6. Model speaks concise result and UI shows source cards.

## 8) OpenAI integration split
### Use Realtime API for
- speech-to-speech chat
- interruptions / barge-in
- persona and conversational presence
- image-aware quick screen help if needed

### Use Responses API for
- web search
- heavier reasoning
- multi-step tool usage
- sourced answers in a carded UI

This split keeps the voice interaction fast while offloading deeper research/tool work to the API designed for that pattern.

## 9) Session config shape
Recommended session defaults:
- model: `gpt-realtime`
- voice: pick 1 and keep it stable for brand identity
- turn detection: start with `server_vad`
- `interrupt_response: true`
- input + output text enabled for subtitles and captions
- tools registered at session level for predictable behavior

Suggested evolution:
- MVP: `server_vad`
- v1.1 natural mode: `semantic_vad`
- v1.2 add push-to-talk fallback

## 10) Persona spec
### Voice / identity rules
- Name: Jarvis.
- Address the user as “Mr. Stark”.
- Calm, precise, elegant, lightly witty.
- Never overdo the nickname.
- Spoken answers should be brief unless asked for detail.
- On-screen text may be more detailed than spoken audio.

### Behavior rules
- If a request needs current information, use web search.
- If a local system action might be risky, ask for confirmation.
- Never pretend to see the screen unless screenshot mode was explicitly enabled.
- Never claim persistent memory unless the fact was saved locally.
- Prefer: concise voice + rich overlay cards.

### Example system prompt
```text
You are Jarvis, a refined real-time desktop AI assistant for Windows 11.
You address the user as “Mr. Stark” naturally, not excessively.
Your speaking style is concise, calm, helpful, and technically competent.
When live voice mode is active, keep spoken answers short and elegant.
When tools are available, use them rather than guessing.
When current facts are needed, use web search.
When a system action is sensitive, ask permission first.
Never invent capabilities you do not actually have.
```

## 11) Wake word strategy
### Recommended for v1
- primary phrase: “Hey Jarvis”
- optional cinematic alias: “Jarvis”
- global hotkey fallback: `Ctrl+Alt+Space`

### Why
Single-word wake phrases look cool but are more error-prone in real rooms, media playback, and meetings. Using “Hey Jarvis” as the reliable default and exposing plain “Jarvis” as an optional mode is the safest product choice.

## 12) Waveform strategy
Do not fake the waveform from text.
Use actual playback audio:
- remote WebRTC audio stream → audio element
- same stream → Web Audio analyser
- analyser → time-domain and RMS extraction
- renderer → animated side waves / arcs / pulse rings

Visual recommendation:
- cyan main line
- amber secondary accent line
- soft bloom/glow
- subtle asymmetry for a more “alive” feel

## 13) Search UX
When Jarvis uses web search:
- show `SEARCHING…` badge
- keep voice short
- show 3–5 source cards in overlay
- clicking a source opens default browser
- keep spoken summary to 1–3 sentences

Example:
“Mr. Stark, I found three relevant results. The latest guidance suggests …”

## 14) Screen-aware mode
### Safe approach
Do not continuously watch the screen in v1.
Instead:
- hotkey or voice phrase: “Jarvis, analyze my screen”
- app captures a single screenshot after consent
- screenshot is sent as image input
- Jarvis answers about what is visible

This feels powerful without creating a creepy background surveillance vibe.

## 15) Memory model
### Local memory categories
- name / title preference
- recurring preferences
- frequently used apps/sites
- recent project summaries
- saved facts explicitly approved by the user

### What not to store automatically
- raw full transcripts forever
- secrets copied from screen
- passwords / tokens
- financial or medical data without explicit opt-in

## 16) Security model
### Hard rules
- long-lived OpenAI key is stored only in secure native storage
- renderer never receives the raw key
- all dangerous tools are backend-only
- overlay window gets the minimum possible permissions
- settings window gets broader permissions
- tool execution is allowlisted

### Tool confirmation policy
Require confirmation for:
- launching installers
- deleting files
- sending data externally
- clipboard reads in background
- running shell commands

## 17) Windows 11 specifics
### Good fits
- system tray app
- autostart option
- global hotkey
- transparent always-on-top overlay
- WebView2-backed HUD through Tauri

### Practical caveats
- transparent overlays can look different across GPU / display setups
- microphone permission / exclusive device modes can fail on some systems
- audio feedback loops are common without echo cancellation and good defaults
- gaming overlays and capture software may conflict with always-on-top windows

## 18) Performance targets
- wake word idle CPU: low enough to stay unobtrusive
- overlay render: smooth at 60 FPS on normal hardware
- voice response feel: “instant enough” after speech stop
- reconnect should preserve persona and recent context summary

## 19) Recommended repo structure
```text
jarvis/
  src/
    app/
      routes/
      store/
      commands/
    components/
      overlay/
      settings/
      shared/
    lib/
      realtime/
      audio/
      waveform/
      ui/
      types/
  src-tauri/
    src/
      main.rs
      lib.rs
      app_state.rs
      secrets.rs
      realtime_session.rs
      wakeword.rs
      db.rs
      tools/
        mod.rs
        search_web.rs
        memory.rs
        screen_capture.rs
        open_url.rs
    capabilities/
      overlay.json
      settings.json
      debug.json
  assets/
    tray/
    hud/
    sounds/
  docs/
    prompts/
    architecture/
```

## 20) Suggested first milestones
### Milestone 1 — foundation
- settings window
- save API key securely
- test Realtime voice session
- subtitles
- basic orb overlay

### Milestone 2 — Jarvis feel
- persona prompt
- hotkey activation
- waveform from real audio
- always-on-top overlay states
- tray app

### Milestone 3 — hands-free
- wake word
- reconnect handling
- source cards
- web search tool

### Milestone 4 — wow mode
- screenshot analysis
- memory save/recall
- polished sound design
- refined animation language

## 21) Recommended MVP scope
For a truly usable first version, build exactly this and stop:
1. Windows 11 only
2. Tauri + Rust + React
3. Realtime speech-to-speech
4. secure API key storage
5. hotkey activation
6. 3 overlay states
7. real waveform visualization
8. `search_web` tool
9. source cards
10. optional single-shot screen analysis

Skip for MVP:
- full autonomous computer control
- dozens of plugins
- proactive interruptions
- continuous screen watching
- full offline STT/TTS stack

## 22) Design direction options
### A — Center mask + side waveforms
Best if you want the cleanest “movie assistant” impression.
- strong center identity
- symmetric layout
- simplest to read

### B — Circular reactor/helmet core HUD
Best if you want the most iconic, techy interface.
- strong focal center
- excellent for speaking mode
- feels premium

### C — Cinematic targeting layout
Best if you want something dramatic and less chat-like.
- strong sci-fi vibe
- more tactical / scanning feel
- ideal for analysis mode

## 23) My recommendation
For the actual product:
- **Idle**: small orb, not the full helmet
- **Listening**: variant A
- **Speaking**: variant B
- **Analyze/Search**: variant C

That gives you one coherent visual language without forcing the user to stare at a full mask all day.
