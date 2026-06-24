# Roadmap

_Russian version below — [Дорожная карта](#дорожная-карта)._

The plan is organized by what actually drives this plugin's value, in priority
order: **(1) capture quality** — how meaningful each recorded change is;
**(2) retrieval quality** — whether the right memory surfaces at the right time;
**(3) friction** — convenience and tuning. Capture comes first: there is no point
improving retrieval over weak summaries.

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

## Capture quality (core)

- **Meaningful auto-capture summaries.** The default path — the `PostToolUse` hook —
  still records a file-count heuristic ("Feature change: modified 3 file(s)…"), and
  that fills most of the memory. The richer `llmSummary` only reaches deliberate
  manual captures. The open problem: the hook is a detached CLI with no model
  access, so it can't author a semantic summary the way manual capture can. Design a
  way to get host-model semantics onto auto-captures without breaking the
  no-network / no-keys server guarantee.
- **Collapse noisy consecutive captures.** A 30s debounce still produces many
  near-duplicate records (the dogfood history reached 68 entries on a tiny project).
  Group a burst of edits into one evolving change, or merge consecutive captures
  touching the same files, so the memory carries signal, not keystrokes.

## Retrieval quality (core)

- **Tags/labels + weighted search ranking.** Add an optional `tags[]` to
  `ChangeRecord` (schema-compatible), let capture set them, filter `list`/`search`
  by tag, and rank matches by field weight (summary > files) with a recency boost —
  instead of the current flat term-frequency count.

## Friction / quick wins

- **Staged vs. unstaged capture modes.** Let capture target `git diff --cached` so a
  checkpoint records exactly what is about to be committed.
- **Settings via `configure` + bootstrap tuning.** Extend the `configure` tool to
  edit `max_bootstrap_tokens`, `max_recent_changes` and the auto-compact thresholds
  without hand-editing `index.json`, and revisit whether the 700-token / 10-change
  bootstrap defaults are right.

## Decided against

- **Offline semantic search (local embeddings).** It would mean a heavy local model
  (onnxruntime / transformers.js) and a vector store, breaking the project's
  no-native-deps / no-network principle — to improve retrieval over a history that
  is small and, today, weakly summarized. It solves the wrong problem; lift keyword
  ranking instead. Revisit only if capture quality is solved and scale demands it.
- **Path-based feature/fix/refactor classification.** A file path can't tell these
  apart, so guessing a type for source/mixed changes would trade an honest
  `unknown` for confident-but-wrong labels. The agent supplies an accurate
  `llmType` on deliberate captures instead; auto-capture stays heuristic.
- **Dropping the committed `mcp-server/dist/`.** It is committed so the plugin runs
  on install with no build step; a `.gitattributes` normalizes line endings to keep
  the committed build churn-free.

---

# Дорожная карта

План организован по тому, что реально определяет ценность плагина, в порядке
приоритета: **(1) качество захвата** — насколько осмысленна каждая запись;
**(2) качество извлечения** — всплывает ли нужная память в нужный момент;
**(3) трение** — удобство и тюнинг. Захват первичен: нет смысла улучшать
извлечение поверх слабых сводок.

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

## Качество захвата (ядро)

- **Осмысленные авто-сводки.** Дефолтный путь — хук `PostToolUse` — пишет
  эвристику по числу файлов («Feature change: modified 3 file(s)…»), и именно она
  наполняет почти всю память. Богатый `llmSummary` доступен только осознанным
  ручным захватам. Открытая задача: хук — это детачнутый CLI без доступа к модели,
  поэтому не может написать семантическую сводку, как ручной захват. Нужно
  придумать, как доставить семантику модели хоста на авто-захваты, не нарушив
  гарантию сервера «без сети / без ключей».
- **Схлопывание шумных последовательных захватов.** Дебаунс 30с всё равно плодит
  near-duplicate записи (dogfood-история дошла до 68 записей на крошечном проекте).
  Группировать серию правок в одно «эволюционирующее» изменение или сливать
  последовательные захваты тех же файлов — чтобы память несла сигнал, а не нажатия.

## Качество извлечения (ядро)

- **Теги/метки + взвешенное ранжирование поиска.** Добавить опциональные `tags[]`
  в `ChangeRecord` (совместимо по схеме), позволить захвату их задавать, фильтровать
  `list`/`search` по тегу и ранжировать по весу поля (summary > files) с бонусом за
  свежесть — вместо нынешнего плоского частотного подсчёта.

## Трение / quick wins

- **Режимы захвата staged vs. unstaged.** Позволить захвату брать `git diff --cached`,
  чтобы чекпойнт фиксировал ровно то, что уходит в коммит.
- **Настройки через `configure` + тюнинг bootstrap.** Расширить `configure`
  редактированием `max_bootstrap_tokens`, `max_recent_changes` и порогов
  авто-компакции без ручной правки `index.json`, и пересмотреть, верны ли дефолты
  bootstrap (700 токенов / 10 изменений).

## Решено не делать

- **Офлайн-семантический поиск (локальные эмбеддинги).** Это тяжёлая локальная
  модель (onnxruntime / transformers.js) и векторное хранилище — нарушение принципа
  no-native-deps / no-network ради улучшения извлечения поверх истории, которая мала
  и сегодня слабо суммирована. Решает не ту проблему; лучше поднять keyword-
  ранжирование. Вернуться, только если качество захвата решено и масштаб требует.
- **Классификация feature/fix/refactor по путям.** Путь файла не различает их,
  поэтому угадывание типа для исходного/смешанного изменения променяло бы честный
  `unknown` на уверенно-неверные метки. Вместо этого агент передаёт точный
  `llmType` при осознанных захватах; авто-захват остаётся эвристическим.
- **Убирать закоммиченный `mcp-server/dist/`.** Он коммитится, чтобы плагин работал
  сразу после установки без шага сборки; `.gitattributes` нормализует переводы
  строк, чтобы закоммиченный билд не создавал шум.
