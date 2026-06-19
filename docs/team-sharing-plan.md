# План: командно-разделяемая Change Memory + переключатель авто-захвата

> Статус: **реализовано** (build + 23/23 тестов зелёные). Документ фиксирует
> мотивацию и состав изменений, чтобы следующий разработчик понимал, что и зачем
> было сделано.

## Контекст

Раньше Change Memory была **локальной для машины**: каталог `.change-memory/`
целиком игнорировался git, а `ChangeRecord` хранил *что* изменилось, но не *кто*.
В командной разработке следующий разработчик после `git clone` получал пустую
память и не видел, кто и почему вносил правки.

Цель: дать **семантической карте** изменений путешествовать вместе с репозиторием
(с атрибуцией автора), оставляя тяжёлые/бинарные и машинно-специфичные артефакты
локальными. Плюс — команда для включения/выключения авто-захвата у каждого
разработчика.

Зафиксированные решения:
- **Делим только карту, патчи остаются локально** (нет бинарного мусора в git).
- **Атрибуция** из `git config user.name/user.email`.
- **Плагин не делает git-записей** (сохраняем read-only модель безопасности);
  коммит файлов памяти — часть обычного git-потока пользователя.

## Что разделяется, а что остаётся локальным

`get_session_context` пересобирает снимок только из `index.json` +
`changes.jsonl` (`sessionBuilder.ts`), поэтому свежий клон корректно
восстанавливает контекст, как только эти файлы закоммичены.

| Файл | Коммитится? | Почему |
| --- | --- | --- |
| `index.json` | ✅ карта | метаданные проекта, активные файлы, open issues |
| `changes.jsonl` | ✅ карта | история изменений (по строке на изменение) |
| `summaries/` | ✅ карта | уплотнённая история |
| `patches/*.patch.gz` | ❌ локально | тяжёлый бинарь; воспроизведение — на машине |
| `auto-capture.json` | ❌ локально | per-dev отпечаток + флаг переключателя |
| `session.md` | ❌ локально | производный артефакт, пересобирается каждую сессию |

## Реализованные изменения

### A. Разделяемая карта (map-only)

1. **Авто-генерация `.change-memory/.gitignore` при init**
   (`mcp-server/src/tools/initMemory.ts`): пишет `patches/`,
   `auto-capture.json`, `session.md`. Идемпотентно (не перезаписывает
   существующий файл), бэкфилл для уже инициализированных проектов.
2. **Собственный `.gitignore` репозитория**: вместо `.change-memory/` целиком —
   только три локальных пути (плагин д媛фудит схему).
3. **README**: раздел **Team workflow**, обновлены формулировки Privacy/Security.

### B. Атрибуция автора

1. `mcp-server/src/core/git.ts`: в allow-list добавлены `git config user.name` и
   `git config user.email` (read-only); хелпер `getAuthor(cwd)` → `"Name <email>"`.
2. `types.ts`: опциональное `author?` в `ChangeRecord`; `SCHEMA_VERSION` → `2`
   (старые v1-записи продолжают читаться).
3. `captureChange.ts` (`runCapture`): заполняет `author`; авто-захват наследует.
4. Отображение автора: `listChanges.ts` (новая колонка), `showChange.ts`
   (строка `Author:`), `sessionBuilder.ts` (` (author)` в строке изменения).

### C. Переключатель авто-захвата

1. `autoCaptureChange.ts`: поле `enabled?` в `AutoCaptureState`; ранний
   `skip("auto-capture disabled")` при `enabled === false`. `undefined ⇒ включено`.
   Хелперы состояния экспортированы (`readAutoState`/`writeAutoState`).
2. Новый инструмент `mcp-server/src/tools/setAutoCapture.ts`
   (`set_auto_capture({ enabled?, projectPath? })`), зарегистрирован в
   `mcp-server/src/index.ts`.
3. Новая команда `commands/memory-auto.md` → `/memory-auto on|off|status`.
   Флаг лежит в локальном (gitignored) `auto-capture.json` — не влияет на команду.
4. README: раздел отключения авто-захвата ведёт с `/memory-auto off`.

### D. Тесты, документация, примеры

- `test/sharing.test.mjs`: генерация/идемпотентность `.gitignore`,
  tracked-vs-ignored в git, запись автора, переключатель (off/on + status).
- `skills/change-memory/SKILL.md`: разделы Team sharing и Toggling auto-capture.
- `examples/change-memory/*`: автор в примерах формата.

## Компромисс

Поскольку патчи остаются локальными, коллега может смотреть **метаданные** любого
изменения через `show_change`, но `includePatch: true` работает только для
изменений, захваченных на его машине.

## Проверка

1. `npm run build && npm test` — всё зелёное (23/23, включая 5 новых).
2. Симуляция клона: `init_memory` → `.change-memory/.gitignore` создан;
   `git status` показывает `index.json`/`changes.jsonl` как tracked, а
   `patches/`, `auto-capture.json`, `session.md` — игнорируемыми.
3. Правка файла → `list_changes`/`show_change` показывают автора.
4. `/memory-auto off` → правка → нет нового изменения; `/memory-auto on` → есть;
   `/memory-auto status` сообщает состояние.
