
# JARVIS for Windows 11 — production blueprint

## 1) Product goal

Сделать desktop-assistant под Windows 11, который:
- живет как системное приложение
- отзывается на wake word "Джарвис"
- ведет живой голосовой диалог через OpenAI Realtime
- обращается к пользователю как "Mr. Stark"
- показывает cinematic overlay поверх экрана
- рисует живую звуковую волну по реальному аудиовыходу модели
- умеет искать в интернете и аккуратно показывать источники
- выглядит как AI-presence layer, а не как обычный чат

---

## 2) Финальный стек

### Core shell
- **Tauri 2**
- **Rust** для native-core, secure storage, OS integration, permission boundary
- **TypeScript + React + Vite** для UI / overlay / settings
- **WebRTC** для Realtime voice transport
- **Web Audio API** для waveform / meters / FFT
- **SQLite** для local memory / preferences / audit log
- **Windows Credential Manager** через Rust `keyring` для хранения OpenAI API key
- **Porcupine** как локальный wake word engine
- **Опционально Eagle** для speaker verification

### Почему это лучший выбор
- Нативный контроль над окнами, tray, shortcuts, key storage и автостартом
- Быстрый и красивый HUD-рендер через webview
- Хорошая архитектура безопасности: renderer не держит основной API key
- Потом можно перенести на macOS/Linux, но сейчас ничего не мешает сделать Windows-first

---

## 3) Что НЕ делать в V1

Не делать в первой версии:
- полностью автономный agent с доступом ко всему компьютеру
- постоянный пассивный анализ экрана без явного разрешения
- сложный plugin marketplace
- deep OS automation без confirm step
- cloud account system / sync / multi-device

V1 должен быть:
- быстрым
- стабильным
- визуально сильным
- безопасным
- очень приятным в голосовом общении

---

## 4) Архитектура приложения

```text
apps/desktop
├─ src/
│  ├─ app/
│  │  ├─ providers/
│  │  ├─ router/
│  │  └─ store/
│  ├─ features/
│  │  ├─ overlay/
│  │  │  ├─ components/
│  │  │  ├─ hooks/
│  │  │  ├─ canvas/
│  │  │  └─ states/
│  │  ├─ voice/
│  │  ├─ settings/
│  │  ├─ search/
│  │  ├─ memory/
│  │  └─ subtitles/
│  ├─ services/
│  │  ├─ rtc/
│  │  ├─ audio/
│  │  ├─ tauri/
│  │  └─ telemetry/
│  ├─ styles/
│  └─ main.tsx
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ commands/
│  │  │  ├─ auth.rs
│  │  │  ├─ realtime.rs
│  │  │  ├─ settings.rs
│  │  │  ├─ search.rs
│  │  │  ├─ memory.rs
│  │  │  ├─ wakeword.rs
│  │  │  ├─ windows.rs
│  │  │  └─ tools.rs
│  │  ├─ core/
│  │  │  ├─ session_manager.rs
│  │  │  ├─ tool_router.rs
│  │  │  ├─ key_store.rs
│  │  │  ├─ config.rs
│  │  │  └─ event_bus.rs
│  │  ├─ infra/
│  │  │  ├─ keyring_store.rs
│  │  │  ├─ sqlite.rs
│  │  │  ├─ updater.rs
│  │  │  └─ autostart.rs
│  │  └─ models/
│  ├─ capabilities/
│  │  ├─ overlay.json
│  │  └─ settings.json
│  ├─ icons/
│  └─ tauri.conf.json
└─ package.json
```

---

## 5) Окна и режимы

### Window 1 — overlay
Назначение:
- transparent
- always-on-top
- skip taskbar
- click-through в idle режиме
- краткие состояния: listening / thinking / speaking / error

Overlay должен быть отдельным окном, а не тем же окном, что settings.

### Window 2 — settings
Назначение:
- вставка API key
- выбор микрофона / выхода
- тест wake word
- тест голоса
- переключение тем
- debug pane
- управление памятью
- safe-mode / push-to-talk

### Window 3 — optional debug console
Только dev-build:
- сырые realtime events
- tool calls
- VAD state
- network / reconnect
- device switching

---

## 6) UI state machine

### Idle
- маленький reactor/orb или компактный HUD
- минимум отвлечения
- click-through
- слабая анимация дыхания

### Wake
- услышал "Джарвис"
- короткий flash / chime
- orb раскрывается

### Listening
- входной audio meter
- короткая подпись "Listening..."
- субтитры речи пользователя
- если long pause — gentle nudge

### Thinking
- не должна быть долгая "мертвая тишина"
- мягкая scan-анимация
- фраза уровня "One moment, Mr. Stark"

### Speaking
- центральная маска / HUD
- живая wave по реальному output audio
- краткий spoken answer
- длинный текст — в subtitles / cards

### Tool mode
- "Searching"
- "Analyzing screen"
- "Opening app"
- "Checking notes"

### Error / fallback
- network lost
- mic unavailable
- invalid key
- Realtime session failed
- wake word paused

---

## 7) Realtime transport: как именно подключать OpenAI

### Рекомендуемая схема для desktop
Использовать **WebRTC + unified interface**, но session-init держать на native side:
1. UI создает `RTCPeerConnection`
2. UI получает local SDP offer
3. UI отдает SDP в Rust command
4. Rust формирует `/v1/realtime/calls` запрос с session config
5. Rust возвращает SDP answer в UI
6. UI ставит remote description
7. Аудио идет напрямую по WebRTC, но ключ остается в native side

Это лучший компромисс для desktop:
- минимальная задержка
- надежный audio path
- renderer не видит основной OpenAI key

### Когда использовать ephemeral tokens
Если потом появится web/mobile companion — тогда mint через backend.
Для desktop-only V1 unified interface проще и безопаснее.

---

## 8) Session config для V1

Рекомендуемый session config:

```json
{
  "type": "realtime",
  "model": "gpt-realtime",
  "audio": {
    "input": {
      "turn_detection": {
        "type": "server_vad",
        "create_response": true,
        "interrupt_response": true,
        "prefix_padding_ms": 300,
        "silence_duration_ms": 550,
        "threshold": 0.55
      },
      "noise_reduction": {
        "type": "far_field"
      }
    },
    "output": {
      "voice": "marin",
      "speed": 1.0
    }
  },
  "instructions": "Loaded from persona prompt",
  "tool_choice": "auto",
  "max_output_tokens": 900
}
```

### Почему такие параметры
- `server_vad` в V1 предсказуемее и проще дебажить
- `interrupt_response=true` дает киношный эффект перебивания
- `far_field` лучше для ноутбука / комнатного микрофона
- `max_output_tokens` ограничивает склонность к длинным голосовым монологам

### Что можно включить позже
- `semantic_vad` для более естественного conversational mode
- отдельные профили: "cinematic", "fast", "headphones"

---

## 9) Wake word

### Базовый выбор
- default: **"Эй, Джарвис"**
- optional: **"Джарвис"**
- global hotkey как запасной путь

### Почему не только голое "Джарвис"
Слишком велик шанс случайных срабатываний:
- фильмы / YouTube / фоновые разговоры
- собственный голос ассистента
- шумные комнаты

### Нормальная схема
- режим `Precise`: "Эй, Джарвис"
- режим `Cinematic`: "Джарвис"
- режим `Push-to-talk`
- режим `Hotkey only`

### Доп. защита
- speaker verification
- cooldown 2–3 секунды после ответа ассистента
- не слушать wake word, пока модель активно говорит
- отдельный "headphones mode"

---

## 10) Поиск в интернете

Не надо заставлять сам Realtime-диалог изображать полноценный браузер. Правильнее так:

### Tool
`search_web(query: string, intent?: string)`

### Внутри
- Rust получает вызов
- делает REST вызов в **Responses API**
- включает **web_search**
- получает краткий ответ + источники
- в overlay отдает:
  - spoken summary
  - 3–5 source cards
  - опционально "open source in browser"

### Почему так лучше
- голос остается быстрым
- веб-поиск становится отдельным контролируемым tool
- проще кешировать и логировать
- легко задавать safe formatting

---

## 11) Память

### Что хранить локально
- имя и preferred address: "Mr. Stark"
- голос / режимы / громкость
- любимые формулировки
- последние контексты
- recurring facts
- разрешенные инструменты
- история device preferences

### Что не хранить по умолчанию
- сырое аудио
- полные screen captures
- чувствительные токены кроме OpenAI key
- длинную нерезаную переписку без очистки

### Memory strategy
- short-term session memory — в RAM
- rolling summaries — в SQLite
- explicit facts store — отдельная таблица
- "forget me" button в settings

Пример таблиц:
- `profile`
- `preferences`
- `memory_facts`
- `session_summaries`
- `tool_audit_log`
- `device_history`

---

## 12) Windows-specific UX и системные фичи

### Нужно в V1
- tray icon
- global shortcut
- auto-start
- transparent always-on-top overlay
- click-through idle overlay
- DPI aware multi-monitor support
- microphone / output device selection
- overlay per-monitor positioning

### Важно учесть
- полноэкранные игры и некоторые защищенные приложения могут конфликтовать с overlay
- OBS / screen-share может захватывать overlay, если это не настроить отдельно
- Windows audio device switch должен корректно переживаться без перезапуска приложения
- на multi-monitor setup overlay не должен "теряться" при hotplug монитора

---

## 13) Аудиопайплайн

### Input
- `getUserMedia({ audio: { echoCancellation, noiseSuppression } })`
- device picker
- meter + RMS
- mute state
- push-to-talk fallback

### Output
- Realtime remote audio stream
- скрытый audio element
- тот же MediaStream идет в Web Audio graph
- `AnalyserNode` дает time-domain waveform и frequency data
- waveform рисуется в canvas/WebGL

### Визуализация
- главная волна: time-domain
- secondary glow: RMS / peak
- tertiary particles: frequency bins
- lip-sync не нужен; маска может жить как reactive object

---

## 14) Безопасность

### Основные правила
- OpenAI API key никогда не хранить в renderer
- key только в Rust + Windows Credential Manager
- overlay window не должен иметь лишних capabilities
- settings window получает расширенные разрешения
- destructive actions — только через confirm
- tool router — whitelist only

### Capability split
#### overlay capability
- subscribe to events
- read current session state
- no file system
- no shell launch
- no key storage access

#### settings capability
- invoke secure commands
- save config
- start/stop wake word
- test audio
- limited browser open

---

## 15) Persona spec

См. файл `jarvis_persona_prompt.txt`.

Суть:
- name: Jarvis
- address user: Mr. Stark
- tone: calm / intelligent / concise / slightly dry humor
- no over-flattery
- no fake powers
- voice replies short, overlay can be longer
- when uncertain, ask one short clarifying question
- on web search, cite sources in UI cards
- on OS actions, confirm if action changes state

---

## 16) Tool list V1

### safe tools
- `search_web`
- `open_url`
- `remember_fact`
- `recall_fact`
- `get_local_time`
- `summarize_clipboard_text`
- `analyze_screen_once`
- `list_audio_devices`
- `switch_microphone`
- `switch_output_device`

### V1.5
- `launch_app`
- `create_note`
- `read_selected_text`
- `calendar_lookup`
- `email_summary`

### Later
- file system navigator
- browser control
- code assistant mode
- home automation
- proactive reminders

---

## 17) Conversation design

### Desired behavior
- отвечает быстро
- говорит коротко
- умеет быть "интересным", но не превращается в стендап
- не повторяет "Mr. Stark" в каждом сообщении
- иногда добавляет сухую красивую фразу для характера
- если вопрос технический, становится максимально точным и конкретным

### Examples
- "Good evening, Mr. Stark."
- "One moment."
- "I've found three relevant sources."
- "That may fail unless the application grants microphone access."
- "I can do that, but I recommend confirming first."

---

## 18) Error handling и fallback matrix

### Invalid API key
UI:
- clear blocking modal in settings
- test button "Verify key"

### Mic permission denied
UI:
- show guided repair steps
- fallback to text mode

### Realtime session creation failed
UI:
- retry button
- switch to text-only mode

### Wake word unstable
UI:
- calibration screen
- sensitivity slider
- recommend "Эй, Джарвис"

### Network drops
UI:
- transient banner
- auto reconnect with backoff
- preserve recent state summary

### Output device changed
UI:
- detect change
- remap audio sink
- if failed — ask user which device to use

---

## 19) Performance budget

### Target feel
- wake response feels instant
- overlay animation stays smooth
- minimal CPU in idle mode
- wake word does not eat battery excessively

### Optimizations
- requestAnimationFrame only when visible/active
- idle overlay at reduced FPS
- heavy blur/glow pre-baked where possible
- waveform canvas reused, not recreated
- session summaries pruned
- no unbounded log growth

---

## 20) MVP backlog

## Milestone A — skeleton
- Tauri desktop app boots
- tray + settings window
- secure key storage
- save/load config
- global shortcut
- overlay transparent window

## Milestone B — realtime voice
- WebRTC session init via Rust
- microphone capture
- model audio playback
- subtitles
- VAD-driven state machine

## Milestone C — Jarvis identity
- persona prompt
- "Mr. Stark"
- waveform from real model output
- idle orb
- wake animation
- speaking overlay

## Milestone D — wake word
- Porcupine integration
- "Эй, Джарвис"
- optional "Джарвис"
- sensitivity settings
- cooldown logic

## Milestone E — web search
- Responses API tool wrapper
- source cards
- spoken summary + visual sources
- "open source in browser"

## Milestone F — polish
- reconnect logic
- device switching
- error surfaces
- animation polish
- startup optimization
- logging and diagnostics

---

## 21) Acceptance criteria

Продукт считается удачным, если:
- установка и вставка ключа занимают < 2 минут
- ассистент стабильно просыпается на wake word
- пользователь может перебивать ответ голосом
- overlay выглядит как часть системы, а не как чат-окно
- веб-поиск озвучивается кратко и показывает источники
- при проблемах есть понятный fallback, а не "ничего не происходит"

---

## 22) Что я бы выбрал как UI направление

Если нужен именно киношный образ:
- **Concept A** как main speaking mode
- **Concept C** как everyday overlay
- **Concept B** как "analysis / search / diagnostics" mode

То есть не один единственный экран, а семейство состояний в одном языке.

---

## 23) Первая сборка, которую реально стоит делать

### Самый разумный V1 scope
1. Settings window
2. API key storage
3. Realtime voice dialog
4. Wake word
5. Overlay with mask + waveform
6. Web search tool
7. Local memory for persona/preferences

Вот это уже будет производить сильный эффект и не развалится от сложности.


Все должно в итоге скомпилироваться и чтобы можно было на рабочий стол сделать ярлык и открывать потом просто двойным кликов.


Основный язык приоложения — русский, но в UI стоит добавить выбор и английского языка тоже. Также в настройках надо добавить слово, на которое будет отзываться приложения, по умолчанию "Джарвис", но пользователь может поменять на любое другое. И при этом в приветствии ассистент должен обращаться к пользователю как "Мистер Старк" и слово Мистер Старк тоже можно менять.