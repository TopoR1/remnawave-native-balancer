# Remnawave Native Host Balancer

Это форк Remnawave с нативной балансировкой на уровне `Host`. Изменения находятся в backend и frontend Remnawave: оператор настраивает балансировку прямо в панели, а backend выбирает целевой узел до генерации подписки.

Нативный `Host Balancer` не является отдельной страницей подписки и не переписывает уже готовый текст подписки. Балансировка выполняется внутри backend Remnawave перед генерацией подписки: для публичного `Host` выбирается один из внутренних targets, после чего генератор подписки получает уже подмененные `address`, `port`, `sni`, `host` и `path`.

Пользователь при этом продолжает видеть публичный remark исходного `Host`. Меняется только техническая цель подключения: адрес, порт и при необходимости TLS/WebSocket поля берутся из выбранного target.

## Отличие от remnawave-subscription-page-with-balancer

`remnawave-subscription-page-with-balancer` работает снаружи Remnawave: отдельная страница подписки получает или отдает подписку и меняет ее на своем уровне.

Этот форк работает внутри Remnawave:

- выбор target происходит в backend до сборки подписки;
- панель Remnawave содержит секцию `Balancing` в форме `Host`;
- старый внешний балансировщик не нужен для генерации подписок;
- публичный `Host` и его remark остаются точкой, которую видит пользователь;
- выбранный target меняет внутренние поля `address`, `port`, `sni`, `host`, `path`.

## Структура репозитория

- `backend` - backend Remnawave с модулем `Host Balancer`, Prisma-миграциями, API и логикой выбора target при генерации подписки.
- `frontend` - панель Remnawave с секцией `Balancing` в форме создания и редактирования `Host`.
- `node` - код Remnawave Node, в этом форке не является основной точкой балансировки.
- `panel` - документация и сайт панели Remnawave.
- `TESTING_HOST_BALANCER.md` - подробный русский регламент для проверки, диагностики и отката `Host Balancer`.
- `Dockerfile` - корневой рабочий Dockerfile, который собирает локальный frontend и backend в один образ.

Важно: рабочий Docker-образ для этого форка нужно собирать из корня репозитория. `backend/Dockerfile` оставлен как совместимый с upstream вариант и может скачать официальный frontend zip без секции `Balancing`.

```bash
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

Frontend currently uses ESLint 9 with `legacy-peer-deps=true` in `frontend/.npmrc` because
`eslint-config-airbnb-base@15` declares an ESLint 7/8 peer range. This affects install-time
peer resolution only.

## Установка на существующий сервер Remnawave

Команды ниже рассчитаны на сервер, где Remnawave установлен в `/opt/remnawave`. Перед началом замените имена контейнеров, compose-файлов и домены на свои, если ваша установка отличается.

### 1. Сделайте резервные копии

Сохраните конфиги Remnawave:

```bash
sudo mkdir -p /opt/remnawave-backups
sudo tar -C /opt -czf /opt/remnawave-backups/remnawave-configs-$(date +%F-%H%M%S).tar.gz remnawave
```

Сохраните PostgreSQL в формате custom dump:

```bash
cd /opt/remnawave
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > /opt/remnawave-backups/remnawave-db-before-native-balancer.dump
```

Если PostgreSQL находится не в compose-проекте Remnawave:

```bash
PGPASSWORD='<password>' pg_dump -h <db-host> -p <db-port> -U <db-user> -d <db-name> -Fc -f /opt/remnawave-backups/remnawave-db-before-native-balancer.dump
```

### 2. Отключите старый внешний балансировщик

Остановите и удалите старый `remnawave-subscription-page-with-balancer`, если он был установлен отдельным compose-проектом:

```bash
cd /opt/remnawave-subscription-page-with-balancer
docker compose down
```

Временно сохраните старый volume `topor-balancer`, пока новый вариант не проверен:

```bash
docker volume ls | grep topor-balancer
```

Не удаляйте этот volume на этапе миграции. Он может пригодиться для ручной сверки старых настроек.

Верните маршрут `subs.topornet.com` на обычную `remnawave-subscription-page` или на стандартный endpoint подписки Remnawave. После перехода на нативный балансировщик домен подписки не должен вести на старый внешний балансировщик.

### 3. Склонируйте форк и соберите образ

```bash
cd /opt
git clone https://github.com/TopoR1/remnawave-native-balancer.git
cd /opt/remnawave-native-balancer
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

Проверьте, что в образ попал локальный frontend:

```bash
docker run --rm topor/remnawave-backend:native-balancer sh -lc "find /opt/app/frontend -type f | grep -E 'assets|index.html' | head"
```

### 4. Подключите образ через override

Создайте `/opt/remnawave/docker-compose.override.yml`:

```yaml
services:
  remnawave:
    image: topor/remnawave-backend:native-balancer
    environment:
      HOST_BALANCER_ENABLED: "false"
      HOST_BALANCER_DECISIONS_ENABLED: "false"
```

Если в вашем compose backend-сервис называется не `remnawave`, укажите фактическое имя сервиса. Его можно посмотреть командой:

```bash
cd /opt/remnawave
docker compose config --services
```

На первом запуске оставьте `HOST_BALANCER_ENABLED=false`. Это глобальный аварийный выключатель: при значении `false` генерация подписки идет как в обычном Remnawave.

### 5. Запустите Remnawave и проверьте панель

```bash
cd /opt/remnawave
docker compose up -d
docker compose ps
docker compose logs --tail=100 remnawave
```

Откройте панель Remnawave и убедитесь, что вход работает. Затем откройте `Hosts` и проверьте, что форма `Host` содержит секцию `Balancing`. До отдельного тестового окна не включайте глобальный `HOST_BALANCER_ENABLED=true`.

## Чистая установка

Для новой установки используйте обычную схему Remnawave, но backend-образ соберите из этого репозитория.

```bash
cd /opt
git clone https://github.com/TopoR1/remnawave-native-balancer.git
cd /opt/remnawave-native-balancer
```

Подготовьте `.env` по примеру Remnawave. Обычно основа находится в `backend/.env.sample`; перенесите значения в compose-проект установки и задайте PostgreSQL, JWT, домены панели и подписок.

Если ваша версия compose-файлов поддерживает setup-команду Remnawave, выполните ее по официальной инструкции Remnawave:

```bash
docker compose run --rm remnawave npm run setup
```

Если setup-команда в вашем compose-файле не предусмотрена, настройте `.env` вручную и переходите к сборке образа:

```bash
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

В compose-файле или `docker-compose.override.yml` укажите этот образ для backend-сервиса и сначала задайте:

```env
HOST_BALANCER_ENABLED=false
HOST_BALANCER_DECISIONS_ENABLED=false
```

Примените миграции:

```bash
docker compose run --rm remnawave npx prisma migrate deploy
```

Запустите сервисы:

```bash
docker compose up -d
docker compose ps
```

После первого входа в панель проверьте обычные функции Remnawave с выключенным балансировщиком, и только потом включайте балансировку на одном тестовом `Host`.

## Миграция базы данных

Перед миграцией проверьте текущую БД и статус миграций:

```bash
cd /opt/remnawave
docker compose ps
docker compose run --rm remnawave npx prisma migrate status
```

Сделайте свежую резервную копию:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > /opt/remnawave-backups/remnawave-db-before-host-balancer-migrations.dump
```

Примените миграции:

```bash
docker compose run --rm remnawave npx prisma migrate deploy
```

Миграции добавляют таблицы:

- `host_balancers`
- `host_balancer_targets`
- `host_balancer_assignments`
- `host_balancer_decisions`

Проверьте таблицы через SQL:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt host_balancer*"
```

Быстрая проверка счетчиков:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select count(*) from "host_balancers";'
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select count(*) from "host_balancer_targets";'
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select count(*) from "host_balancer_assignments";'
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'select count(*) from "host_balancer_decisions";'
```

## Тестирование

Подробный сценарий находится в [TESTING_HOST_BALANCER.md](TESTING_HOST_BALANCER.md).

Минимальный безопасный порядок:

1. Оставьте `HOST_BALANCER_ENABLED=false`.
2. Получите подписку тестового пользователя и сохраните результат.
3. Убедитесь, что после установки нового образа подписка не изменилась.
4. В панели включите балансировку только на одном тестовом `Host`.
5. Добавьте два targets с разными `overrideAddress` и `overridePort`.
6. Установите `HOST_BALANCER_ENABLED=true` и перезапустите backend.
7. Получите подписку через `curl`.
8. Декодируйте подписку Python-скриптом.
9. Проверьте, что remark остался публичным именем `Host`.
10. Проверьте, что host/port в ссылке поменялись на выбранный target.
11. Проверьте assignment в таблице `host_balancer_assignments`.

Пример получения подписки:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o balanced.txt
```

Пример декодирования:

```bash
python3 - <<'PY'
import base64
from pathlib import Path

raw = Path("balanced.txt").read_bytes().strip()
try:
    decoded = base64.b64decode(raw + b"=" * (-len(raw) % 4), validate=False).decode()
except Exception:
    decoded = raw.decode()

print(decoded)
PY
```

Пример проверки assignment:

```sql
select
  a."host_uuid",
  a."user_uuid",
  a."target_uuid",
  t."override_address",
  t."override_port",
  a."reason",
  a."last_used_at"
from "host_balancer_assignments" a
join "host_balancer_targets" t on t."uuid" = a."target_uuid"
where a."host_uuid" = '<hostUuid>'
  and a."user_uuid" = '<userUuid>';
```

## Откат

### Мягкий откат

Самый быстрый и предпочтительный вариант - выключить глобальный аварийный выключатель:

```env
HOST_BALANCER_ENABLED=false
```

Перезапустите backend:

```bash
docker compose up -d --no-deps remnawave
```

Настройки балансировщика и assignments останутся в БД, но генерация подписок перестанет использовать `HostBalancerService`.

### Откат образа

Верните официальный backend-образ Remnawave:

```yaml
services:
  remnawave:
    image: remnawave/backend:2
    environment:
      HOST_BALANCER_ENABLED: "false"
```

Перезапустите сервис:

```bash
docker compose up -d --no-deps remnawave
```

Если имя backend-сервиса другое, используйте его вместо `remnawave`.

### Откат базы данных

Восстановление БД используйте только как последнюю меру: оно откатывает не только настройки балансировщика, но и все изменения данных после резервной копии.

```bash
docker compose stop remnawave
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < /opt/remnawave-backups/remnawave-db-before-native-balancer.dump
docker compose up -d
```

## Диагностика

### Панель открывается, но секции Balancing нет

Скорее всего, образ содержит официальный frontend zip вместо локального frontend из этого форка. Соберите образ из корневого `Dockerfile`, а не из `./backend`:

```bash
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

После пересборки перезапустите backend и очистите кэш браузера.

### API уходит в restart loop с JwtDefaultGuard или QueryBus

Это обычно означает проблему dependency injection в NestJS: модуль, где используется guard, controller, query или service, не импортирует нужный module/provider. Проверьте, что модуль `Host Balancer` подключен в backend-модулях Remnawave, а зависимости вроде `CqrsModule`, guard-модулей и сервисов доступны в том NestJS module, где они используются.

### Подписка не изменилась

Проверьте три уровня включения:

- `HOST_BALANCER_ENABLED=true` в окружении backend;
- балансировка включена на конкретном `Host`;
- у `Host` есть включенные targets со статусом `ACTIVE` или подходящим статусом для закрепленного assignment.

Также проверьте, что вы тестируете пользователя, которому доступен именно этот `Host`.

### Host пропал из подписки

Проверьте `unavailablePolicy` и список candidates. Если политика `HIDE_HOST`, а подходящих targets нет, исходный `Host` может быть скрыт. Для проверки можно временно поставить `ORIGINAL_HOST` или вернуть хотя бы один target в `ACTIVE`.

### Стратегия по трафику не меняет старых пользователей

Закрепленные assignments по умолчанию не ребалансируются стратегиями трафика. Уже назначенный пользователь останется на прежнем target, пока target валиден. Проверяйте стратегии `LEAST_TRAFFIC` и `WEIGHTED_LEAST_TRAFFIC` на новых тестовых пользователях или включайте отдельную настройку ребалансировки существующих assignments, если она используется в вашей сборке.
