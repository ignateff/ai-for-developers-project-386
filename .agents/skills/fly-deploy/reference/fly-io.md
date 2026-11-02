# Справочник Fly.io для скилла fly-deploy

Источник фактов: docs.fly.io + `fly --help` (v0.5.1), собрано в исследовании 2026-11-02. Документация и CLI могут расходиться — при сомнениях доверяй локальному `fly <cmd> --help`.

## fly.toml (Machines / Apps V2)

```toml
app = "my-app"                    # первый ключ; даёт hostname <app>.fly.dev
primary_region = "fra"            # где fly deploy создаёт новые Machines

[build]
dockerfile = "Dockerfile"         # путь не меняет build context (он всегда корень проекта)

[env]
PORT = "8080"                     # только строки; имена не с FLY_; секреты переопределяют
DATABASE_PATH = "/data/app.sqlite"

[http_service]
internal_port = 8080              # должен совпадать с портом приложения
force_https = true                # 301 HTTP→HTTPS; только на http-обработчиках
auto_stop_machines = "stop"       # "off" | "stop" | "suspend"
auto_start_machines = true        # включать/выключать парой с auto_stop
min_machines_running = 0          # только primary-регион

  [[http_service.checks]]
  grace_period = "10s"            # время на старт приложения
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/api/health"            # эндпоинт с 200 без редиректов — checks за редиректами НЕ следуют

[[vm]]
size = "shared-cpu-1x"            # пресеты: fly platform vm-sizes
memory = "512mb"

[mounts]
source = "data"                   # volume с этим именем должен существовать в регионе
destination = "/data"             # не "/"
snapshot_retention = 5            # дни, 1–60

[deploy]
strategy = "rolling"              # с volume только rolling|immediate; canary/bluegreen запрещены
```

Проверка: `fly config validate`.

## Ключевые факты

- **Сеть.** `[http_service]` даёт Anycast IPv6 + shared IPv4 автоматически на первом `fly deploy`; `fly ips allocate-*` нужен только для пути `fly machine run`. Fly Proxy слушает 80/443 и шлёт на `internal_port`; TLS терминируется на границе, к Machine идёт plaintext; приложение обязано слушать `0.0.0.0`. Прокси добавляет `X-Forwarded-Proto`, `Fly-Client-IP` и др.
- **Machines.** Холодный старт из `stopped` ≈ 2 с+; `suspended` быстрее, но со сдвигом часов (ломает JWT/cron/TTL/TLS сразу после resume — для таких приложений `stop`, не `suspend`). Autostop не создаёт/не удаляет Machines. Застрявшая: >5 мин в `starting`/`stopping`/`destroying`, >10 мин в `updating`.
- **Volumes.** Один volume ↔ одна Machine; локальный NVMe, привязан к региону, без репликации. Ежедневные снапшоты (5 дней дефолт) — не бэкап-стратегия. Volumes только растут, не уменьшаются. Недоступны при сборке и в `release_command`. Тарифицируются за полный размер даже на остановленной Machine. Создание: `fly volumes create <name> -r <region> -s 1`; восстановление: `fly volumes create <name> --snapshot-id <id> -r <region>`.
- **Секреты.** `fly secrets set NAME=VALUE` (или stdin) — каждый вызов перезапускает Machines; `--stage` откладывает до следующего деплоя. `fly secrets list` показывает имена и дайджесты, значения нечитаемы. На этапе сборки секретов нет — `--build-secret` / `[build.args]`.
- **Деплой.** Образ по приоритету: `--image` → `[build]` → `--dockerfile` → `./Dockerfile`. Дымовые проверки ~10 с после старта Machine; повторные падения останавливают деплой. Отката-команды нет: `fly releases --image` + `fly deploy --image registry.fly.io/<app>:<tag>`; `--image-label` для читаемых меток.
- **Наблюдение.** `fly status [--all|--watch]`, `fly machines list`, `fly logs [-n|-m <machine>|-r <region>]`, `fly checks list`, `fly ssh console [-C "cmd"]`.

## Диагностика и восстановление

Зафиксируй время, версию `fly version`, этап, endpoint и ошибку без секретов; проверь [статус Fly.io](https://status.flyio.net/) и соответствующую ветку. EOF или timeout не устанавливает первопричину и не доказывает, что сервер не выполнил запрос.

1. **Fly API недоступен:** проверь `fly status --all`, доступность API и статус сервиса; безопасное чтение можно повторить ограниченное число раз с задержкой. Различай сетевой EOF и полученный HTTP-ответ. `fly doctor` помогает с диагностикой, но ошибка агента не доказывает причину EOF. Смена builder не обходит Machines API.
2. **Depot недоступен до сборки:** после сверки состояния попробуй `fly deploy --local-only` при работающем Docker или `--depot=false` для legacy remote builder ([Fly troubleshooting](https://docs.fly.io/getting-started/troubleshooting/#build-hangs-waiting-for-depot-builder)). Локальной сборке нужны ресурсы, сеть для зависимостей и registry; проверь совместимость архитектуры образа и нативных зависимостей с целевой Machine. Удалённый builder может требовать ресурсов и не обязан быть доступен. Оба варианта зависят от registry и Machines API. Используй тот же проверенный build context.
3. **Ошибка сборки:** изучи вывод сборки и `fly config validate`; при необходимости воспроизведи локально с тем же контекстом и Dockerfile. `--no-cache` не исправляет сетевой handshake.
4. **Обновление или запуск:** проверь `fly status --all`, `fly machines list`, `fly releases --image`, `fly checks list`, `fly logs -n` и `fly machine status <id>`. Сопоставь образ и события каждой целевой Machine; появление релиза не доказывает завершение rollout. При autostop `stopped` допустим, а `started` не гарантирует здоровье.

**Неизвестный исход мутации:** до повтора сверь состояние релизов и всех Machines, конфигурацию и возможные побочные эффекты `release_command` (включая миграции). Если чтение API недоступно или состояние нельзя установить, остановись и сообщи пользователю. Не выполняй параллельные деплои и не предполагай идемпотентность release command. Если повтор нужен и безопасен, выполняй его последовательно и снова проверь результат. Откат — отдельное изменение production: старый образ не откатывает миграции, конфигурацию или секреты; проверь совместимость данных и доступность образа. Не пересоздавай Machine или volume для устранения EOF.

502 = приложение упало или слушает не тот адрес/порт; 503 = нет здоровых Machines; «not listening on the expected address» = привязка к 127.0.0.1 или несовпадение с `internal_port`. Machine глохнет сразу после старта = процесс завершается (нет CMD / ошибка на старте) — проверить `docker run` локально. Лимит образа 8 ГБ rootfs. Registry 401 при пуше → перелогин или https://status.flyio.net.

## Флаги CLI

Доступные флаги и значения по умолчанию проверяй в локальном `fly <command> --help`: версии CLI и документации могут различаться. Не сохраняй токены и секреты в диагностических логах.

## Непроверенное

- Точный текст интерактивных промптов `fly launch` для пути с чистым Dockerfile (флаги проверены, текст — нет, чтобы не мутировать состояние).
- Открывает ли launch веб-страницу «tweak settings» для Dockerfile-сканера в v0.5.1.
- Расхождение: документация пишет `fly version update`, в v0.5.1 это `fly version upgrade`.

У Fly.io есть официальные agent-скиллы (`fly setup agent`, `fly skills install`) и MCP-сервер — если пользователь их установил, они могут дублировать этот скилл.
