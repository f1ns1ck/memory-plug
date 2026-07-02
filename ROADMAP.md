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

## Capture quality (core)

- **Lazy host-model enrichment of auto-captures** _(target 0.9.0)_. Diff-aware
  heuristics (0.8.0) lifted the default summary past a file count, but the richest
  semantic summary (`llmSummary`) still only reaches deliberate manual captures — the
  `PostToolUse` hook is a detached CLI with no model access. The fix keeps the hook
  heuristic and enriches **after the fact**: on the next session load, surface recent
  heuristic-only records to the host model (via `get_session_context` / a skill
  prompt), let the agent write `llmSummary`/`llmRisk`/`llmType`, and update those
  records in place through the existing `capture_change` enrichment path —
  `mergeAgentSummary` already merges agent-over-heuristic. The server still makes no
  network call and holds no keys. Steps: (a) mark records `enriched: false` at
  heuristic capture; (b) a retrieval/skill step that lists the un-enriched recent
  records; (c) reuse `mergeAgentSummary` to apply the agent fields and flip the flag.
- **Define "capture quality solved."** The trigger that gates offline embeddings (see
  _Decided against_) needs a measurable bar. Anchor it to the retrieval harness below:
  _on heuristic-only summaries, a fixed query set retrieves the intended change as the
  top result ≥ 80% of the time._ Until that holds, keep lifting capture, not retrieval.

## Retrieval quality

- **Retrieval evaluation harness** _(target 0.9.0)_. Promote
  `test/captureRetrievalQuality.test.mjs` into a small fixture-based benchmark
  (query → expected top change) so ranking changes are measured, not eyeballed. This
  is the measurement backbone for both the capture-quality bar above and any future
  ranking work.
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

## Качество захвата (ядро)

- **Ленивое обогащение авто-захватов моделью хоста** _(цель 0.9.0)_. Diff-aware
  эвристика (0.8.0) подняла дефолтную сводку выше числа файлов, но самый богатый
  семантический `llmSummary` по-прежнему доступен только осознанным ручным захватам —
  хук `PostToolUse` это детачнутый CLI без доступа к модели. Решение оставляет хук
  эвристическим и обогащает **постфактум**: при следующей загрузке сессии показать
  модели хоста свежие записи с одной лишь эвристикой (через `get_session_context` /
  промпт скилла), дать агенту написать `llmSummary`/`llmRisk`/`llmType` и обновить эти
  записи на месте через уже существующий путь обогащения `capture_change` —
  `mergeAgentSummary` уже мёржит «агент поверх эвристики». Сервер по-прежнему не делает
  сетевых вызовов и не хранит ключей. Шаги: (a) помечать записи `enriched: false` при
  эвристическом захвате; (b) шаг извлечения/скилла, перечисляющий необогащённые свежие
  записи; (c) переиспользовать `mergeAgentSummary`, чтобы применить поля агента и
  переключить флаг.
- **Определить, что значит «качество захвата решено».** Триггер, открывающий офлайн-
  эмбеддинги (см. _Решено не делать_), нуждается в измеримой планке. Привязать её к
  харнессу извлечения ниже: _на сводках только из эвристики фиксированный набор запросов
  возвращает нужное изменение первым результатом ≥ 80% случаев._ Пока не достигнуто —
  поднимаем захват, а не извлечение.

## Качество извлечения

- **Харнесс оценки извлечения** _(цель 0.9.0)_. Превратить
  `test/captureRetrievalQuality.test.mjs` в небольшой бенчмарк на фикстурах
  (запрос → ожидаемое верхнее изменение), чтобы изменения ранжирования измерялись, а не
  оценивались на глаз. Это измерительная основа и для планки качества захвата выше, и
  для будущей работы над ранжированием.
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
