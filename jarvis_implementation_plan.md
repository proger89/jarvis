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
- `[in-progress]` Добавить базовые папки по agreed architecture
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
- `[not-done]` Реализовать dev-only debug console
- `[in-progress]` Добавить базовую state machine: `idle`, `wake`, `listening`, `thinking`, `speaking`, `tool`, `error`
- `[done]` Добавить cinematic speaking HUD с центральной mask-композицией
- `[done]` Добавить отдельные HUD-состояния `idle / listening / thinking / speaking`
- `[done]` Развести compact idle overlay и expanded active overlay

Definition of done:
- Overlay живет отдельно от settings
- Переключение состояний отражается в UI
- Idle overlay не мешает работе пользователя

Текущее состояние phase:
- `[in-progress]` Визуальный shell уже оформлен в cinematic HUD-направлении
- `[done]` Есть полноэкранный speaking overlay с центральной mask-композицией
- `[done]` Реальные runtime-состояния `idle / listening / thinking / speaking` уже подключены в overlay
- `[done]` Idle behavior переведен в компактный click-through режим
- `[not-done]` `wake / tool / error` состояния еще не разведены

### Phase 4 — audio pipeline
Цель: подготовить input/output audio infrastructure.

Задачи:
- `[done]` Реализовать выбор input/output devices
- `[done]` Подключить `getUserMedia` и input meter
- `[in-progress]` Подключить playback path для remote audio
- `[done]` Добавить Web Audio analyser
- `[in-progress]` Реализовать waveform из реального output audio
- `[not-done]` Обработать mute, device switch и fallback states

Definition of done:
- Микрофон и output devices выбираются из UI
- На playback видна живая волна из реального аудиосигнала

Текущее состояние phase:
- `[in-progress]` Реальная waveform уже работает от input audio через Web Audio analyser
- `[done]` HUD больше не использует полностью декоративные волны
- `[in-progress]` Output audio binding от Realtime remote stream уже заведен через WebRTC track playback
- `[in-progress]` Device picker уже подключен, но output switching еще не привязан к живому воспроизведению

### Phase 5 — realtime voice session
Цель: получить рабочий speech-to-speech диалог.

Задачи:
- `[done]` Реализовать `RTCPeerConnection` на frontend
- `[in-progress]` Реализовать Rust command для session init через `/v1/realtime/calls`
- `[not-done]` Подать persona prompt в session instructions
- `[not-done]` Настроить базовый session config для `gpt-realtime`
- `[in-progress]` Обработать transcript/datachannel events
- `[not-done]` Подключить subtitles и VAD-driven state changes
- `[not-done]` Поддержать interruption / barge-in

Definition of done:
- Голосовой диалог работает end-to-end
- Пользователь может перебить ответ голосом
- Overlay показывает listening/thinking/speaking без долгой тишины

Текущее состояние phase:
- `[in-progress]` Frontend уже поднимает WebRTC peer connection и remote audio playback
- `[in-progress]` Native side уже выдает временный ключ для Realtime session
- `[in-progress]` Overlay уже реагирует на живое соединение и на уровень звука ответа
- `[not-done]` Полный end-to-end голосовой диалог еще не подтвержден с реальным API key и рабочей сессией

### Phase 6 — Jarvis identity and UX polish
Цель: довести продукт до целевого характера.

Задачи:
- `[not-done]` Встроить persona prompt как системную идентичность
- `[not-done]` Реализовать приветствия и короткие spoken replies
- `[not-done]` Добавить cinematic overlay states
- `[not-done]` Реализовать карточки субтитров и status badges
- `[not-done]` Поддержать настраиваемое обращение к пользователю

Definition of done:
- Ассистент говорит коротко и последовательно в стиле JARVIS
- Визуальный стиль ощущается как AI-presence layer, а не чат

### Phase 7 — wake word and activation modes
Цель: сделать hands-free вход в диалог.

Задачи:
- `[not-done]` Интегрировать локальный wake word engine
- `[not-done]` Поддержать настраиваемую wake phrase
- `[not-done]` Добавить global hotkey fallback
- `[not-done]` Добавить sensitivity/calibration UI
- `[not-done]` Реализовать cooldown после ответа ассистента
- `[not-done]` Отключать wake detection, пока ассистент говорит

Definition of done:
- Wake phrase срабатывает стабильно
- Есть fallback через hotkey/push-to-talk

### Phase 8 — tools and web search
Цель: добавить полезные backend tools без потери скорости voice UX.

Задачи:
- `[not-done]` Реализовать Rust tool broker с allowlist
- `[not-done]` Реализовать `search_web` через Responses API
- `[not-done]` Отдавать spoken summary + source cards
- `[not-done]` Реализовать `open_url`
- `[not-done]` Реализовать `remember_fact` / `recall_fact`
- `[not-done]` Подготовить `analyze_screen_once` с confirm flow

Definition of done:
- Web search отрабатывает как tool, а не как фейковый диалог
- Пользователь видит 3–5 источников и может открыть их в браузере

### Phase 9 — local memory and persistence
Цель: добавить локальную память и долговечные настройки.

Задачи:
- `[not-done]` Подключить SQLite
- `[not-done]` Создать таблицы `profile`, `preferences`, `memory_facts`, `session_summaries`, `tool_audit_log`, `device_history`
- `[not-done]` Реализовать rolling summaries
- `[not-done]` Реализовать explicit facts store
- `[not-done]` Добавить `forget me` control в settings

Definition of done:
- Профиль и настройки сохраняются локально
- Память хранит только разрешенные данные

### Phase 10 — Windows integration and resilience
Цель: довести приложение до usable desktop product.

Задачи:
- `[not-done]` Реализовать tray icon
- `[not-done]` Реализовать auto-start
- `[not-done]` Реализовать multi-monitor aware overlay positioning
- `[not-done]` Переживать device hotplug без перезапуска
- `[not-done]` Добавить reconnect with backoff
- `[not-done]` Добавить fallback states для invalid key, denied mic, dropped network, unstable wake word

Definition of done:
- Приложение стабильно переживает типовые Windows-сбои
- Есть понятный пользовательский fallback вместо silent failure

### Phase 11 — packaging and release readiness
Цель: сделать сборку, которую можно запускать двойным кликом с рабочего стола.

Задачи:
- `[not-done]` Настроить production build для Windows
- `[not-done]` Проверить packaged app launch вне dev-среды
- `[not-done]` Подготовить иконки, shortcut и installer flow
- `[not-done]` Проверить первый-run UX: ключ, устройства, тест голоса, wake word

Definition of done:
- Пользователь может открыть приложение двойным кликом
- Первый запуск укладывается в целевой onboarding

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

Следующие этапы все еще остаются в статусе:
- `[in-progress]` Secrets/config persistence
- `[not-done]` Audio pipeline
- `[not-done]` Realtime voice
- `[not-done]` Wake word
- `[not-done]` Tools/web search
- `[not-done]` Local memory
- `[not-done]` Windows integration polish
- `[not-done]` Packaging and release readiness

## 5. Что делать следующим шагом

Следующий исполнимый шаг по порядку:
- `[next]` Закрыть остаток Phase 2: verify flow для API key и настройки audio devices
- `[next]` Затем перейти в Phase 3 и Phase 4: overlay state machine и audio pipeline

## 6. Критерии приемки MVP

MVP можно считать достигнутым, когда выполнены одновременно следующие пункты:
- `[not-done]` Есть безопасное хранение API key
- `[done]` Есть безопасное хранение API key
- `[not-done]` Работает Realtime voice dialog
- `[not-done]` Есть overlay с живой волной от реального output audio
- `[not-done]` Есть wake word или hotkey activation
- `[not-done]` Есть web search tool с источниками
- `[not-done]` Есть fallback UX для типовых ошибок
- `[done]` Собран Windows desktop build, запускаемый двойным кликом