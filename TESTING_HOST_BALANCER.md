# Регламент тестирования Native Host Balancer

Этот документ описывает, как установить, проверить, диагностировать и откатить Native Host Balancer в Remnawave.

Все команды ниже являются примерами. Подставьте свои контейнеры, домены, токены, UUID и пути.

## Переменные для примеров

```bash
export PANEL_URL="https://panel.example.com"
export SUB_URL="https://sub.example.com"
export API_TOKEN="replace-with-admin-api-token"
export USER_UUID="replace-user-uuid"
export SHORT_UUID="replace-short-uuid"
export HOST_UUID="replace-host-uuid"
export NODE_UUID_A="replace-node-a-uuid"
export NODE_UUID_B="replace-node-b-uuid"
```

Для API используйте заголовок:

```bash
Authorization: Bearer <token>
```

## 1. Предварительная проверка

### Проверить env kill-switch

```bash
docker compose exec backend sh -lc 'echo $HOST_BALANCER_ENABLED'
```

Ожидаемые варианты:

```text
true
false
```

Если значение `false`, Balancer не будет применяться к подпискам.

### Проверить доступность Panel

```bash
curl -I "$PANEL_URL"
```

### Проверить обычную подписку

```bash
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/$SHORT_UUID" | head
```

Если видите `App not supported`, проверьте `User-Agent`, правила ответа и правильность домена подписки.

## 2. Проверка глобальных настроек

### Получить настройки Remnawave

```bash
curl -sS \
  -H "Authorization: Bearer $API_TOKEN" \
  "$PANEL_URL/api/remnawave-settings" | jq
```

Проверьте поля:

```json
{
  "hostBalancerGlobalEnabled": true,
  "hostBalancerEnvEnabled": true,
  "hostBalancerSummary": {
    "enabledHosts": 1,
    "activeTargets": 2,
    "warnings": 0,
    "errors": 0
  }
}
```

### Включить глобальную настройку

```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/remnawave-settings" \
  -d '{"hostBalancerGlobalEnabled":true}' | jq
```

### Выключить глобальную настройку

```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/remnawave-settings" \
  -d '{"hostBalancerGlobalEnabled":false}' | jq
```

## 3. Настройка Host Balancer через API

### Получить настройки Host Balancer

```bash
curl -sS \
  -H "Authorization: Bearer $API_TOKEN" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID" | jq
```

### Включить Balancer у Host

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID" \
  -d '{
    "enabled": true,
    "strategy": "LEAST_ASSIGNED",
    "unavailablePolicy": "HIDE_HOST",
    "stickyEnabled": true,
    "rebalanceExistingAssignmentsByTraffic": false,
    "trafficMetric": null
  }' | jq
```

### Добавить две целевые ноды

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID/targets" \
  -d "{
    \"targets\": [
      {
        \"nodeUuid\": \"$NODE_UUID_A\",
        \"enabled\": true,
        \"status\": \"ACTIVE\",
        \"weight\": 1,
        \"priority\": 100,
        \"maxAssignedUsers\": null,
        \"overrideAddress\": \"node-a.example.com\",
        \"overridePort\": 443,
        \"overrideSni\": null,
        \"overrideHost\": null,
        \"overridePath\": null
      },
      {
        \"nodeUuid\": \"$NODE_UUID_B\",
        \"enabled\": true,
        \"status\": \"ACTIVE\",
        \"weight\": 1,
        \"priority\": 100,
        \"maxAssignedUsers\": null,
        \"overrideAddress\": \"node-b.example.com\",
        \"overridePort\": 443,
        \"overrideSni\": null,
        \"overrideHost\": null,
        \"overridePath\": null
      }
    ]
  }" | jq
```

## 4. Validation targets

### Запустить validation

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID/targets/validate" \
  -d "{
    \"targets\": [
      {
        \"localId\": \"local-a\",
        \"nodeUuid\": \"$NODE_UUID_A\",
        \"enabled\": true,
        \"status\": \"ACTIVE\",
        \"weight\": 1,
        \"priority\": 100,
        \"overrideAddress\": \"node-a.example.com\",
        \"overridePort\": 443
      }
    ]
  }" | jq
```

Ожидаемый успешный target:

```json
{
  "valid": true,
  "severity": "ok",
  "reasons": []
}
```

Ошибка отсутствующего inbound:

```json
{
  "valid": false,
  "severity": "error",
  "reasons": ["target node lacks required inbound"]
}
```

Для `DISABLED` target отсутствие inbound должно быть warning:

```json
{
  "valid": true,
  "severity": "warning",
  "reasons": ["target node lacks required inbound"]
}
```

## 5. Preview выбора

Preview является dry-run. Он не создает assignment и не меняет существующий assignment.

### Preview по `userUuid`

```bash
curl -sS \
  -H "Authorization: Bearer $API_TOKEN" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID/preview?userUuid=$USER_UUID" | jq
```

### Preview по `shortUuid`

```bash
curl -sS \
  -H "Authorization: Bearer $API_TOKEN" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID/preview?shortUuid=$SHORT_UUID" | jq
```

Проверьте поля:

```text
resolvedUserUuid
shortUuid
hostUuid
hostRemark
enabled
strategy
stickyEnabled
unavailablePolicy
existingAssignment
assignmentAction
selectedTarget
candidates
excludedTargets
warnings
finalHostOverrides
fallbackPolicyResult
```

Если нет `userUuid` и `shortUuid`, endpoint должен вернуть `400`.

Если пользователь не найден, endpoint должен вернуть `404`.

## 6. Получение подписки и decode

### Скачать подписку

```bash
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/$SHORT_UUID" -o subscription.txt
```

### Python decode script

Некоторые ответы подписки приходят как обычный текст, некоторые как base64. Этот скрипт пытается показать оба варианта.

```bash
python3 - <<'PY'
from pathlib import Path
import base64

raw = Path("subscription.txt").read_bytes().strip()

print("=== raw preview ===")
print(raw[:500].decode("utf-8", errors="replace"))

print("\n=== base64 decoded preview ===")
try:
    padded = raw + b"=" * (-len(raw) % 4)
    decoded = base64.b64decode(padded, validate=False)
    print(decoded[:2000].decode("utf-8", errors="replace"))
except Exception as exc:
    print(f"decode failed: {exc}")
PY
```

Проверьте, что в результате есть `overrideAddress` выбранного target, а remark остался от исходного публичного `Host`.

## 7. SQL диагностика

Подключение:

```bash
docker compose exec postgres psql -U remnawave remnawave
```

Если контейнер называется иначе:

```bash
docker ps
```

### Проверить настройки Balancer

```sql
SELECT
  uuid,
  host_uuid,
  enabled,
  strategy,
  unavailable_policy,
  sticky_enabled,
  rebalance_existing_assignments_by_traffic,
  traffic_metric,
  created_at,
  updated_at
FROM host_balancers
WHERE host_uuid = '<HOST_UUID>';
```

### Проверить targets

```sql
SELECT
  uuid,
  balancer_uuid,
  node_uuid,
  enabled,
  status,
  weight,
  priority,
  max_assigned_users,
  override_address,
  override_port,
  override_sni,
  override_host,
  override_path,
  created_at,
  updated_at
FROM host_balancer_targets
WHERE balancer_uuid = (
  SELECT uuid FROM host_balancers WHERE host_uuid = '<HOST_UUID>'
)
ORDER BY priority ASC, weight DESC, created_at ASC;
```

### Проверить assignments

```sql
SELECT
  uuid,
  host_uuid,
  user_uuid,
  target_uuid,
  reason,
  last_used_at,
  created_at,
  updated_at
FROM host_balancer_assignments
WHERE host_uuid = '<HOST_UUID>'
ORDER BY updated_at DESC;
```

### Проверить decisions

```sql
SELECT
  uuid,
  host_uuid,
  user_uuid,
  target_uuid,
  strategy,
  reason,
  diagnostics,
  created_at
FROM host_balancer_decisions
WHERE host_uuid = '<HOST_UUID>'
ORDER BY created_at DESC
LIMIT 50;
```

### Посчитать targets и assignments

```sql
SELECT status, enabled, COUNT(*)
FROM host_balancer_targets
WHERE balancer_uuid = (
  SELECT uuid FROM host_balancers WHERE host_uuid = '<HOST_UUID>'
)
GROUP BY status, enabled
ORDER BY status, enabled;
```

```sql
SELECT target_uuid, COUNT(*) AS assignments
FROM host_balancer_assignments
WHERE host_uuid = '<HOST_UUID>'
GROUP BY target_uuid
ORDER BY assignments ASC;
```

## 8. Сценарии статусов target

### ACTIVE

`ACTIVE` target участвует в выборе, если:

- `enabled = true`;
- node существует;
- node подключена;
- node не отключена администратором;
- на node есть required inbound;
- не превышен `maxAssignedUsers`.

Проверка:

```bash
curl -sS -H "Authorization: Bearer $API_TOKEN" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID/preview?shortUuid=$SHORT_UUID" | jq '.response.selectedTarget'
```

### DRAINING

`DRAINING` target не должен получать новые назначения, но может сохраняться для старых sticky assignments, если старый target еще допустим.

Проверка:

1. Создайте assignment на target.
2. Переведите target в `DRAINING`.
3. Запросите подписку тем же пользователем.
4. Убедитесь, что sticky assignment может быть переиспользован.
5. Запросите preview для нового пользователя и убедитесь, что `DRAINING` не выбран как новый target.

### DISABLED

`DISABLED` target не участвует в балансировке.

Validation для `DISABLED` target может показывать warning, но сохранение допустимо.

Проверка:

```sql
UPDATE host_balancer_targets
SET status = 'DISABLED'
WHERE uuid = '<TARGET_UUID>';
```

Затем preview должен исключить target с reason:

```text
target disabled
```

### DEAD

`DEAD` target считается аварийным и не участвует в выборе.

Проверка:

```sql
UPDATE host_balancer_targets
SET status = 'DEAD'
WHERE uuid = '<TARGET_UUID>';
```

Preview должен исключить target. Если доступных targets нет, должна сработать `unavailablePolicy`.

## 9. Проверка LEAST_ASSIGNED

### Настроить стратегию

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID" \
  -d '{
    "enabled": true,
    "strategy": "LEAST_ASSIGNED",
    "unavailablePolicy": "HIDE_HOST",
    "stickyEnabled": true,
    "rebalanceExistingAssignmentsByTraffic": false,
    "trafficMetric": null
  }' | jq
```

### Проверить распределение assignments

Сделайте несколько запросов подписки разными пользователями:

```bash
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/<shortUuid-1>" >/dev/null
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/<shortUuid-2>" >/dev/null
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/<shortUuid-3>" >/dev/null
```

Проверьте counts:

```sql
SELECT target_uuid, COUNT(*) AS assignments
FROM host_balancer_assignments
WHERE host_uuid = '<HOST_UUID>'
GROUP BY target_uuid
ORDER BY assignments ASC;
```

Ожидание: новый пользователь получает target с меньшим числом assignments.

## 10. Проверка LEAST_TRAFFIC

### Настроить стратегию

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID" \
  -d '{
    "enabled": true,
    "strategy": "LEAST_TRAFFIC",
    "unavailablePolicy": "HIDE_HOST",
    "stickyEnabled": true,
    "rebalanceExistingAssignmentsByTraffic": false,
    "trafficMetric": "CURRENT_PERIOD"
  }' | jq
```

### Проверить текущий traffic по node

```sql
SELECT uuid, name, address, traffic_used_bytes
FROM nodes
WHERE uuid IN ('<NODE_UUID_A>', '<NODE_UUID_B>')
ORDER BY traffic_used_bytes ASC;
```

### Проверить preview

```bash
curl -sS \
  -H "Authorization: Bearer $API_TOKEN" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID/preview?shortUuid=$SHORT_UUID" | jq '.response.candidates'
```

Ожидание: selected target соответствует ноде с меньшим traffic score.

Важно: traffic strategy не является realtime-балансировкой активных соединений. Она использует последние доступные данные статистики.

Если `stickyEnabled=true` и assignment уже существует, старый target может быть переиспользован. Для пересчета существующих sticky assignments включите:

```text
rebalanceExistingAssignmentsByTraffic
```

## 11. Проверка sticky

### Sticky включен

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID" \
  -d '{
    "enabled": true,
    "strategy": "LEAST_ASSIGNED",
    "unavailablePolicy": "HIDE_HOST",
    "stickyEnabled": true,
    "rebalanceExistingAssignmentsByTraffic": false,
    "trafficMetric": null
  }' | jq
```

Сделайте два запроса подписки одним пользователем:

```bash
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/$SHORT_UUID" >/dev/null
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/$SHORT_UUID" >/dev/null
```

Проверьте assignment:

```sql
SELECT user_uuid, host_uuid, target_uuid, reason, last_used_at
FROM host_balancer_assignments
WHERE host_uuid = '<HOST_UUID>' AND user_uuid = '<USER_UUID>';
```

Ожидание: `target_uuid` остается тем же, `last_used_at` обновляется.

### Sticky выключен

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID" \
  -d '{
    "enabled": true,
    "strategy": "RANDOM",
    "unavailablePolicy": "HIDE_HOST",
    "stickyEnabled": false,
    "rebalanceExistingAssignmentsByTraffic": false,
    "trafficMetric": null
  }' | jq
```

Сделайте несколько запросов. Пользователь может получать разные targets, потому что закрепление выключено.

## 12. Проверка unavailablePolicy

### HIDE_HOST

Сделайте все targets недоступными:

```sql
UPDATE host_balancer_targets
SET status = 'DISABLED'
WHERE balancer_uuid = (
  SELECT uuid FROM host_balancers WHERE host_uuid = '<HOST_UUID>'
);
```

Установите:

```text
unavailablePolicy = HIDE_HOST
```

Запросите подписку. Ожидание: исходный Host не попадает в подписку.

### ORIGINAL_HOST

Установите:

```text
unavailablePolicy = ORIGINAL_HOST
```

Запросите подписку. Ожидание: используется обычная логика Remnawave без target overrides.

### KEEP_LAST_IF_POSSIBLE

Установите:

```text
unavailablePolicy = KEEP_LAST_IF_POSSIBLE
```

Если у пользователя есть старый валидный assignment, он может быть использован. Если нет, поведение зависит от fallback-логики и диагностики preview.

## 13. Decisions audit

### Получить последние решения

```bash
curl -sS \
  -H "Authorization: Bearer $API_TOKEN" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID/decisions?limit=50" | jq
```

Проверьте:

```text
selectedTarget
candidates
excludedTargets
reason
finalHostOverrides
assignmentAction
```

### Проверить, что userUuid masked

В API-ответе пользователь должен быть замаскирован, если endpoint не отдает full UUID для admin-режима.

## 14. Типовые диагностики

### targets не появились в БД

Проверьте Network в браузере:

```text
PUT /api/host-balancers/:hostUuid
PUT /api/host-balancers/:hostUuid/targets
```

Проверьте SQL:

```sql
SELECT COUNT(*)
FROM host_balancer_targets
WHERE balancer_uuid = (
  SELECT uuid FROM host_balancers WHERE host_uuid = '<HOST_UUID>'
);
```

### Нет нужного inbound

Проверьте inbound Host:

```sql
SELECT uuid, remark, config_profile_inbound_uuid
FROM hosts
WHERE uuid = '<HOST_UUID>';
```

Проверьте inbound ноды:

```sql
SELECT node_uuid, config_profile_inbound_uuid
FROM config_profile_inbounds_to_nodes
WHERE node_uuid = '<NODE_UUID>';
```

Если `config_profile_inbound_uuid` Host отсутствует у node, target будет невалиден.

### Host исчез из подписки

Проверьте:

```sql
SELECT unavailable_policy
FROM host_balancers
WHERE host_uuid = '<HOST_UUID>';
```

Если `HIDE_HOST` и candidates пустые, Host скрывается.

### Проверка не тем клиентом

Для curl используйте:

```bash
curl -sS -H 'User-Agent: v2rayN/7.0' "$SUB_URL/$SHORT_UUID"
```

Если правила ответа завязаны на другой клиент, подставьте нужный `User-Agent`.

## 15. Откат

### Аварийно выключить env

```yaml
environment:
  HOST_BALANCER_ENABLED: "false"
```

```bash
docker compose up -d backend
```

### Выключить глобально через API

```bash
curl -sS -X PATCH \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/remnawave-settings" \
  -d '{"hostBalancerGlobalEnabled":false}' | jq
```

### Выключить конкретный Host

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  "$PANEL_URL/api/host-balancers/$HOST_UUID" \
  -d '{
    "enabled": false,
    "strategy": "LEAST_ASSIGNED",
    "unavailablePolicy": "HIDE_HOST",
    "stickyEnabled": true,
    "rebalanceExistingAssignmentsByTraffic": false,
    "trafficMetric": null
  }' | jq
```

### Вернуть официальный образ

```yaml
image: remnawave/backend:2
```

```bash
docker compose pull backend
docker compose up -d backend
```

### Restore DB только как крайняя мера

Перед restore сделайте резервную копию текущего состояния:

```bash
docker exec -t remnawave-postgres pg_dump -U remnawave remnawave > remnawave-db-before-restore.sql
```

Остановите backend:

```bash
docker compose stop backend
```

Восстановите backup:

```bash
docker exec -i remnawave-postgres psql -U remnawave remnawave < remnawave-db-before-native-balancer.sql
```

Запустите backend:

```bash
docker compose up -d backend
```

## 16. Acceptance checklist

- `HOST_BALANCER_ENABLED=false` полностью отключает применение Balancer.
- `HOST_BALANCER_ENABLED=true` разрешает Balancer, но требует глобального включения в UI.
- Глобальная настройка включается и выключается в `Настройки Remnawave -> Host Balancer`.
- Конкретный Host балансируется только если включен его блок `Балансировка`.
- Targets сохраняются через `PUT /api/host-balancers/:hostUuid/targets`.
- Validation показывает проблему до сохранения active target.
- Preview показывает выбранную цель или понятную fallback policy.
- Decisions позволяют понять, почему пользователь получил target.
- Assignments появляются после реального subscription request.
- Откат через env не требует удаления данных из БД.
