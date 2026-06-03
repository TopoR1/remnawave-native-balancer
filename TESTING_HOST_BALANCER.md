# Регламент тестирования и отката Native Host Balancer

Документ описывает, как безопасно установить, проверить, диагностировать и откатить native Host Balancer в Remnawave.

Подставьте свои значения:

- `<api-domain>`;
- `<sub-domain>`;
- `<hostUuid>`;
- `<userUuid>`;
- `<shortUuid>`;
- `<db-container>`;
- `<backend-service>`;
- `<token>`.

## 0. Коротко о механике

Native Host Balancer встроен в backend Remnawave.

Он не заменяет subscription-page и не переписывает готовую подписку. Он работает до генерации подписки:

1. Remnawave получает список Host для пользователя.
2. Для Host с включенным Balancing выбирается target.
3. Target подменяет `address`, `port`, `sni`, `host`, `path`.
4. Remark и публичная логика исходного Host остаются.
5. Sticky assignment сохраняется как `userUuid + hostUuid -> targetUuid`.
6. Decision audit записывает, почему target выбран или исключен.

Отличие от `remnawave-subscription-page-with-balancer`: старый balancer-page был внешней точкой подписки. Native Balancer работает внутри Remnawave backend, поэтому обычная subscription-page может оставаться обычной.

## 1. План безопасного теста

Рекомендуемая схема:

1. Сделать backup файлов `/opt/remnawave`.
2. Сделать backup PostgreSQL.
3. Остановить старый `remnawave-subscription-page-with-balancer`.
4. Вернуть обычную subscription-page.
5. Собрать новый image из root `Dockerfile`.
6. Запустить новый image с `HOST_BALANCER_ENABLED=false`.
7. Проверить, что UI и обычные подписки работают как раньше.
8. Включить `HOST_BALANCER_ENABLED=true`.
9. Включить global UI setting.
10. Включить Balancing только на тестовом Host.
11. Проверить preview.
12. Сделать реальный запрос подписки.
13. Проверить assignments и decision audit.
14. При проблемах откатиться одним из мягких способов.

## 2. Backup перед установкой

### 2.1 Backup `/opt/remnawave`

```bash
cd /opt
sudo tar -czf remnawave-files-before-native-balancer.tgz remnawave
```

Зафиксируйте compose и images:

```bash
cd /opt/remnawave
docker compose ps
docker compose images
docker compose config > compose-before-native-balancer.yml
```

### 2.2 Backup PostgreSQL

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

Проверьте, что backup не пустой:

```bash
ls -lh remnawave-before-native-balancer.dump
```

## 3. Убрать старый внешний balancer-page

Посмотрите сервисы:

```bash
cd /opt/remnawave
docker compose config --services
```

Если есть `remnawave-subscription-page-with-balancer`, остановите:

```bash
docker compose stop remnawave-subscription-page-with-balancer
docker compose rm -f remnawave-subscription-page-with-balancer
```

Если сервис называется иначе, остановите соответствующий старый balancer-page.

Верните обычную subscription-page и route к ней. Если Caddy/Nginx был направлен на внешний balancer-page, верните route на обычную subscription-page или штатный backend Remnawave согласно вашей схеме.

Проверка:

```bash
docker compose config | grep -i subscription
```

## 4. Сборка image

Собирать нужно из корня репозитория:

```bash
cd /opt
git clone https://github.com/TopoR1/remnawave-native-balancer.git
cd /opt/remnawave-native-balancer
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

Важно: `backend/Dockerfile` может взять официальный frontend без UI Host Balancer. Используйте root `Dockerfile`.

## 5. Сборка на слабом VPS

### 5.1 Симптом exit code 137

Если сборка падает:

```text
Killed
exit code 137
```

обычно это OOM-killer. Не хватило RAM/swap на frontend build.

Проверьте:

```bash
dmesg -T | grep -i -E "killed process|out of memory|oom"
free -h
df -h
```

### 5.2 Temporary swap 6G

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

### 5.3 Очистка Docker builder cache

```bash
docker builder prune -af
docker system df
```

### 5.4 Dockerfile.prebuilt-frontend

Если VPS все равно не тянет сборку frontend внутри Docker:

```bash
cd /opt/remnawave-native-balancer/frontend
npm ci
npm run build
cd ..
docker build -f Dockerfile.prebuilt-frontend -t topor/remnawave-backend:native-balancer .
```

`Dockerfile.prebuilt-frontend` копирует готовый `frontend/dist` и снижает нагрузку на Docker build.

## 6. Проверка image

Не проверяйте image обычным `docker run`:

```bash
docker run --rm topor/remnawave-backend:native-balancer
```

Обычный запуск вызывает entrypoint backend. Он ожидает `DATABASE_URL`, JWT env и другие параметры. Ошибка про env в этом случае не доказывает, что image плохой.

Правильная проверка:

```bash
docker run --rm --entrypoint sh topor/remnawave-backend:native-balancer -lc "ls -la /opt/app/frontend && ls -la /opt/app/backend"
```

Проверить frontend:

```bash
docker run --rm --entrypoint sh topor/remnawave-backend:native-balancer -lc "test -f /opt/app/frontend/index.html && find /opt/app/frontend/assets -maxdepth 1 -type f | head"
```

Если эта команда проходит, frontend лежит внутри image.

## 7. Запуск с hard kill-switch

Создайте `/opt/remnawave/docker-compose.override.yml`:

```yaml
services:
  remnawave:
    image: topor/remnawave-backend:native-balancer
    environment:
      HOST_BALANCER_ENABLED: "false"
      HOST_BALANCER_DECISIONS_ENABLED: "true"
```

Запустите:

```bash
cd /opt/remnawave
docker compose up -d
docker compose logs --tail=100 remnawave
```

Проверьте, что env попал в compose:

```bash
docker compose config | grep HOST_BALANCER_ENABLED
```

На этом этапе подписки должны работать как раньше, потому что `HOST_BALANCER_ENABLED=false`.

## 8. Проверка UI

Откройте Remnawave panel.

Проверьте:

1. `Настройки Remnawave -> Host Balancer`.
2. Статус env kill-switch.
3. Warning при `HOST_BALANCER_ENABLED=false`.
4. `Hosts -> Host edit/create -> Balancing`.
5. Наличие `Предпросмотр выбора`.
6. Наличие `Последние решения`.

Если блока `Balancing` нет, вероятнее всего image собран не из root `Dockerfile` или frontend взят официальный.

## 9. Включение Balancer для теста

### 9.1 Включить env

В override:

```yaml
services:
  remnawave:
    environment:
      HOST_BALANCER_ENABLED: "true"
      HOST_BALANCER_DECISIONS_ENABLED: "true"
```

Применить:

```bash
docker compose up -d
```

### 9.2 Включить global UI setting

Откройте:

```text
Настройки Remnawave -> Host Balancer
```

Включите:

```text
Глобально включить Host Balancer
```

### 9.3 Включить на тестовом Host

Откройте:

```text
Hosts -> тестовый Host -> Balancing
```

Включите `Balancing`.

Рекомендуемый первый тест:

- strategy: `LEAST_ASSIGNED`;
- sticky: enabled;
- unavailablePolicy: `ORIGINAL_HOST` для безопасного старта или `HIDE_HOST`, если вы явно тестируете скрытие Host;
- один или два target.

## 10. Добавить targets

В targets table:

1. Нажмите `Добавить target`.
2. Выберите node.
3. Проверьте auto-fill:
   - `overrideAddress = node.address`;
   - `overridePort = Host port` или node/default port, если доступен.
4. Проверьте node status.
5. Проверьте inbound compatibility.
6. Сохраните Host.

В DevTools Network при сохранении должны быть:

- `PUT /api/host-balancers/:hostUuid`;
- `PUT /api/host-balancers/:hostUuid/targets`;
- `PATCH /api/hosts/...`, если менялась обычная Host form.

## 11. Проверить preview

В `Предпросмотр выбора` введите:

- полный `userUuid`;
- или `shortUuid`.

Нажмите `Проверить выбор`.

Ожидаемый результат:

- loading не зависает;
- показан selected target или понятная ошибка;
- видны candidates;
- видны excluded targets;
- виден final address/port;
- если target исключен, видна причина.

Preview не создает assignments.

Проверка через API:

```bash
curl -H "Authorization: Bearer <token>" \
  "https://<api-domain>/api/host-balancers/<hostUuid>/preview?shortUuid=<shortUuid>"
```

Или:

```bash
curl -H "Authorization: Bearer <token>" \
  "https://<api-domain>/api/host-balancers/<hostUuid>/preview?userUuid=<userUuid>"
```

## 12. Проверить реальную генерацию подписки

Запросите подписку реальным клиентским User-Agent:

```bash
curl -A "v2rayN" "https://<sub-domain>/<shortUuid>"
```

Если получаете `App not supported`, вы, вероятно, попали в browser/subpage branch или используете неподдерживаемый User-Agent. Повторите с User-Agent реального клиента.

## 13. Проверить assignments

После реальной генерации подписки:

```sql
SELECT host_uuid, user_uuid, target_uuid, reason, last_used_at, updated_at
FROM host_balancer_assignments
WHERE host_uuid = '<hostUuid>'
ORDER BY updated_at DESC
LIMIT 20;
```

Ожидаемо:

- preview не создает строку;
- реальная подписка создает или обновляет assignment;
- при sticky enabled повторная генерация использует тот же target, если он валиден.

## 14. Проверить decision audit

В UI:

```text
Host edit -> Balancing -> Последние решения
```

Проверьте колонки:

- время;
- masked `userUuid`;
- выбранная цель;
- strategy;
- reason;
- assignmentAction;
- final address;
- candidates count;
- excluded count;
- warnings.

Откройте detail row:

- candidates;
- excludedTargets;
- selectedTarget;
- finalHostOverrides;
- unavailablePolicy.

Через API:

```bash
curl -H "Authorization: Bearer <token>" \
  "https://<api-domain>/api/host-balancers/<hostUuid>/decisions?limit=50"
```

В БД:

```sql
SELECT host_uuid, user_uuid, target_uuid, strategy, reason, diagnostics, created_at
FROM host_balancer_decisions
WHERE host_uuid = '<hostUuid>'
ORDER BY created_at DESC
LIMIT 50;
```

Decision audit хранится с retention: последние 5000 решений.

## 15. Диагностика типовых проблем

### 15.1 Targets не сохраняются из UI

Симптомы:

- Save нажимается, но targets не появляются в БД;
- settings сохранены, targets нет.

Проверить DevTools Network:

- `PUT /api/host-balancers/:hostUuid`;
- `PUT /api/host-balancers/:hostUuid/targets`.

Проверить БД:

```sql
SELECT *
FROM host_balancer_targets
WHERE balancer_uuid IN (
  SELECT uuid
  FROM host_balancers
  WHERE host_uuid = '<hostUuid>'
);
```

Если ручной `PUT /targets` работает, а UI нет, проблема во frontend save-flow. В текущей реализации targets входят в save-flow и ошибка сохранения targets должна быть показана оператору.

### 15.2 target node lacks required inbound

Симптом:

```text
target node lacks required inbound
```

Русский перевод в UI:

```text
На ноде нет нужного inbound
```

Причина: выбранная target-нода не содержит inbound, который использует Host.

Проверить:

- inbound compatibility в targets table;
- `excludedTargets` в preview;
- `excludedTargets` в decision audit;
- config profile inbound у Host;
- active inbound UUIDs на node.

Решение:

- добавьте нужный inbound на target-ноду;
- или выберите другую node;
- или оставьте target disabled как черновик.

### 15.3 Host исчезает из подписки

Проверить `unavailablePolicy`:

- `HIDE_HOST` скрывает Host, если нет доступных targets;
- `ORIGINAL_HOST` оставляет исходный Host;
- `KEEP_LAST_IF_POSSIBLE` пытается использовать последний валидный assignment.

Проверить:

- targets enabled;
- target status;
- node connected;
- inbound compatibility;
- decision audit reason.

Если все targets excluded и policy `HIDE_HOST`, исчезновение Host ожидаемо.

### 15.4 App not supported через curl

Причина часто не в Balancer, а в route/User-Agent subscription endpoint.

Используйте User-Agent реального клиента:

```bash
curl -A "v2rayN" "https://<sub-domain>/<shortUuid>"
```

Или проверяйте конкретный endpoint, который использует ваш клиент.

### 15.5 Original Host CSV random мешает тесту

Если у исходного Host уже есть CSV/random/shuffle поведение, результат может выглядеть как работа Balancer.

Для чистого теста:

- используйте один Host;
- временно отключите random/shuffle;
- смотрите final address в decision audit;
- смотрите assignment в БД.

### 15.6 Sticky выключен и пользователь получает разные targets

Если sticky disabled, пользователь может получать разные targets на разных генерациях.

Для стабильного поведения:

- включите `stickyEnabled`;
- проверьте `host_balancer_assignments`;
- не включайте rebalance existing assignments, если не хотите переносить пользователей.

## 16. Минимальные SQL-проверки

Settings:

```sql
SELECT *
FROM host_balancers
WHERE host_uuid = '<hostUuid>';
```

Targets:

```sql
SELECT *
FROM host_balancer_targets
WHERE balancer_uuid IN (
  SELECT uuid FROM host_balancers WHERE host_uuid = '<hostUuid>'
)
ORDER BY priority ASC, weight DESC, created_at ASC;
```

Assignments:

```sql
SELECT *
FROM host_balancer_assignments
WHERE host_uuid = '<hostUuid>'
ORDER BY updated_at DESC;
```

Decisions:

```sql
SELECT created_at, user_uuid, target_uuid, strategy, reason, diagnostics
FROM host_balancer_decisions
WHERE host_uuid = '<hostUuid>'
ORDER BY created_at DESC
LIMIT 50;
```

Global setting:

```sql
SELECT host_balancer_global_enabled
FROM remnawave_settings
LIMIT 1;
```

## 17. Откат

Откат делайте от мягкого к жесткому.

### 17.1 Выключить env

Самый быстрый аварийный rollback:

```yaml
services:
  remnawave:
    environment:
      HOST_BALANCER_ENABLED: "false"
```

Применить:

```bash
cd /opt/remnawave
docker compose up -d
```

Результат: Balancer полностью игнорируется backend, даже если UI settings включены.

### 17.2 Выключить global UI setting

Откройте:

```text
Настройки Remnawave -> Host Balancer
```

Выключите глобальный переключатель.

### 17.3 Отключить конкретный Host

Откройте:

```text
Hosts -> Host edit -> Balancing
```

Выключите Balancing у проблемного Host.

### 17.4 Вернуть image remnawave/backend:2

В compose:

```yaml
services:
  remnawave:
    image: remnawave/backend:2
```

Применить:

```bash
cd /opt/remnawave
docker compose up -d
docker compose logs --tail=100 remnawave
```

### 17.5 Restore DB только как крайняя мера

Обычно restore DB не нужен:

- env выключает применение Balancer;
- global UI setting выключает применение Balancer;
- Host setting выключает применение Balancer;
- targets/assignments могут остаться в БД.

Restore используйте только если нужно полностью вернуться к старой схеме или данные повреждены.

Перед restore сделайте свежий backup текущего состояния.

Пример:

```bash
cd /opt/remnawave
docker compose stop remnawave
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < remnawave-before-native-balancer.dump
docker compose up -d
```

## 18. Acceptance checklist

Перед завершением теста убедитесь:

- новый image запущен;
- обычная subscription-page работает;
- `HOST_BALANCER_ENABLED` выставлен по выбранной схеме;
- global UI setting понятен оператору;
- Balancing включен только на тестовом Host;
- targets сохраняются из UI;
- preview показывает selected/excluded/final address;
- real subscription создает assignment;
- decision audit показывает причину выбора target;
- rollback через env проверен или понятен оператору.
