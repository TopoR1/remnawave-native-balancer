# Регламент тестирования и отката Host Balancer

Этот документ описывает безопасную проверку нативной балансировки `Host` на реальной или близкой к рабочей установке Remnawave. Функция защищена глобальным аварийным выключателем `HOST_BALANCER_ENABLED`; до начала тестового окна он должен оставаться в значении `false`.

Замените `<api-domain>`, `<hostUuid>`, `<userUuid>`, `<shortUuid>`, `<db-container>`, `<token>` и имена сервисов на значения вашей установки.

## 1. Предварительная проверка

Перед изменениями:

1. Назначьте тестовое окно.
2. Выберите одного тестового пользователя и один тестовый `Host`.
3. Сделайте резервную копию базы данных.
4. Зафиксируйте текущие версии и теги образов.
5. Соберите новый образ из корневого `Dockerfile`.
6. Убедитесь, что `HOST_BALANCER_ENABLED=false` задан по умолчанию.

Резервная копия PostgreSQL:

```bash
cd /opt/remnawave
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > remnawave-before-host-balancer.dump
```

Если PostgreSQL находится отдельно:

```bash
PGPASSWORD='<password>' pg_dump -h <db-host> -p <db-port> -U <db-user> -d <db-name> -Fc -f remnawave-before-host-balancer.dump
```

Проверка сервисов и образов:

```bash
docker compose ps
docker compose images
docker image inspect <backend-image>:<tag> --format '{{.Id}} {{.Created}}'
```

Проверка аварийного выключателя:

```bash
docker compose config | grep HOST_BALANCER_ENABLED
```

Ожидаемое значение до тестирования:

```env
HOST_BALANCER_ENABLED=false
```

## 2. Сборка и подключение образа

Собирать рабочий Docker-образ нужно из корня репозитория:

```bash
cd /opt/remnawave-native-balancer
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

Корневой `Dockerfile` собирает локальный `./frontend` и локальный `./backend`, затем кладет frontend в `/opt/app/frontend`. Это важно: `backend/Dockerfile` может скачать официальный frontend zip, в котором нет секции `Balancing`.

Проверка frontend внутри образа:

```bash
docker run --rm topor/remnawave-backend:native-balancer sh -lc "find /opt/app/frontend -type f | grep -E 'assets|index.html' | head"
```

Пример `/opt/remnawave/docker-compose.override.yml`:

```yaml
services:
  remnawave:
    image: topor/remnawave-backend:native-balancer
    environment:
      HOST_BALANCER_ENABLED: "false"
      HOST_BALANCER_DECISIONS_ENABLED: "false"
```

Если backend-сервис называется иначе, подставьте фактическое имя:

```bash
docker compose config --services
```

Перезапустите backend с выключенной балансировкой:

```bash
cd /opt/remnawave
docker compose up -d --no-deps remnawave
docker compose ps
docker compose logs --tail=100 remnawave
```

## 3. Миграции базы данных

Проверьте статус миграций:

```bash
docker compose run --rm remnawave npx prisma migrate status
```

Примените миграции:

```bash
docker compose run --rm remnawave npx prisma migrate deploy
```

Миграции добавляют таблицы:

```text
host_balancers
host_balancer_targets
host_balancer_assignments
host_balancer_decisions
```

Проверьте, что таблицы появились:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt host_balancer*"
```

Проверьте структуру основных таблиц:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d host_balancers"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d host_balancer_targets"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d host_balancer_assignments"
```

Быстрые SQL-проверки:

```sql
select count(*) as host_balancers from "host_balancers";
select count(*) as host_balancer_targets from "host_balancer_targets";
select count(*) as host_balancer_assignments from "host_balancer_assignments";
select count(*) as host_balancer_decisions from "host_balancer_decisions";
```

## 4. Проверка режима HOST_BALANCER_ENABLED=false

До включения балансировщика получите подписку тестового пользователя:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o before.txt
```

После установки нового образа, но при `HOST_BALANCER_ENABLED=false`, получите подписку снова:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o after-disabled.txt
```

Сравните файлы:

```bash
cmp before.txt after-disabled.txt
```

Ожидаемый результат: различий нет. При `HOST_BALANCER_ENABLED=false` backend не вызывает `HostBalancerService` во время генерации подписки.

## 5. Настройка одного тестового Host

Используйте только один тестовый `Host` и одного тестового пользователя.

Через панель:

1. Откройте `Hosts`.
2. Создайте тестовый `Host` или отредактируйте не критичный `Host`.
3. Откройте секцию `Balancing`.
4. Включите балансировку для этого `Host`.
5. Для первого теста выберите стратегию `LEAST_ASSIGNED`.
6. Оставьте закрепленные assignments включенными.
7. Установите `unavailablePolicy=HIDE_HOST`.
8. Добавьте два targets.
9. Для каждого target задайте `overrideAddress` и `overridePort`.
10. Сохраните `Host`.

Пример targets:

```text
Target A:
  nodeUuid: <node-a-uuid>
  overrideAddress: edge-a.example.com
  overridePort: 443
  weight: 1
  priority: 10
  status: ACTIVE

Target B:
  nodeUuid: <node-b-uuid>
  overrideAddress: edge-b.example.com
  overridePort: 443
  weight: 1
  priority: 20
  status: ACTIVE
```

API-вариант включения:

```bash
curl -sS -X PUT "https://<api-domain>/api/host-balancers/<hostUuid>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "strategy": "LEAST_ASSIGNED",
    "unavailablePolicy": "HIDE_HOST",
    "stickyEnabled": true
  }'
```

API-вариант targets:

```bash
curl -sS -X PUT "https://<api-domain>/api/host-balancers/<hostUuid>/targets" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [
      {
        "nodeUuid": "<node-a-uuid>",
        "enabled": true,
        "status": "ACTIVE",
        "weight": 1,
        "priority": 10,
        "overrideAddress": "edge-a.example.com",
        "overridePort": 443
      },
      {
        "nodeUuid": "<node-b-uuid>",
        "enabled": true,
        "status": "ACTIVE",
        "weight": 1,
        "priority": 20,
        "overrideAddress": "edge-b.example.com",
        "overridePort": 443
      }
    ]
  }'
```

## 6. Включение глобального балансировщика

Включайте аварийный выключатель только после настройки тестового `Host`:

```env
HOST_BALANCER_ENABLED=true
```

Перезапустите backend:

```bash
docker compose up -d --no-deps remnawave
docker compose logs --tail=100 remnawave
```

Проверьте, что переменная попала в compose:

```bash
docker compose config | grep HOST_BALANCER_ENABLED
```

## 7. Проверка подписки

Получите подписку:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o balanced.txt
```

Декодируйте base64:

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

Если Python недоступен:

```bash
base64 -d balanced.txt > balanced.decoded.txt
cat balanced.decoded.txt
```

Ожидаемое поведение:

- remark в VLESS-ссылке остается публичным remark исходного `Host`;
- address и port берутся из выбранного target;
- если target переопределяет `sni`, `host` или `path`, в ссылке будут значения target;
- готовая подписка не постобрабатывается: backend меняет поля `Host` до resolver/generator.

Пример ожидаемой формы:

```text
vless://...@edge-a.example.com:443?...#Public%20Host%20Remark
```

## 8. Проверка assignments в БД

Предварительный просмотр выбора без записи assignment:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/preview?userUuid=<userUuid>" \
  -H "Authorization: Bearer <token>"
```

Предварительный просмотр также принимает `shortUuid`:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/preview?shortUuid=<shortUuid>" \
  -H "Authorization: Bearer <token>"
```

Если переданы и `userUuid`, и `shortUuid`, используется `userUuid`. Если оба параметра отсутствуют, API возвращает `400`.

Проверьте статистику:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/stats" \
  -H "Authorization: Bearer <token>"
```

Для краткого тестового окна можно включить аудит решений:

```env
HOST_BALANCER_DECISIONS_ENABLED=true
```

После перезапуска backend прочитайте последние решения:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/decisions?limit=50" \
  -H "Authorization: Bearer <token>"
```

Проверьте assignment после реального запроса подписки:

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

Проверка закрепленного поведения:

1. Запросите подписку один раз.
2. Запомните `target_uuid`.
3. Запросите подписку повторно.
4. `target_uuid` должен остаться прежним, пока target валиден и закрепленные assignments включены.
5. `last_used_at` должен обновиться.

## 9. Проверка статусов targets

Тестируйте на одном пользователе и двух targets.

`ACTIVE`:

1. Установите оба targets в `ACTIVE`.
2. Удалите assignment тестового пользователя, если нужен чистый выбор.
3. Запросите подписку.
4. Ожидается: пользователь может получить target со статусом `ACTIVE`.

`DRAINING`:

1. Назначьте пользователя на Target A.
2. Переведите Target A в `DRAINING`.
3. Запросите подписку для того же пользователя.
4. Ожидается: закрепленный assignment сохраняет Target A.
5. Запросите подписку для другого тестового пользователя.
6. Ожидается: новые пользователи не назначаются на Target A и получают `ACTIVE` target.

`DISABLED`:

1. Назначьте пользователя на Target A.
2. Установите Target A в `DISABLED` или `enabled=false`.
3. Запросите подписку.
4. Ожидается: assignment переносится на другой валидный `ACTIVE` target.

`DEAD`:

1. Назначьте пользователя на Target A.
2. Установите Target A в `DEAD`.
3. Запросите подписку.
4. Ожидается: assignment переносится на другой валидный `ACTIVE` target.

SQL для просмотра targets:

```sql
select "uuid", "enabled", "status", "override_address", "override_port"
from "host_balancer_targets"
where "balancer_uuid" = (
  select "uuid" from "host_balancers" where "host_uuid" = '<hostUuid>'
);
```

## 10. Проверка стратегий по трафику

Стратегии с учетом трафика требуют targets с `nodeUuid`.

`LEAST_TRAFFIC`:

1. Установите `strategy=LEAST_TRAFFIC`.
2. Установите `trafficMetric` в `LAST_1H`, `LAST_6H`, `LAST_24H` или `CURRENT_PERIOD`.
3. Убедитесь, что у Target A и Target B разные свежие данные трафика.
4. Запросите подписку для нового тестового пользователя.
5. Ожидается: новый assignment предпочитает node с меньшим трафиком.

`WEIGHTED_LEAST_TRAFFIC`:

1. Установите `strategy=WEIGHTED_LEAST_TRAFFIC`.
2. Дайте Target A больший `weight`, чем Target B.
3. Запросите подписки для новых тестовых пользователей.
4. Ожидается: score считается как traffic / weight, поэтому target с большим weight может оставаться кандидатом даже при большем трафике.

Если данных трафика нет, preview должен показать диагностическое сообщение:

```text
Traffic data missing, fallback strategy used.
```

Резервная стратегия - `LEAST_ASSIGNED`.

SQL для проверки трафика:

```sql
select "node_uuid", "download_bytes", "upload_bytes", "created_at"
from "nodes_traffic_usage_history"
where "node_uuid" in ('<node-a-uuid>', '<node-b-uuid>')
order by "created_at" desc
limit 20;
```

Если в вашей схеме трафик хранится иначе, также проверьте `nodes_usage_history` и `nodes_user_usage_history`.

## 11. Откат

### Мягкий откат

Установите:

```env
HOST_BALANCER_ENABLED=false
```

Перезапустите backend:

```bash
docker compose up -d --no-deps remnawave
docker compose logs --tail=100 remnawave
```

Получите подписку:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o rollback.txt
```

Сравните с файлом, полученным при выключенном балансировщике:

```bash
cmp after-disabled.txt rollback.txt
```

Ожидается: подписка соответствует старому поведению.

### Откат образа

Верните официальный образ:

```yaml
services:
  remnawave:
    image: remnawave/backend:2
    environment:
      HOST_BALANCER_ENABLED: "false"
```

Перезапустите backend:

```bash
docker compose up -d --no-deps remnawave
```

### Откат базы данных

Используйте только если нужно полностью убрать тестовые настройки или восстановиться после повреждения данных. Восстановление БД откатит все изменения после резервной копии.

```bash
docker compose stop remnawave
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < remnawave-before-host-balancer.dump
docker compose up -d
```

Если БД не восстанавливать, настройки `Host Balancer` и assignments останутся в таблицах, но будут игнорироваться при `HOST_BALANCER_ENABLED=false`.

## 12. Диагностика

### Панель открывается, но секции Balancing нет

Вероятная причина: образ содержит официальный frontend zip, а не локальный frontend из этого репозитория. Такое возможно, если собирать `./backend`.

Правильно:

```bash
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

После пересборки перезапустите backend и очистите кэш браузера.

### API уходит в restart loop с JwtDefaultGuard или QueryBus

Вероятная причина: ошибка dependency injection в NestJS. Модуль, где используется guard, controller, query или service, не импортирует нужные providers/modules. Проверьте подключение module для `Host Balancer` и доступность `CqrsModule`, guard-модулей и query handlers в графе модулей.

### Подписка не изменилась

Проверьте:

- `HOST_BALANCER_ENABLED=true` в окружении backend;
- балансировка включена на конкретном `Host`;
- у `Host` есть targets;
- targets включены и имеют подходящий `status`;
- тестовый пользователь действительно получает этот `Host`;
- backend был перезапущен после изменения env.

### Host пропал из подписки

Проверьте `unavailablePolicy` и candidates. При `HIDE_HOST` исходный `Host` скрывается, если нет подходящего target. Для диагностики временно используйте `ORIGINAL_HOST` или верните один target в `ACTIVE`.

### Стратегия по трафику не меняет старых пользователей

Закрепленные assignments не ребалансируются стратегиями трафика по умолчанию. Уже назначенный пользователь остается на прежнем target, пока target валиден. Проверяйте `LEAST_TRAFFIC` и `WEIGHTED_LEAST_TRAFFIC` на новых пользователях или включайте отдельную настройку ребалансировки существующих assignments, если она предусмотрена вашей сборкой.

## 13. Ограничения, которые важно помнить

- Статистика трафика обновляется асинхронно, поэтому сразу после изменения node данные могут быть устаревшими.
- Настройки балансировщика, targets и assignments остаются в БД при выключенном `HOST_BALANCER_ENABLED`.
- Глобальный аварийный выключатель влияет на генерацию подписок; API и панель могут продолжать показывать сохраненную конфигурацию.
- `hosts_to_nodes` не используется как источник выбора для нативного `Host Balancer`.
- Если у target пустой `overrideAddress`, используется исходный address `Host`.
- Если все candidates недоступны, поведение зависит от `unavailablePolicy`: `HIDE_HOST`, `ORIGINAL_HOST` или `KEEP_LAST_IF_POSSIBLE`.
