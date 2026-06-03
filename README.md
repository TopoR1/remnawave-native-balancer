# Remnawave Native Host Balancer

Этот репозиторий содержит форк Remnawave с нативной балансировкой на уровне `Host`.
Балансировка встроена в backend и UI Remnawave: оператор настраивает ее в форме `Host`, а backend выбирает target до генерации подписки.

Функция защищена тремя уровнями включения:

1. `HOST_BALANCER_ENABLED` в окружении backend. Это аварийный hard kill-switch.
2. Глобальная настройка `Host Balancer` в UI Remnawave.
3. Настройка `Balancing` у конкретного `Host`.

Балансировка применяется только если включены все три уровня.

## Что такое native Host Balancer

Native Host Balancer выбирает, на какую target-ноду отправить пользователя, прямо во время генерации подписки Remnawave.

Исходный публичный `Host` остается логической точкой входа:

- пользователь видит remark исходного `Host`;
- operator продолжает управлять Host из панели Remnawave;
- subscription generator получает уже подмененные технические поля подключения.

Target может переопределить:

- `address`;
- `port`;
- `sni`;
- `host`;
- `path`.

Backend хранит sticky assignment в формате:

```text
userUuid + hostUuid -> targetUuid
```

Это означает, что один и тот же пользователь для одного и того же Host может стабильно получать одну target-ноду, пока assignment валиден и включен sticky mode.

## Особенности native Host Balancer

Native Host Balancer работает внутри Remnawave backend:

- не требует отдельной subscription page для балансировки;
- не переписывает готовый текст подписки после генерации;
- работает внутри backend Remnawave до генерации подписки;
- видит реальные Host, targets, assignments и diagnostics;
- показывает preview и decision audit прямо в UI Host;
- может использовать ту же subscription page, что и обычный Remnawave.

Практический вывод: балансировка выполняется backend Remnawave, а subscription-page остается обычной точкой выдачи подписки.

## Как это работает

1. Пользователь запрашивает подписку.
2. Remnawave получает список Host, доступных пользователю.
3. Для каждого Host backend проверяет:
   - разрешен ли `HOST_BALANCER_ENABLED`;
   - включен ли глобальный Host Balancer в UI;
   - включен ли Balancing у конкретного Host.
4. Если все включено, backend выбирает target по стратегии.
5. Если sticky assignment существует и валиден, он может быть переиспользован.
6. Если assignment нужен, он сохраняется как `userUuid + hostUuid -> targetUuid`.
7. В subscription generator уходит Host с подмененными полями `address/port/sni/host/path`.
8. В `host_balancer_decisions` может записаться audit-запись с причиной выбора или исключения target.

Публичный Host не становится target. Он остается именем и логической сущностью. Target только подменяет технические параметры подключения.

## Уровни включения

### 1. Env hard kill-switch

`HOST_BALANCER_ENABLED=false` полностью выключает Host Balancer на backend.

При этом:

- UI может показывать и сохранять настройки;
- targets и assignments остаются в БД;
- генерация подписки идет без применения Balancer.

`HOST_BALANCER_ENABLED=true` разрешает Balancer, но не включает его автоматически для всех Host.

В этом форке default в коде и `backend/.env.sample`:

```env
HOST_BALANCER_ENABLED=true
```

Для аварийного rollback явно задайте:

```env
HOST_BALANCER_ENABLED=false
```

и перезапустите backend.

### 2. Глобальная UI-настройка

В UI:

```text
Настройки Remnawave -> Host Balancer -> Глобально включить Host Balancer
```

Настройка хранится в БД:

```text
remnawave_settings.host_balancer_global_enabled
```

Миграция добавляет значение `true` для новых и существующих установок. Это не меняет поведение само по себе, потому что per-host `balancer.enabled` по умолчанию `false`.

Если env выключен, UI покажет предупреждение:

```text
Host Balancer отключён переменной окружения. Включение в UI не применится.
```

### 3. Настройка конкретного Host

В форме Host включите блок `Balancing`.

Даже если env и глобальная UI-настройка включены, конкретный Host не будет балансироваться, пока у него не включен `Balancing`.

## Структура репозитория

- `backend` - backend Remnawave, Prisma-миграции, API, HostBalancerService.
- `frontend` - UI Remnawave с блоком `Balancing`, preview и decision audit.
- `node` - код Remnawave Node, не является точкой балансировки.
- `panel` - документация и сайт панели.
- `Dockerfile` - основной Dockerfile из корня репозитория.
- `Dockerfile.prebuilt-frontend` - Dockerfile для слабого VPS, когда `frontend/dist` собран заранее.
- `TESTING_HOST_BALANCER.md` - подробный регламент проверки, диагностики и отката.

Важно: рабочий образ этого форка собирается из корня репозитория. `backend/Dockerfile` может подтянуть официальный frontend без блока `Balancing`.

## Установка поверх существующего Remnawave

Ниже пример для установки в `/opt/remnawave`. Подставьте свои имена сервисов, контейнеров и доменов.

### 1. Backup `/opt/remnawave`

```bash
cd /opt
sudo tar -czf remnawave-files-before-native-balancer.tgz remnawave
```

Сохраните текущие образы:

```bash
cd /opt/remnawave
docker compose ps
docker compose images
docker compose config > compose-before-native-balancer.yml
```

### 2. Backup PostgreSQL

Если PostgreSQL в compose:

```bash
cd /opt/remnawave
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > remnawave-before-native-balancer.dump
```

Если PostgreSQL внешний:

```bash
PGPASSWORD='<password>' pg_dump \
  -h <db-host> \
  -p <db-port> \
  -U <db-user> \
  -d <db-name> \
  -Fc \
  -f remnawave-before-native-balancer.dump
```

### 3. Проверить subscription-page

В compose должна быть штатная subscription-page Remnawave.

Проверьте:

```bash
docker compose config | grep -i subscription
```

Если вы ранее меняли Caddy/Nginx route для подписок, проверьте, что маршрут ведет на штатную subscription-page или backend Remnawave согласно вашей схеме.

### 4. Собрать image из root Dockerfile

```bash
cd /opt
git clone https://github.com/TopoR1/remnawave-native-balancer.git
cd /opt/remnawave-native-balancer
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

### 5. Обновление через git pull

Если репозиторий уже был склонирован ранее, обновите его перед сборкой:

```bash
cd /opt/remnawave-native-balancer
git status
git pull --ff-only
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

Если `git status` показывает локальные изменения, сначала сохраните их в отдельный commit или stash. Для серверной установки обычно ожидается чистое состояние рабочей копии.

После сборки перезапустите compose с тем же тегом image:

```bash
cd /opt/remnawave
docker compose up -d
docker compose logs --tail=100 remnawave
```

### 6. Подключить image

Создайте или обновите `/opt/remnawave/docker-compose.override.yml`:

```yaml
services:
  remnawave:
    image: topor/remnawave-backend:native-balancer
    environment:
      HOST_BALANCER_ENABLED: "false"
      HOST_BALANCER_DECISIONS_ENABLED: "true"
```

Схема безопасного запуска:

- `HOST_BALANCER_ENABLED=false` - сначала проверить, что новый image и UI работают без применения Balancer;
- затем `HOST_BALANCER_ENABLED=true` - разрешить Balancer и управлять им из UI.

После изменения:

```bash
cd /opt/remnawave
docker compose up -d
docker compose logs --tail=100 remnawave
```

## Сборка на слабом VPS

Если сборка падает так:

```text
Killed
exit code 137
```

обычно это OOM-killer. Vite/frontend build не хватило RAM или swap.

### Temporary swap 6G

```bash
sudo fallocate -l 6G /swapfile-remnawave-build
sudo chmod 600 /swapfile-remnawave-build
sudo mkswap /swapfile-remnawave-build
sudo swapon /swapfile-remnawave-build
free -h

docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .

sudo swapoff /swapfile-remnawave-build
sudo rm /swapfile-remnawave-build
```

Если места мало:

```bash
docker builder prune -af
docker system df
```

### Dockerfile.prebuilt-frontend

Если Docker build внутри VPS все равно не проходит, соберите frontend заранее:

```bash
cd /opt/remnawave-native-balancer/frontend
npm ci
npm run build
cd ..
docker build -f Dockerfile.prebuilt-frontend -t topor/remnawave-backend:native-balancer .
```

Этот вариант копирует готовый `frontend/dist` и не запускает тяжелую frontend-сборку внутри Docker.

## Проверка image

Обычный `docker run` запускает entrypoint backend. Он потребует `DATABASE_URL` и другие env:

```bash
docker run --rm topor/remnawave-backend:native-balancer
```

Это не является корректной проверкой содержимого image.

Правильная проверка:

```bash
docker run --rm --entrypoint sh topor/remnawave-backend:native-balancer -lc "ls -la /opt/app/frontend && ls -la /opt/app/backend"
```

Проверить, что frontend внутри image:

```bash
docker run --rm --entrypoint sh topor/remnawave-backend:native-balancer -lc "test -f /opt/app/frontend/index.html && find /opt/app/frontend/assets -maxdepth 1 -type f | head"
```

## Настройка Host Balancer

### 1. Включить глобально

Откройте:

```text
Настройки Remnawave -> Host Balancer
```

Проверьте:

- env status;
- warning, если `HOST_BALANCER_ENABLED=false`;
- включена ли глобальная UI-настройка.

### 2. Включить на Host

Откройте Host create/edit modal:

```text
Hosts -> нужный Host -> Balancing
```

Включите `Balancing`, выберите стратегию и policy.

### 3. Добавить targets

Добавьте targets:

- выберите node;
- проверьте auto-fill `overrideAddress`;
- задайте `overridePort`, если нужно;
- проверьте статус inbound compatibility.

Target со статусом `ACTIVE` без нужного inbound блокируется строгой проверкой. Disabled target может оставаться как черновик, но будет предупреждение.

### 4. Проверить preview

В блоке `Предпросмотр выбора` введите:

- `userUuid`;
- или `shortUuid`.

Нажмите `Проверить выбор`.

UI должен показать:

- selected target;
- candidates;
- excluded targets;
- warnings;
- final address/port;
- причину выбора или исключения.

### 5. Проверить decision audit

В блоке `Последние решения` смотрите:

- время;
- masked `userUuid`;
- выбранную цель;
- strategy;
- reason;
- assignmentAction;
- final address;
- candidates/excluded count;
- warnings.

Откройте detail row, чтобы увидеть:

- candidates;
- excludedTargets;
- selectedTarget;
- finalHostOverrides;
- unavailablePolicy.

Если видите `target node lacks required inbound`, target-нода не содержит inbound, который использует этот Host.

### 6. Проверить assignments

В БД:

```sql
SELECT host_uuid, user_uuid, target_uuid, reason, last_used_at
FROM host_balancer_assignments
WHERE host_uuid = '<hostUuid>'
ORDER BY updated_at DESC
LIMIT 20;
```

Preview не должен создавать assignments. Assignment появляется только при реальной генерации подписки.

## Типовые проблемы

### Targets не сохраняются из UI

Проверьте DevTools Network при сохранении Host:

- если менялась обычная форма Host, должен быть `PATCH /api/hosts/...`;
- для balancer settings должен быть `PUT /api/host-balancers/:hostUuid`;
- для targets должен быть `PUT /api/host-balancers/:hostUuid/targets`.

Если settings сохранились, а targets нет, UI должен показать ошибку и не закрыть модалку молча.

### target node lacks required inbound

Причина: target-нода не имеет inbound, который использует текущий Host.

Что проверить:

- `configProfileInboundUuid` у Host;
- активные inbounds на node;
- compatibility badge в targets table;
- decision audit detail `excludedTargets`.

Решение: добавьте нужный inbound на target-ноду или выберите другую node.

### Host исчезает из подписки

Проверьте `unavailablePolicy`:

- `HIDE_HOST` скрывает Host, если нет доступных targets;
- `ORIGINAL_HOST` оставляет исходный Host;
- `KEEP_LAST_IF_POSSIBLE` пытается сохранить последний валидный target.

Также проверьте:

- targets enabled/status;
- node connected;
- inbound compatibility;
- decision audit reason.

### App not supported через curl

Некоторые endpoints подписки зависят от User-Agent или client type.

Для проверки используйте реальный subscription URL и User-Agent клиента, либо явно подставляйте поддерживаемый User-Agent:

```bash
curl -A "v2rayN" "https://<sub-domain>/<shortUuid>"
```

Если route ведет на browser/subpage branch, можно получить `App not supported`.

### Original Host CSV random мешает тесту

Если у исходной конфигурации уже включен random/shuffle Host или CSV-логика, результат может выглядеть как балансировка, хотя native Host Balancer не применился.

Для чистого теста:

- используйте один Host;
- временно отключите random/shuffle;
- сравнивайте final address из decision audit;
- проверяйте assignments в БД.

### Sticky выключен и пользователь получает разные targets

Если sticky assignments выключены, пользователь может получать разные targets при разных генерациях подписки.

Для стабильной выдачи:

- включите `stickyEnabled`;
- проверьте `host_balancer_assignments`;
- не включайте traffic rebalance, если не хотите переносить существующих пользователей.

## Откат

Есть четыре уровня отката, от мягкого к жесткому.

### 1. Выключить env

Самый быстрый аварийный rollback:

```yaml
services:
  remnawave:
    environment:
      HOST_BALANCER_ENABLED: "false"
```

Затем:

```bash
docker compose up -d
```

Balancer не будет применяться, даже если UI settings и Host settings включены.

### 2. Выключить global UI setting

Откройте:

```text
Настройки Remnawave -> Host Balancer
```

Выключите глобальный переключатель.

### 3. Отключить конкретный Host

Откройте Host edit modal и выключите `Balancing` у проблемного Host.

### 4. Вернуть image remnawave/backend:2

В compose верните прежний image:

```yaml
services:
  remnawave:
    image: remnawave/backend:2
```

Затем:

```bash
docker compose up -d
docker compose logs --tail=100 remnawave
```

### 5. Restore DB только как крайняя мера

Обычно restore DB не нужен: настройки Balancer и assignments можно оставить в БД, если env выключен.

Restore используйте только если:

- миграции нужно полностью откатить;
- данные повреждены;
- вы возвращаетесь на схему, несовместимую с текущей БД.

Пример restore:

```bash
cd /opt/remnawave
docker compose stop remnawave
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < remnawave-before-native-balancer.dump
docker compose up -d
```

Перед restore сделайте свежую копию текущего состояния.
