---
name: fly-deploy
description: Deploy a Dockerfile-based app to Fly.io Machines with the flyctl CLI. Use when deploying, updating, or debugging an app on Fly.io, running fly launch / fly deploy, writing fly.toml, or attaching a volume for SQLite. Triggers EN: "deploy to fly", "fly.io", "fly launch", "fly deploy", "fly.toml". Triggers RU: "задеплой на fly", "деплой на fly.io", "разверни на fly", "fly launch", "fly deploy".
---

Деплой Dockerfile-приложения на Fly.io Machines. Полный справочник fly.toml и лестница отладки: [reference/fly-io.md](reference/fly-io.md) — открывай его, когда шаг ссылается на детали конфигурации или когда деплой упал.

## Гардрейлы

- `fly auth login` — шаг пользователя: если браузер не открылся, покажи ссылку из вывода и жди подтверждения. Не пытайся логиниться за пользователя.
- Значения токенов и секретов никогда не печатай и не сохраняй в файлы. Для headless-прогонов используй `FLY_API_TOKEN` из окружения; `fly auth token` для автоматизации не используй (короткоживущий и всемогущий).
- Деструктивные команды (`fly machine destroy`, `fly volumes delete`, `fly secrets unset`, `fly apps destroy`) — только после явного запроса пользователя.

## Шаги

### 1. Предусловия

- Найди CLI: `command -v fly || ls ~/.fly/bin/fly`. Нет — `curl -L https://fly.io/install.sh | sh` и добавь `~/.fly/bin` в PATH.
- Проверь auth: `fly auth whoami`. Ошибка — переходи к `fly auth login` (см. гардрейлы).

Готово, когда `whoami` печатает identity.

### 2. Готовность приложения

- В корне проекта есть `Dockerfile`; приложение стартует автоматически при запуске контейнера, слушает `0.0.0.0:$PORT` (не `127.0.0.1`), есть health-эндпоинт с ответом 200 без редиректа.
- Если доступен Docker: `docker build .` и прогон контейнера с переопределённым `PORT`.

Готово, когда образ собирается, а контейнер отвечает на health-эндпоинте по порту из `PORT`.

### 3. Первый запуск (fly.toml ещё нет)

Из корня проекта, неинтерактивно:

```sh
fly launch --name <repo-name>-<suffix> --region <r> --no-deploy --yes \
  --no-db --no-redis --no-object-storage --dockerfile Dockerfile
```

- Имя глобально уникально: имя репозитория + короткий суффикс; регион — `fly platform regions`.
- SQLite-приложение (один писатель): добавь `--ha=false` — иначе две Machines ⇒ два volume ⇒ split-brain.
- Существующий Dockerfile проекта не заменять и не перегенерировать.
- Нет Dockerfile и не нужен свой — позволь launch сгенерировать, потом правь.

Готово, когда создан `fly.toml` и приложение видно в `fly apps list`.

### 4. Настройка fly.toml

Проверь/выставь (схема и оговорки — в reference):

- `[http_service] internal_port` = порт приложения; `force_https = true`; autostop/autostart по дефолту launch (scale-to-zero).
- `[[http_service.checks]]` на health-эндпоинт; помни: checks не следуют редиректам.
- `[env]`: `PORT` (должен совпадать с `internal_port`) и прочие несекретные переменные; секреты — только `fly secrets set` (каждый set перезапускает Machines — группируй).
- `[[vm]] size = "shared-cpu-1x"` с явной `memory`.
- SQLite: `fly volumes create data -r <primary_region> -s 1`, затем `[mounts] source = "data", destination = "/data"` и `[env] DATABASE_PATH = "/data/<file>.sqlite"`. Одна Machine на volume, всегда. Снапшоты volume — не бэкапы; скажи это пользователю.

Проверка: `fly config validate` зелёный.

### 5. Деплой

`fly deploy` из корня проекта. Стратегия — дефолтный `rolling`; с примонтированным volume canary/bluegreen запрещены платформой. Медленный старт — `--wait-timeout`, а не повторные прогоны.

Готово, когда деплой завершился кодом 0.

### 6. Проверка

- `fly status` — Machines в `started`.
- `fly logs -n` — чистая загрузка, правильный порт.
- `curl -fsS https://<app>.fly.dev/<health>` → 200; затем `fly apps open`.

Готово, когда публичный URL отвечает 200.

### 7. Если сломалось

Лестница по порядку, без слепых повторов: `fly status --all` → `fly logs -n` → `fly checks list` → `fly config validate` → `fly doctor` → локальная пересборка `docker build .` → `fly deploy --depot=false` или `--local-only` → откат: `fly releases --image`, затем `fly deploy --image registry.fly.io/<app>:<tag>` (миграции БД и fly.toml откат не возвращает — предупреди). Классика: 502 — приложение упало или слушает не тот адрес/порт; 503 — нет здоровых Machines.

### 8. Следующие изменения

`fly deploy` из директории проекта — весь цикл обновления. Ничего пересоздавать не нужно.

## Запасной путь без проекта

Только если пользователь просит поднять готовый публичный образ без исходников: `fly apps create --generate-name`, `fly machine run <image> --app <name> --port ...`, затем обязательно `fly ips allocate-v4 --shared` и `fly ips allocate-v6` (у `machine run` нет публичных IP — в отличие от launch/deploy, где Anycast-IP выделяются автоматически). Во всех остальных случаях — путь через `fly launch`.
