# Roadmap

_Russian version below — [Дорожная карта](#дорожная-карта)._

**Shipped**

- ✅ Team-shareable map with author attribution (0.2.0).
- ✅ Opt-in patch sharing + consolidated slash commands (0.3.0).
- ✅ Automatic capture via `PostToolUse` hook, with per-machine toggle.
- ✅ Branch/commit awareness + `summarize_branch` PR summaries.
- ✅ Opt-in agent-authored summaries on manual capture — the host model writes a
  richer `summary`/`risk`/`type`; the server still makes **no network call** and
  the offline heuristic remains the default. Auto-capture stays heuristic.
- ✅ Per-file patch retrieval in `show_change` — pass `file: "<substring>"` to load
  a single file's hunk instead of the whole diff (0.5.0).
- ✅ Automatic `compact_memory` on a size threshold — captures transparently archive
  old changes once active history passes `auto_compact_after_changes` (0.6.0).
- ✅ Excluded the memory store from its own diffs + tightened risk heuristics (0.6.1).
- ✅ Smaller MCP tool surface — `set_auto_capture`/`set_share_patches` folded into one
  `configure`; `auto_capture_change` dropped from the exposed tools (0.7.0).

**Later**

- Optional offline semantic search (local embeddings, no cloud).
- Staged vs. unstaged capture modes.
- Configurable token budgets and constraints via `index.json` editing helpers.
- Tags/labels and richer search ranking.

**Decided against**

- Path-based feature/fix/refactor classification. A file path can't tell these
  apart, so guessing a type for source/mixed changes would trade an honest
  `unknown` for confident-but-wrong labels. The agent supplies an accurate
  `llmType` on deliberate captures instead; auto-capture stays heuristic.
- Dropping the committed `mcp-server/dist/`. It is committed so the plugin runs
  on install with no build step; a `.gitattributes` normalizes line endings to
  keep the committed build churn-free.

---

# Дорожная карта

**Уже сделано**

- ✅ Командная карта с атрибуцией автора (0.2.0).
- ✅ Opt-in шаринг патчей + объединённые slash-команды (0.3.0).
- ✅ Автоматический захват через хук `PostToolUse`, с тумблером на машину.
- ✅ Осведомлённость о ветке/коммите + PR-сводки `summarize_branch`.
- ✅ Opt-in сводки, написанные агентом, при ручном захвате — модель хоста пишет
  более богатые `summary`/`risk`/`type`; сервер **не делает сетевых вызовов**, а
  офлайн-эвристика остаётся дефолтом. Авто-захват остаётся эвристическим.
- ✅ Получение патча по файлу в `show_change` — передайте `file: "<подстрока>"`,
  чтобы загрузить ханк одного файла вместо всего диффа (0.5.0).
- ✅ Автоматический `compact_memory` по порогу размера — захваты прозрачно
  архивируют старые изменения, когда активная история превышает
  `auto_compact_after_changes` (0.6.0).
- ✅ Память исключена из собственных диффов + ужесточены риск-эвристики (0.6.1).
- ✅ Меньше MCP-инструментов — `set_auto_capture`/`set_share_patches` объединены в
  `configure`; `auto_capture_change` убран из публичных инструментов (0.7.0).

**Позже**

- Опциональный офлайн-семантический поиск (локальные эмбеддинги, без облака).
- Режимы захвата staged vs. unstaged.
- Настраиваемые бюджеты токенов и ограничения через хелперы редактирования
  `index.json`.
- Теги/метки и более богатое ранжирование поиска.

**Решено не делать**

- Классификация feature/fix/refactor по путям. Путь файла не различает их, поэтому
  угадывание типа для исходного/смешанного изменения променяло бы честный
  `unknown` на уверенно-неверные метки. Вместо этого агент передаёт точный
  `llmType` при осознанных захватах; авто-захват остаётся эвристическим.
- Убирать закоммиченный `mcp-server/dist/`. Он коммитится, чтобы плагин работал
  сразу после установки без шага сборки; `.gitattributes` нормализует переводы
  строк, чтобы закоммиченный билд не создавал шум.
