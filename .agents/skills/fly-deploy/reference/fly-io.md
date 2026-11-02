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

## Лестница отладки (по порядку)

1. `fly status --all` — состояния Machines.
2. `fly logs -n` — падения процесса, порт, адрес прослушивания.
3. `fly checks list` — health-check failures в логах приложения не видны.
4. `fly config validate` — ошибки fly.toml.
5. `fly doctor` — WireGuard, IP, Docker.
6. `docker build .` локально — ошибка сборки Dockerfile воспроизводится здесь.
7. Сборка висит на Depot → `fly deploy --depot=false` или `--local-only`.
8. Откат по схеме выше.

502 = приложение упало или слушает не тот адрес/порт; 503 = нет здоровых Machines; «not listening on the expected address» = привязка к 127.0.0.1 или несовпадение с `internal_port`. Machine глохнет сразу после старта = процесс завершается (нет CMD / ошибка на старте) — проверить `docker run` локально. Лимит образа 8 ГБ rootfs. Registry 401 при пуше → перелогин или https://status.flyio.net.

## Неинтерактивные флаги (v0.5.1)

- `fly launch`: `--name --region/-r --org --yes/-y --no-deploy --now --generate-name --copy-config --dockerfile --image/-i --internal-port --env/-e --volume/-v --volume-initial-size --vm-size --vm-cpus --vm-memory --vm-cpu-kind --auto-stop --ha --no-public-ips --no-db --no-redis --no-object-storage --no-github-workflow --dockerignore-from-gitignore --path --remote-only/--local-only/--depot`.
- `fly deploy`: `--build-only --image/-i --push --strategy --ha --vm-* --wait-timeout --max-unavailable --env/-e --build-arg --build-secret --build-target --no-cache --local-only/--remote-only/--depot --detach --regions --only-machines --exclude-regions --skip-release-command --release-command-timeout --image-label --now -a -c`. (`-y` у deploy нет.)
- Auth: `fly auth login [--code <code>|-i|--otp]`; токены: `fly tokens create deploy [-a app] [-x 48h]`, `org`, `readonly`, `ssh`; управление `fly tokens list`/`revoke`; CI — `FLY_API_TOKEN` + `flyctl deploy --remote-only`.

## Непроверенное

- Точный текст интерактивных промптов `fly launch` для пути с чистым Dockerfile (флаги проверены, текст — нет, чтобы не мутировать состояние).
- Открывает ли launch веб-страницу «tweak settings» для Dockerfile-сканера в v0.5.1.
- Расхождение: документация пишет `fly version update`, в v0.5.1 это `fly version upgrade`.

У Fly.io есть официальные agent-скиллы (`fly setup agent`, `fly skills install`) и MCP-сервер — если пользователь их установил, они могут дублировать этот скилл.
