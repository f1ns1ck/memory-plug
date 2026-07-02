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
- ✅ Diff-aware heuristic summaries — the offline summarizer parses the diff to name
  changed symbols and `(+added/-removed)` line counts, instead of a bare file count (0.8.0).
- ✅ Collapse noisy consecutive captures — auto-capture folds a burst on the same branch
  into one evolving change (update-in-place) within `coalesce_window_ms` (0.8.0).
- ✅ Tags + weighted search ranking — optional `tags[]`, `tag` filters on `list`/`search`,
  and field-weighted scoring (summary/tags first) with a recency boost (0.8.0).
- ✅ Automatic session bootstrap — a `SessionStart` hook injects the compact snapshot
  into context at session start / after `/clear`; `/memory-session` no longer needs
  to be run by hand (0.9.0).
- ✅ Lazy host-model enrichment of auto-captures — heuristic-only records carry
  `enriched: false`, the snapshot lists them under **Awaiting Enrichment**, and
  `capture_change({ enrichChangeId, llmSummary, ... })` upgrades one in place (0.9.0).
- ✅ Retrieval evaluation harness — `test/retrievalBenchmark.test.mjs` runs a fixed
  query set over real heuristic summaries and asserts top-1 accuracy ≥ 80% (0.9.0).
- ✅ Whole-word search matching — "auth" no longer hits "author"; camelCase
  identifiers split so "cache" still finds `cacheStore.ts` (0.9.0).

## Capture quality (core)

- **Hold the "capture quality solved" bar.** The trigger that gates offline embeddings
  (see _Decided against_) is measurable now: the retrieval benchmark asserts that on
  heuristic-only summaries a fixed query set retrieves the intended change top-1
  ≥ 80% of the time, and it currently passes on the fixture set. Next: grow the
  fixture/query set from real-world histories so the bar stays honest as it scales.

## Retrieval quality

- **Surface tags + scores in session bootstrap** _(target 0.10.0)_. The 0.8.0 tags and
  weighted score exist but aren't shown at session load; expose them, and consider a
  `search_changes` relevance threshold so weak matches drop out instead of padding the
  result set.

## Friction / quick wins

- **Staged vs. unstaged capture modes** _(target 0.10.0)_. Let capture target
  `git diff --cached` so a checkpoint records exactly what is about to be committed.
- **Settings via `configure` + bootstrap tuning** _(target 0.10.0)_. Extend the
  `configure` tool to edit `max_bootstrap_tokens`, `max_recent_changes`, the
  auto-compact thresholds and the new `coalesce_window_ms` without hand-editing
  `index.json`, and revisit whether the 700-token / 10-change bootstrap defaults are
  right.

## Decided against

- **Offline semantic search (local embeddings).** It would mean a heavy local model
  (onnxruntime / transformers.js) and a vector store, breaking the project's
  no-native-deps / no-network principle — to improve retrieval over a history that
  is small and, today, weakly summarized. It solves the wrong problem; lift keyword
  ranking instead. Revisit only once the **capture-quality bar** (≥ 80% top-result
  retrieval on heuristic summaries, see _Capture quality_) is met and scale demands it.
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
- ✅ Diff-aware эвристические сводки — офлайн-суммаризатор парсит дифф, называет
  изменённые символы и счётчики строк `(+added/-removed)` вместо голого числа файлов (0.8.0).
- ✅ Схлопывание шумных последовательных захватов — авто-захват сворачивает серию правок
  на одной ветке в одно «эволюционирующее» изменение (обновление на месте) в пределах
  `coalesce_window_ms` (0.8.0).
- ✅ Теги + взвешенное ранжирование — опциональные `tags[]`, фильтр `tag` в `list`/`search`
  и взвешенный по полям скоринг (summary/tags важнее) с бонусом за свежесть (0.8.0).
- ✅ Автоматический bootstrap сессии — хук `SessionStart` инжектит компактный снимок
  в контекст при старте сессии / после `/clear`; `/memory-session` больше не нужно
  запускать руками (0.9.0).
- ✅ Ленивое обогащение авто-захватов моделью хоста — записи с одной эвристикой несут
  `enriched: false`, снимок перечисляет их в секции **Awaiting Enrichment**, а
  `capture_change({ enrichChangeId, llmSummary, ... })` обновляет запись на месте (0.9.0).
- ✅ Харнесс оценки извлечения — `test/retrievalBenchmark.test.mjs` гоняет фиксированный
  набор запросов по настоящим эвристическим сводкам и требует top-1 точность ≥ 80% (0.9.0).
- ✅ Матчинг по целым словам — «auth» больше не цепляет «author»; camelCase-идентификаторы
  разбиваются, так что «cache» по-прежнему находит `cacheStore.ts` (0.9.0).

## Качество захвата (ядро)

- **Удерживать планку «качество захвата решено».** Триггер, открывающий офлайн-
  эмбеддинги (см. _Решено не делать_), теперь измерим: бенчмарк извлечения требует,
  чтобы на сводках только из эвристики фиксированный набор запросов возвращал нужное
  изменение первым результатом ≥ 80% случаев — и сейчас он проходит на наборе фикстур.
  Дальше: наращивать фикстуры/запросы из реальных историй, чтобы планка оставалась
  честной с ростом масштаба.

## Качество извлечения

- **Показывать теги + скоринг в bootstrap сессии** _(цель 0.10.0)_. Теги и взвешенный
  скоринг из 0.8.0 есть, но не показываются при загрузке сессии; вывести их и обдумать
  порог релевантности в `search_changes`, чтобы слабые совпадения отсеивались, а не
  раздували выдачу.

## Трение / quick wins

- **Режимы захвата staged vs. unstaged** _(цель 0.10.0)_. Позволить захвату брать
  `git diff --cached`, чтобы чекпойнт фиксировал ровно то, что уходит в коммит.
- **Настройки через `configure` + тюнинг bootstrap** _(цель 0.10.0)_. Расширить
  `configure` редактированием `max_bootstrap_tokens`, `max_recent_changes`, порогов
  авто-компакции и нового `coalesce_window_ms` без ручной правки `index.json`, и
  пересмотреть, верны ли дефолты bootstrap (700 токенов / 10 изменений).

## Решено не делать

- **Офлайн-семантический поиск (локальные эмбеддинги).** Это тяжёлая локальная
  модель (onnxruntime / transformers.js) и векторное хранилище — нарушение принципа
  no-native-deps / no-network ради улучшения извлечения поверх истории, которая мала
  и сегодня слабо суммирована. Решает не ту проблему; лучше поднять keyword-
  ранжирование. Вернуться, только когда достигнута **планка качества захвата** (≥ 80%
  верных верхних результатов на эвристических сводках, см. _Качество захвата_) и масштаб
  этого требует.
- **Классификация feature/fix/refactor по путям.** Путь файла не различает их,
  поэтому угадывание типа для исходного/смешанного изменения променяло бы честный
  `unknown` на уверенно-неверные метки. Вместо этого агент передаёт точный
  `llmType` при осознанных захватах; авто-захват остаётся эвристическим.
- **Убирать закоммиченный `mcp-server/dist/`.** Он коммитится, чтобы плагин работал
  сразу после установки без шага сборки; `.gitattributes` нормализует переводы
  строк, чтобы закоммиченный билд не создавал шум.
