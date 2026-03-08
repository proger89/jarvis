# VERIFICATION_PLAYBOOK

## Быстрая проверка

Windows:
```powershell
powershell -ExecutionPolicy Bypass -File tools/verify/verify_local.ps1
```

POSIX shell:
```sh
sh tools/verify/verify_local.sh
```

Что делает quick verify:
- проверяет наличие обязательных bootstrap/doc-файлов через `node tools/docs/validate_docs.js`
- собирает frontend: `npm --prefix apps/desktop run build`
- выполняет native check: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`

## Полная проверка
- Для текущего bootstrap полный verify совпадает с quick verify, потому что подтвержденных `test`/`lint` команд в репозитории нет.
- Если появятся отдельные тесты или линтеры, сначала добавь их в verify scripts, затем обнови этот документ.

## Optional OpenAI smoke verify
Windows:
```powershell
powershell -ExecutionPolicy Bypass -File tools/verify/verify_openai_optional.ps1
```

Что делает optional verify:
- загружает `OPENAI_API_KEY` из process environment или локального `.env`
- проверяет доступ к `GET /v1/models`
- проверяет базовый `Responses API` запрос с `web_search_preview`

Ограничения:
- это не подтверждает полный end-to-end Realtime voice dialog
- для Realtime voice все еще нужен отдельный интерактивный smoke-test живой сессии

## Если команд нет
- Не выдумывай команды.
- Отмечай `UNKNOWN` и указывай, где проверить:
  - frontend scripts: `apps/desktop/package.json`
  - Rust/native: `apps/desktop/src-tauri/Cargo.toml`
  - GitHub Actions: `.github/workflows/`

## Ручной deep verify
- Dev runtime desktop app: `npm --prefix apps/desktop run tauri dev`
- Этот шаг не считается подтвержденным, пока команда реально не запускалась и приложение не прошло smoke-test.

## Ожидаемые результаты
- docs validator завершается кодом `0`
- frontend build завершается кодом `0`
- `cargo check` завершается кодом `0`

## Типовые сбои
- `node`/`npm` не найден: установить Node.js и повторить.
- `cargo` не найден: установить Rust toolchain и повторить.
- build падает после изменения docs/customizations: сначала прогнать `node tools/docs/validate_docs.js`, потом app checks.