# JARVIS for Windows 11 — единый план реализации

Статусы:
- `[done]` — уже есть в workspace или реализовано
- `[in-progress]` — в работе
- `[not-done]` — еще не сделано
- `[blocked]` — есть внешний блокер

Текущее состояние репозитория:
- `[done]` Есть product blueprint на русском: `jarvis_windows_blueprint.md`
- `[done]` Есть product blueprint на английском: `jarvis_windows_blueprint2.md`
- `[done]` Есть persona prompt: `jarvis_persona_prompt.txt`
- `[done]` Есть первичная схема tools: `jarvis_tool_schemas.json`
- `[done]` Есть desktop-приложение Tauri в `apps/desktop`
- `[done]` Есть frontend на React + Vite
- `[done]` Есть Rust backend scaffold
- `[done]` Есть базовый build/run pipeline (`npm install`, `npm run build`, `cargo check`)
- `[done]` Есть foundation для отдельных окон `overlay` и `settings`
- `[done]` Есть tray icon skeleton
- `[done]` Есть packaged desktop build (`.msi` и `.exe` installer)
- `[done]` Есть native settings persistence для языка, wake word и обращения к пользователю
- `[done]` Есть secure API key storage через native keyring
- `[done]` Есть базовый RU/EN UI switching
- `[done]` Есть compact centered overlay с центральным helmet-визуалом и боковыми wave ribbons
- `[done]` Есть SQLite-backed local memory, session summaries и tool/device audit

## 1. Целевая V1-конфигурация

Собираем Windows-first desktop assistant со следующим baseline:
- Tauri 2 + Rust для native-shell, secure storage, window/tray/autostart, tool routing
- React + TypeScript + Vite для overlay, settings и debug UI
- OpenAI Realtime через WebRTC для voice loop
- OpenAI Responses API для `search_web`
- SQLite для локальной памяти и настроек
- Windows Credential Manager для OpenAI API key
- Локальный wake word engine с настраиваемой wake phrase
- UI по умолчанию на русском с переключением на английский
- Персонализация `wake word` и обращения к пользователю (`Мистер Старк` по умолчанию)

## 2. Непротиворечивые продуктовые решения

Из двух blueprint-файлов фиксируем единый набор решений:
- `[done]` Платформа V1: только Windows 11
- `[done]` Shell: Tauri 2
- `[done]` Native core: Rust
- `[done]` UI: React + TypeScript + Vite
- `[done]` Voice transport: WebRTC
- `[done]` Web search: отдельный backend tool через Responses API
- `[done]` Wake strategy: по умолчанию безопасный режим с настраиваемой wake phrase
- `[done]` Overlay и Settings должны быть раздельными окнами
- `[done]` Long-lived API key хранится только на native side
- `[done]` Screen analysis в V1 только одноразовый, по явному действию

Дополнение из пользовательских требований:
- `[done]` Основной язык приложения: русский
- `[done]` В UI должен быть выбор английского языка
- `[done]` Wake word должен быть настраиваемым, по умолчанию `Джарвис`
- `[done]` Обращение к пользователю должно быть настраиваемым, по умолчанию `Мистер Старк`

## 3. Порядок реализации

### Phase 0 — спецификация и трекер
Цель: зафиксировать единый план и baseline.

Задачи:
- `[done]` Свести blueprint-файлы в один roadmap
- `[done]` Проверить, что persona и tool contract уже выделены в отдельные файлы
- `[done]` Зафиксировать статусы на основе текущего workspace

Definition of done:
- Есть единый план реализации
- Есть прозрачный список того, что уже готово как артефакт требований

### Phase 1 — foundation / project bootstrap
Цель: получить собираемый desktop skeleton.

Задачи:
- `[done]` Создать app layout для desktop-приложения в `apps/desktop`
- `[done]` Инициализировать Tauri 2 проект
- `[done]` Инициализировать React + TypeScript + Vite frontend
- `[done]` Добавить Rust backend scaffold
- `[done]` Настроить package manager, scripts, dev/build pipeline
- `[done]` Добавить базовые папки по agreed architecture
- `[done]` Настроить desktop shortcut-friendly packaged build
- `[done]` Добавить tray icon skeleton

Definition of done:
- Приложение запускается локально в dev-режиме
- Есть отдельные окна `overlay` и `settings`
- Есть tray icon skeleton
- Есть команда production build

Текущее состояние phase:
- `[done]` Phase 1 завершен
- `[done]` Frontend build проходит
- `[done]` Rust `cargo check` проходит
- `[done]` Overlay и settings разделены на уровне foundation
- `[done]` Dev runtime проверен через `tauri dev`
- `[done]` Tray skeleton добавлен
- `[done]` Packaged build проходит и собирает MSI/NSIS bundles

### Phase 2 — config, secrets, localization
Цель: получить рабочую конфигурацию приложения и безопасное хранение ключей.

Задачи:
- `[done]` Реализовать secure storage OpenAI API key через native keyring layer
- `[done]` Добавить settings screen для API key, языка, wake word и обращения к пользователю
- `[done]` Добавить локальное хранение preferences/profile
- `[done]` Реализовать i18n для RU/EN
- `[done]` Добавить валидацию key format и кнопку verify

Definition of done:
- Пользователь может сохранить ключ безопасно
- Язык интерфейса переключается между RU и EN
- Wake word и user title редактируются в настройках

Текущее состояние phase:
- `[done]` Phase 2 завершен
- `[done]` Настройки сохраняются между запусками
- `[done]` Ключ сохраняется вне renderer
- `[done]` RU/EN интерфейс работает на текущем foundation UI
- `[done]` Проверка валидности ключа через UI/API добавлена
- `[done]` Базовые настройки устройств уже подключены

### Phase 3 — windowing and overlay shell
Цель: получить визуальный shell приложения.

Задачи:
- `[done]` Реализовать прозрачное always-on-top overlay window
- `[done]` Реализовать click-through для idle mode
- `[done]` Реализовать settings window
- `[done]` Реализовать dev-only debug console
- `[in-progress]` Добавить базовую state machine: `idle`, `wake`, `listening`, `thinking`, `speaking`, `tool`, `error`
- `[done]` Добавить cinematic speaking HUD с центральной helmet-композицией
- `[done]` Добавить отдельные HUD-состояния `idle / listening / thinking / speaking`
- `[done]` Развести compact centered overlay для idle/active режимов без fullscreen chrome в основном UX

Definition of done:
- Overlay живет отдельно от settings
- Переключение состояний отражается в UI
- Idle overlay не мешает работе пользователя

Текущее состояние phase:
- `[in-progress]` Визуальный shell уже оформлен в cinematic HUD-направлении
- `[done]` Есть компактный centered overlay с центральной helmet-композицией и волнами по бокам
- `[done]` Реальные runtime-состояния `idle / wake / listening / thinking / speaking` уже подключены в overlay
- `[done]` Idle behavior переведен в компактный click-through режим
- `[done]` Есть dev-only debug console, вызываемая только в dev-сборке
- `[in-progress]` `tool / error` состояния уже имеют отдельную компактную rail-UX и цветовую реакцию, но еще могут быть доработаны

### Phase 4 — audio pipeline
Цель: подготовить input/output audio infrastructure.

Задачи:
- `[done]` Реализовать выбор input/output devices
- `[done]` Подключить `getUserMedia` и input meter
- `[in-progress]` Подключить playback path для remote audio
- `[done]` Добавить Web Audio analyser
- `[in-progress]` Реализовать waveform из реального output audio
- `[in-progress]` Обработать mute, device switch и fallback states

Definition of done:
- Микрофон и output devices выбираются из UI
- На playback видна живая волна из реального аудиосигнала

Текущее состояние phase:
- `[in-progress]` Реальная waveform уже работает от input audio через Web Audio analyser
- `[done]` HUD больше не использует полностью декоративные волны
- `[in-progress]` Output audio binding от Realtime remote stream уже заведен через WebRTC track playback
- `[in-progress]` Speaking wave уже может использовать реальные remote output samples из WebRTC audio analyser
- `[in-progress]` Device picker уже подключен, output sink selection пробуется через `setSinkId`, а hotplug fallback уже откатывает устройство к `default`

### Phase 5 — realtime voice session
Цель: получить рабочий speech-to-speech диалог.

Задачи:
- `[done]` Реализовать `RTCPeerConnection` на frontend
- `[done]` Реализовать Rust command для session init через `/v1/realtime/calls`
- `[done]` Подать persona prompt в session instructions
- `[done]` Настроить базовый session config для `gpt-realtime`
- `[in-progress]` Обработать transcript/datachannel events
- `[in-progress]` Подключить subtitles и VAD-driven state changes
- `[in-progress]` Поддержать interruption / barge-in

Definition of done:
- Голосовой диалог работает end-to-end
- Пользователь может перебить ответ голосом
- Overlay показывает listening/thinking/speaking без долгой тишины

Текущее состояние phase:
- `[in-progress]` Frontend уже поднимает WebRTC peer connection и remote audio playback
- `[done]` Native side уже формирует session init через `/v1/realtime/calls` и возвращает SDP answer
- `[done]` Persona prompt уже подается в instructions при создании Realtime session
- `[done]` Базовая session config для `gpt-realtime` и голоса уже подается с native side
- `[done]` Renderer больше не получает временный ключ для Realtime
- `[in-progress]` Overlay уже реагирует на живое соединение и на уровень звука ответа
- `[in-progress]` Overlay уже реагирует не только на уровень ответа, но и на реальные remote audio samples во время speaking
- `[in-progress]` Overlay уже показывает простые субтитры, ошибки и состояние выполнения действия
- `[in-progress]` Отмена ответа при новом голосе уже заложена в клиентском коде
- `[in-progress]` Начало речи и follow-up activation уже прерывают ответ, а окончание реплики автоматически запускает новый ответ
- `[done]` Optional OpenAI smoke verify уже подтверждает рабочий `Models API` и `Responses API` path через `OPENAI_API_KEY`
- `[not-done]` Полный end-to-end голосовой диалог еще не подтвержден с реальным API key и рабочей сессией

### Phase 6 — Jarvis identity and UX polish
Цель: довести продукт до целевого характера.

Задачи:
- `[done]` Встроить persona prompt как системную идентичность
- `[done]` Реализовать приветствия и короткие spoken replies
- `[done]` Добавить cinematic overlay states
- `[in-progress]` Реализовать карточки субтитров и status badges
- `[done]` Поддержать настраиваемое обращение к пользователю

Definition of done:
- Ассистент говорит коротко и последовательно в стиле JARVIS
- Визуальный стиль ощущается как AI-presence layer, а не чат

Текущее состояние phase:
- `[done]` Persona prompt уже закрепляет краткие spoken replies, короткие открытия хода и естественные приветствия
- `[in-progress]` Subtitles/status layer уже существует, но может быть еще усилен в runtime UX

### Phase 7 — wake word and activation modes
Цель: сделать hands-free вход в диалог.

Задачи:
- `[not-done]` Интегрировать локальный wake word engine
- `[not-done]` Поддержать настраиваемую wake phrase
- `[done]` Добавить global hotkey fallback
- `[not-done]` Добавить sensitivity/calibration UI
- `[not-done]` Реализовать cooldown после ответа ассистента
- `[not-done]` Отключать wake detection, пока ассистент говорит

Definition of done:
- Wake phrase срабатывает стабильно
- Есть fallback через hotkey/push-to-talk

Текущее состояние phase:
- `[done]` Есть системный fallback shortcut `Ctrl+Alt+J`, который поднимает overlay и запускает voice activation path
- `[in-progress]` После ответа ассистента уже есть короткий activation cooldown для более стабильного follow-up поведения
- `[not-done]` Локальный wake word engine, cooldown и calibration UI еще не добавлены

### Phase 8 — tools and web search
Цель: добавить полезные backend tools без потери скорости voice UX.

Задачи:
- `[not-done]` Реализовать Rust tool broker с allowlist
- `[in-progress]` Реализовать `search_web` через Responses API
- `[in-progress]` Отдавать spoken summary + source cards
- `[in-progress]` Реализовать `open_url`
- `[in-progress]` Реализовать `remember_fact` / `recall_fact`
- `[not-done]` Подготовить `analyze_screen_once` с confirm flow

Definition of done:
- Web search отрабатывает как tool, а не как фейковый диалог
- Пользователь видит 3–5 источников и может открыть их в браузере

Текущее состояние phase:
- `[in-progress]` Realtime session уже умеет принимать tool calls и возвращать `function_call_output`
- `[done]` Подключены первые реальные tools: `list_audio_devices`, `switch_microphone`, `switch_output_device`
- `[in-progress]` `open_url` уже подключен через confirm flow перед открытием ссылки
- `[in-progress]` Native `search_web` уже ходит в Responses API и возвращает summary + источники
- `[in-progress]` Overlay уже умеет показывать source cards и confirm flow, но в текущем минимальном centered UX эти панели не являются основным визуальным режимом
- `[in-progress]` Native memory tools уже умеют сохранять и искать простые факты в локальном store
- `[done]` Optional OpenAI smoke verify уже подтверждает `Responses API` path для web-search tooling
- `[not-done]` Полноценный Rust tool broker и screen/memory expansion еще не добавлены

### Phase 9 — local memory and persistence
Цель: добавить локальную память и долговечные настройки.

Задачи:
- `[done]` Подключить SQLite
- `[done]` Создать таблицы `profile`, `preferences`, `memory_facts`, `session_summaries`, `tool_audit_log`, `device_history`
- `[in-progress]` Реализовать rolling summaries
- `[done]` Реализовать explicit facts store
- `[in-progress]` Добавить `forget me` control в settings

Definition of done:
- Профиль и настройки сохраняются локально
- Память хранит только разрешенные данные

Текущее состояние phase:
- `[done]` `profile/preferences` уже сохраняются в SQLite-backed store
- `[done]` Есть миграция legacy settings JSON в SQLite
- `[done]` `remember_fact / recall_fact` уже работают через SQLite-backed store
- `[done]` Есть миграция legacy JSON-файла памяти в SQLite
- `[in-progress]` Realtime tools уже умеют сохранять и читать простые факты через native side
- `[in-progress]` В settings уже можно увидеть локальные факты и очистить память через `forget me`
- `[in-progress]` Короткие session summaries уже сохраняются в SQLite и видны в settings
- `[done]` `tool_audit_log` уже собирает результаты tool-вызовов и виден в settings
- `[done]` `device_history` уже фиксирует смену аудиоустройств и виден в settings
- `[not-done]` Более полный audit layer и расширение persistence еще не добавлены

### Phase 10 — Windows integration and resilience
Цель: довести приложение до usable desktop product.

Задачи:
- `[done]` Реализовать tray icon
- `[done]` Реализовать auto-start
- `[done]` Реализовать multi-monitor aware overlay positioning
- `[in-progress]` Переживать device hotplug без перезапуска
- `[in-progress]` Добавить reconnect with backoff
- `[in-progress]` Добавить fallback states для invalid key, denied mic, dropped network, unstable wake word

Definition of done:
- Приложение стабильно переживает типовые Windows-сбои
- Есть понятный пользовательский fallback вместо silent failure

Текущее состояние phase:
- `[done]` Tray icon уже есть на уровне foundation
- `[done]` В settings уже есть toggle для launch at login через Tauri autostart plugin
- `[done]` Базовое позиционирование overlay уже учитывает текущий монитор
- `[in-progress]` Settings и live session уже реагируют на `devicechange` и откатываются к `default`, если выбранное устройство исчезло
- `[in-progress]` Realtime client уже умеет повторять подключение с короткой паузой после обрыва
- `[in-progress]` В UI уже есть понятные fallback-сценарии для отсутствия ключа, микрофона, сети и для переподключения
- `[not-done]` Полное покрытие hotplug/fallback состояний еще не завершено

### Phase 11 — packaging and release readiness
Цель: сделать сборку, которую можно запускать двойным кликом с рабочего стола.

Задачи:
- `[done]` Настроить production build для Windows
- `[done]` Проверить packaged app launch вне dev-среды
- `[in-progress]` Подготовить иконки, shortcut и installer flow
- `[not-done]` Проверить первый-run UX: ключ, устройства, тест голоса, wake word

Definition of done:
- Пользователь может открыть приложение двойным кликом
- Первый запуск укладывается в целевой onboarding

Текущее состояние phase:
- `[done]` `npm --prefix apps/desktop run tauri build` реально собирает Windows bundles: MSI и NSIS
- `[done]` Release executable реально стартует вне dev-сервера
- `[done]` NSIS silent install в temp-каталог проходит, и установленный exe реально стартует
- `[in-progress]` NSIS installer path уже подтвержден, но shortcut и интерактивный installer UX еще не подтверждены
- `[not-done]` Onboarding smoke после установки еще не подтвержден

## 4. Что уже сделано по факту

Сейчас завершены следующие блоки:
- `[done]` Product blueprint
- `[done]` Persona prompt
- `[done]` Tool schemas
- `[done]` Tauri 2 + React + TypeScript desktop scaffold
- `[done]` Rust window bootstrap для `overlay` и `settings`
- `[done]` Базовый UI shell вместо стандартного starter demo
- `[done]` Tray + packaged Windows build
- `[done]` Native settings persistence
- `[done]` Secure key storage
- `[done]` RU/EN language switching
- `[done]` SQLite persistence для profile/preferences/memory/audit
- `[done]` Compact centered overlay с helmet-визуалом
- `[done]` Dev-only debug console для overlay

Следующие этапы все еще остаются в статусе:
- `[done]` Secrets/config persistence
- `[in-progress]` Audio pipeline
- `[in-progress]` Realtime voice
- `[not-done]` Wake word
- `[in-progress]` Tools/web search
- `[in-progress]` Local memory
- `[in-progress]` Windows integration polish
- `[in-progress]` Packaging and release readiness

## 5. Что делать следующим шагом

Следующий исполнимый шаг по порядку:
- `[next]` Подтвердить end-to-end Realtime voice session с реальной рабочей сессией
- `[next]` Затем добить output audio / fallback path и подтвердить end-to-end Realtime voice session

## 6. Критерии приемки MVP

MVP можно считать достигнутым, когда выполнены одновременно следующие пункты:
- `[done]` Есть безопасное хранение API key
- `[not-done]` Работает Realtime voice dialog
- `[not-done]` Есть overlay с живой волной от реального output audio
- `[not-done]` Есть wake word или hotkey activation
- `[not-done]` Есть web search tool с источниками
- `[in-progress]` Есть fallback UX для типовых ошибок
- `[done]` Собран Windows desktop build, запускаемый двойным кликом