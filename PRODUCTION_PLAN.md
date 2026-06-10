# Pulse Messenger — Production Roadmap

> Доработка до production-ready: x86-64 Linux + Android

---

## Приоритеты

| Приоритет | Область | Описание |
|---|---|---|
| **P0** | Критические баги и безопасность | То, что ломает работу или открывает уязвимости |
| **P1** | Ядро продукта | Минимально жизненный продукт на обеих платформах |
| **P2** | Стабильность и качество | Тесты, CI/CD, обработка ошибок |
| **P3** | Документация | README, CONTRIBUTING, лицензия, changelog |
| **P4** | UX и полировка | Уведомления, оффлайн, производительность |
| **P5** | Расширенный функционал | Боты, каналы, расширенные группы |

---

## P0 — Критические баги и безопасность

### 0.1 Исправление поиска сообщений
- **Проблема:** `search_messages()` в `storage.rs` десериализует ВСЕ сообщения из bincode-бlobов при каждом поиске — O(n) по памяти, не масштабируется
- **Решение:** Хранить текстовое содержимое сообщений в отдельной TEXT-колонке в SQLite (помимо bincode blob для остальных полей). Или добавить FTS5 виртуальную таблицу
- **Файлы:** `src-tauri/src/services/storage.rs`

### 0.2 Верификация подписей — проверить edge cases
- **Проблема:** Проверка Ed25519 подписей есть, но нужно убедиться что:
  - Все типы сообщений (не только TextMessage) подписываются и верифицируются
  - Невалидные подписи логируются, а не молча дропаются
  - Replay-атаки предотвращаются (добавить timestamp/nonce в подписываемые данные)
- **Файлы:** `src-tauri/src/lib.rs`, `src-tauri/src/services/encryption.rs`, `src-tauri/src/services/network.rs`

### 0.3 Безопасное хранение ключей
- **Проблема:** Ключи хранятся в plaintext файлах (`identity.key`, `x25519.key`)
- **Решение:** Использовать OS keyring (Linux: libsecret/Secret Service, Android: Android Keystore) через `keyring` crate или Tauri plugin
- **Файлы:** `src-tauri/src/services/encryption.rs`, `src-tauri/src/services/key_exchange.rs`, `Cargo.toml`

### 0.4 Обработка паник в Rust
- **Проблема:** `unwrap()` вызовы в сервисах могут паниковать и крашить приложение
- **Решение:** Заменить все `unwrap()` на `?` или `expect()` с осмысленными сообщениями, добавить `catch_unwind` на границе Tauri commands
- **Файлы:** все `src-tauri/src/services/*.rs`, `src-tauri/src/lib.rs`

---

## P1 — Ядро продукта (x86-64 Linux)

### 1.1 Сборка и запуск на Linux
- Убедиться что `cargo tauri build` проходит без ошибок на x86-64 Linux
- Проверить что AppImage и .deb собираются корректно
- Протестировать на чистом Ubuntu 22.04/24.04 (минимальные зависимости)
- **Команда:** `cargo tauri build --bundles appimage deb`
- **Файлы:** `src-tauri/tauri.conf.json`

### 1.2 Настройка Linux-специфичных зависимостей
- Убедиться что `rusqlite` с `bundled` feature компилируется (SQLite из исходников)
- Проверить что libp2p TCP transport работает (нет проблем с firewall/seccomp)
- Проверить что mDNS discovery работает в локальной сети
- **Файлы:** `src-tauri/Cargo.toml`

### 1.3 Автозапуск (опционально)
- Добавить опцию «Запускать при старте системы» для Linux (`.desktop` файл в `~/.config/autostart/`)
- **Файлы:** `src-tauri/tauri.conf.json` (bundle resources)

### 1.4 Обновления
- Настроить `tauri-plugin-updater` для автоматической проверки обновлений с GitHub Releases
- **Файлы:** `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

---

## P1 — Ядро продукта (Android)

### 1.1 Настройка кросс-компиляции
- Установить Android SDK, NDK (r26+), cargo-ndk
- Настроить targets: `aarch64-linux-android` (ARM64), `armv7-linux-androideabi` (ARM32), `x86_64-linux-android` (эмулятор)
- Проверить что все Rust crate компилируются под Android
- **Проблемные crate:** `rusqlite` (нужен `bundled`), `libp2p` (mDNS может не работать), `image` (может потребоваться cross-compiled libjpeg/libpng)
- **Файлы:** `src-tauri/Cargo.toml`, `.cargo/config.toml`

### 1.2 Storage path для Android
- **Проблема:** `dirs-next` возвращает не тот путь на Android
- **Решение:** Использовать `tauri::api::path::app_data_dir()` или передавать путь из Java/Kotlin в Rust через JNI при инициализации
- **Альтернатива:** Использовать Tauri v2 `path` resolver который уже знает app data dir на Android
- **Файлы:** `src-tauri/src/services/storage.rs`, `src-tauri/src/lib.rs`

### 1.3 Сеть на Android
- **Проблемы:**
  - mDNS может не работать на многих Android устройствах (производители отключают multicast)
  - TCP может быть заблокирован运营商'ами
  - Приложение уходит в background — соединения рвутся
- **Решения:**
  - Добавить WebSocket transport как fallback для libp2p
  - Implement foreground service для поддержания P2P соединений в background
  - Добавить reconnect логику с exponential backoff
  - Рассмотреть relay сервер как fallback
- **Файлы:** `src-tauri/src/services/network.rs`, `AndroidManifest.xml` (foreground service), `src-tauri/src/lib.rs`

### 1.4 Рантайм-разрешения Android
- Реализовать запрос permissions при первом использовании:
  - `RECORD_AUDIO` — при начале звонка/записи голосового
  - `CAMERA` — при включении видео в звонке
  - `POST_NOTIFICATIONS` — при первом запуске (Android 13+)
  - `READ_MEDIA_*` — при выборе файла для отправки
- Использовать `@tauri-apps/plugin-notification` для запроса
- **Файлы:** `src/` (компоненты с медиа), `src-tauri/capabilities/`

### 1.5 Файловая система на Android
- **Проблема:** Прямой доступ к файловой системе ограничен (Scoped Storage)
- **Решение:** Использовать Android ContentResolver / SAF (Storage Access Framework) через Tauri FS plugin или кастомный плагин
- Реализовать share intent для получения файлов из других приложений
- **Файлы:** `src-tauri/src/services/file_transfer.rs`, `src/components/chat/FileMessage.tsx`

### 1.6 Навигация «Назад» на Android
- Перехватывать системную кнопку «Назад»
- Реализовать стек навигации: Chat → ChatList → Exit confirmation
- **Файлы:** `src/App.tsx`, `src/components/Sidebar.tsx`

### 1.7 Клавиатура и safe-area
- Проверить корректную работу с клавиатурой (adjustResize behavior)
- Убедиться что safe-area insets корректно применяются (вырезы, скругления экранов)
- **Файлы:** `src/styles/globals.css`, `index.html`

### 1.8 WebRTC на Android
- **Проблема:** STUN серверы Google могут быть заблокированы
- **Решение:** Добавить TURN серверы как fallback (можно self-hosted coturn или Cloudflare TURN)
- Проверить что `getUserMedia` работает через Tauri WebView на Android
- **Файлы:** `src/services/webrtc.ts`

### 1.9 Сборка APK/AAB
- Настроить `cargo tauri android build`
- Подписать APK/AAB релизным ключом
- Протестировать на реальном устройстве (ARM64)
- **Команда:** `cargo tauri android build --target aarch64 --apk`

---

## P2 — Стабильность и качество

### 2.1 Тесты (Rust)
- Unit-тесты для всех сервисов:
  - `encryption.rs` — генерация ключей, подписывание, верификация, шифрование/дешифрование
  - `key_exchange.rs` — X25519 DH, HKDF деривация
  - `storage.rs` — CRUD операции, миграции, edge cases (дубликаты, пустые данные)
  - `protocol.rs` — сериализация/десериализация всех типов сообщений
  - `file_transfer.rs` — чанкирование, прогресс, MIME detection
  - `group_chat.rs` — роли, приглашения, ограничения
- Integration-тесты для P2P (два узла на localhost)
- **Файлы:** `src-tauri/src/services/*.rs` (добавить `#[cfg(test)]` модули)

### 2.2 Тесты (Frontend)
- Unit-тесты для Zustand сторов (мокать `invoke` и `listen`)
- Component-тесты для критических UI (отправка сообщения, создание чата, звонок)
- **Инструменты:** Vitest + @testing-library/react
- **Новые зависимости:** `vitest`, `@testing-library/react`, `@testing-library/jest-dom`
- **Файлы:** `src/**/*.test.ts(x)`

### 2.3 CI/CD Pipeline
- GitHub Actions workflows:
  - `ci.yml` — lint + test + build (Linux x86-64) на каждый PR
  - `release.yml` — build + sign + publish при tag
  - `android.yml` — build APK при tag
- Кеширование `node_modules`, `target/`, cargo registry
- **Файлы:** `.github/workflows/*.yml`

### 2.4 Обработка ошибок на фронтенде
- Показывать пользователю понятные ошибки вместо крашей
- Retry логика для failed `invoke()` вызовов
- Offline индикатор и queued messages
- **Файлы:** `src/stores/*.ts`, `src/App.tsx`, `src/components/ErrorBoundary.tsx`

### 2.5 Миграции базы данных
- Добавить версионирование схемы SQLite
- Миграции при обновлении приложения (ALTER TABLE, новые таблицы)
- **Файлы:** `src-tauri/src/services/storage.rs`

---

## P3 — Документация

### 3.1 README.md (полный rewrite)
- [ ] Описание проекта и скриншоты/GIF
- [ ] Быстрый старт (dev + build для Linux и Android)
- [ ] Архитектура (diagram)
- [ ] Стек технологий (актуальный, без sled)
- [ ] Как собрать из исходников
- [ ] Как подключиться к другому пользователю
- [ ] Roadmap
- [ ] Лицензия

### 3.2 CONTRIBUTING.md
- [ ] Как настроить dev окружение
- [ ] Код стайл (Rust: `rustfmt`, TS: prettier/eslint)
- [ ] Как запустить тесты
- [ ] PR process
- [ ] Issue templates

### 3.3 SECURITY.md
- [ ] Описание крипто-архитектуры
- [ ] Как сообщить об уязвимости
- [ ] Политика обновлений безопасности

### 3.4 CHANGELOG.md
- [ ] Семантическое версионирование
- [ ] Описывать изменения при каждом релизе

### 3.5 LICENSE
- [ ] Добавить полный текст MIT лицензии (в README указано MIT, но файла LICENSE может не быть)

### 3.6 Документация API
- [ ] Описание всех Tauri commands (входные/выходные параметры)
- [ ] Описание протокола (`ProtocolMessage`)
- [ ] Описание схемы SQLite

---

## P4 — UX и полировка

### 4.1 Нативные уведомления
- Linux: `libnotify` через `tauri-plugin-notification`
- Android: system notifications с каналами (сообщения, звонки, файлы)
- Клик по уведомлению → открытие нужного чата
- **Файлы:** `src/services/notifications.ts`, `src/App.tsx`

### 4.2 Оффлайн очередь сообщений
- Хранить неотправленные сообщения локально
- Автоматическая отправка при восстановлении соединения
- Иникатор «отправляется» / «доставлено» / «прочитано»
- **Файлы:** `src/stores/chatStore.ts`, `src-tauri/src/services/storage.rs`, `src-tauri/src/lib.rs`

### 4.3 Производительность
- Виртуализация списка сообщений (react-window или react-virtuoso)
- Lazy loading истории сообщений (порциями по 50)
- Кеширование аватаров и файлов
- **Файлы:** `src/components/chat/ChatView.tsx`, `src/stores/chatStore.ts`

### 4.4 Accessibility
- ARIA labels на интерактивных элементах
- Навигация с клавиатуры
- Поддержка screen reader (основные действия)
- **Файлы:** все компоненты

### 4.5 Аватары
- Генерация аватаров по умолчанию (initials + color из hash имени)
- Загрузка пользовательского аватара
- **Файлы:** `src/components/`, `src-tauri/src/services/storage.rs`

---

## P5 — Расширенный функционал

### 5.1 Голосовые сообщения
- Запись через MediaRecorder (WebM/Opus) — частично реализовано
- Воспроизведение с прогрессом
- Визуализация waveform
- **Файлы:** `src/components/chat/ChatView.tsx`, `src/components/chat/FileMessage.tsx`

### 5.2 Реакции на сообщения
- Emoji реакции (как в Telegram/Discord)
- Синхронизация через P2P протокол
- **Файлы:** `src-tauri/src/models/mod.rs`, `src-tauri/src/services/protocol.rs`, `src/components/chat/ChatView.tsx`

### 5.3 Редактирование сообщений
- Редактирование отправленных сообщений
- Индикатор «edited»
- **Файлы:** `src-tauri/src/lib.rs`, `src/components/chat/ChatView.tsx`

### 5.4 Threads / Replies (улучшение)
- Визуальное отображение reply chains
- Threads в групповых чатах
- **Файлы:** `src/components/chat/ChatView.tsx`, `src/components/chat/FileMessage.tsx`

### 5.5 Каналы
- Публичные каналы (one-to-many broadcasting)
- Пустая директория `components/channels/` — начать реализацию
- **Файлы:** `src/components/channels/`, `src-tauri/src/services/`

### 5.6 Боты
- API для ботов (webhook или in-process)
- Пустая директория `components/bots/` — начать реализацию
- **Файлы:** `src/components/bots/`, `src-tauri/src/services/`

---

## Порядок выполнения

```
Неделя 1-2:  P0 (баги, безопасность, unwrap cleanup)
Неделя 3-4:  P1 Linux (сборка, тестирование, AppImage/deb)
Неделя 5-8:  P1 Android (кросс-компиляция, storage, сеть, permissions, APK)
Неделя 9-10: P2 (тесты, CI/CD, миграции)
Неделя 11:   P3 (документация)
Неделя 12-13: P4 (уведомления, оффлайн, производительность)
Неделя 14+:  P5 (расширенный функционал)
```

---

## Чеклист релиза v1.0

- [ ] Все P0 задачи закрыты
- [ ] Linux x86-64: AppImage + .deb собираются и работают
- [ ] Android: APK собирается и работает на ARM64
- [ ] Все unit-тесты проходят
- [ ] CI/CD pipeline работает
- [ ] README актуален
- [ ] LICENSE файл добавлен
- [ ] CHANGELOG заполнен
- [ ] Нет `unwrap()` в production коде
- [ ] Ключи хранятся в OS keyring
- [ ] Поиск сообщений работает через FTS5
- [ ] Нативные уведомления работают на обеих платформах
- [ ] Оффлайн очередь сообщений реализована
