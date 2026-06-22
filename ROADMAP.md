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

**Next (priority order)**

- Automatic `compact_memory` on a size/age threshold.

**Later**

- Optional offline semantic search (local embeddings, no cloud).
- Staged vs. unstaged capture modes.
- Configurable token budgets and constraints via `index.json` editing helpers.
- Tags/labels and richer search ranking.

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

**Дальше (по приоритету)**

- Автоматический `compact_memory` по порогу размера/возраста.

**Позже**

- Опциональный офлайн-семантический поиск (локальные эмбеддинги, без облака).
- Режимы захвата staged vs. unstaged.
- Настраиваемые бюджеты токенов и ограничения через хелперы редактирования
  `index.json`.
- Теги/метки и более богатое ранжирование поиска.
