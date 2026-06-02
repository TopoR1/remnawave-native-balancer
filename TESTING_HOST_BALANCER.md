# Host Balancer Testing And Rollback Runbook

This runbook is for testing native Host-level balancing on a real Remnawave deployment. The feature is protected by a global backend kill-switch and must stay disabled until the test window starts.

Replace placeholders such as `<api-domain>`, `<hostUuid>`, `<userUuid>`, `<shortUuid>`, `<db-container>`, and image tags with values from the target server.

## 1. Preconditions

Before changing anything on production-like infrastructure:

1. Announce a test window and identify one test user and one test Host.
2. Back up the database.
3. Confirm the running Remnawave version and current image tags.
4. Confirm the new backend and frontend images were built from the expected commit.
5. Confirm `HOST_BALANCER_ENABLED=false` is present by default.

Database backup example:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > remnawave-before-host-balancer.dump
```

If the database is not in the compose project, run `pg_dump` against the actual PostgreSQL host:

```bash
PGPASSWORD='<password>' pg_dump -h <db-host> -p <db-port> -U <db-user> -d <db-name> -Fc -f remnawave-before-host-balancer.dump
```

Confirm versions and images:

```bash
docker compose ps
docker compose images
docker image inspect <backend-image>:<tag> --format '{{.Id}} {{.Created}}'
docker image inspect <frontend-image>:<tag> --format '{{.Id}} {{.Created}}'
```

Confirm the backend env default:

```bash
docker compose config | grep HOST_BALANCER_ENABLED
```

Expected before testing:

```env
HOST_BALANCER_ENABLED=false
```

## 2. Database Migration

Check migration status before deploying:

```bash
docker compose run --rm backend npx prisma migrate status
```

Apply migrations:

```bash
docker compose run --rm backend npx prisma migrate deploy
```

Verify Host Balancer tables exist:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt host_balancer*"
```

Expected tables:

```text
host_balancers
host_balancer_targets
host_balancer_assignments
host_balancer_decisions
```

Verify important columns and indexes:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d host_balancers"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d host_balancer_targets"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d host_balancer_assignments"
```

Quick SQL checks:

```sql
select count(*) as host_balancers from "host_balancers";
select count(*) as host_balancer_targets from "host_balancer_targets";
select count(*) as host_balancer_assignments from "host_balancer_assignments";
```

## 3. Docker Deployment

Build backend image:

```bash
docker build -t remnawave-backend:host-balancer-test ./backend
```

Build frontend image:

```bash
docker build -t remnawave-frontend:host-balancer-test ./frontend
```

Update `docker-compose.yml` or your deployment override to use the new images:

```yaml
services:
  backend:
    image: remnawave-backend:host-balancer-test
    environment:
      HOST_BALANCER_ENABLED: "false"
      HOST_BALANCER_DECISIONS_ENABLED: "false"

  frontend:
    image: remnawave-frontend:host-balancer-test
```

Restart safely:

```bash
docker compose pull
docker compose up -d --no-deps backend frontend
docker compose ps
docker compose logs --tail=100 backend
```

If the deployment uses separate API workers or schedulers, restart only the services that run the backend API first. The kill-switch is read by subscription generation in the backend API.

## 4. Kill-Switch Verification

Keep the flag disabled after deployment:

```env
HOST_BALANCER_ENABLED=false
```

Restart backend after changing the env:

```bash
docker compose up -d --no-deps backend
```

Request the test user's subscription before enabling balancing:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o before.txt
```

Request it again after deploying new images while the flag is still false:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o after-disabled.txt
```

Compare outputs:

```bash
cmp before.txt after-disabled.txt
```

Expected: no difference. With `HOST_BALANCER_ENABLED=false`, subscription output must match upstream behavior because the backend does not call `HostBalancerService` during subscription generation.

## 5. Test Host Setup

Use one Host and one test user only.

Frontend path:

1. Open `Hosts`.
2. Create one test Host or edit a non-critical Host.
3. Open the `Balancing` section.
4. Enable balancing.
5. Select `LEAST_ASSIGNED` for the first test.
6. Keep sticky assignments enabled.
7. Set unavailable policy to `HIDE_HOST`.
8. Add two targets.
9. For each target, set `overrideAddress` and `overridePort`.
10. Save.

Suggested target setup:

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

API equivalent:

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

Enable global kill-switch only after the Host is configured:

```env
HOST_BALANCER_ENABLED=true
```

Restart backend:

```bash
docker compose up -d --no-deps backend
```

## 6. Subscription Verification

Request subscription:

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o balanced.txt
```

Base64 decode script:

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

No-Python alternative:

```bash
base64 -d balanced.txt > balanced.decoded.txt
cat balanced.decoded.txt
```

Expected behavior:

- VLESS link remark stays the original Host remark.
- VLESS address and port come from the selected target.
- If target overrides `sni`, `host`, or `path`, the decoded link contains those target values.
- Generators are not post-processed; Host fields are changed before proxy config resolving.

Example expected shape:

```text
vless://...@edge-a.example.com:443?...#Original%20Host%20Remark
```

## 7. Assignment Verification

Preview selection without writing an assignment:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/preview?userUuid=<userUuid>" \
  -H "Authorization: Bearer <token>"
```

Preview also accepts `shortUuid`:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/preview?shortUuid=<shortUuid>" \
  -H "Authorization: Bearer <token>"
```

If both `userUuid` and `shortUuid` are present, `userUuid` is used and `shortUuid` is ignored. If both are missing, the API returns `400`.

Check stats:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/stats" \
  -H "Authorization: Bearer <token>"
```

Enable runtime decision audit during focused testing:

```env
HOST_BALANCER_DECISIONS_ENABLED=true
```

Then restart backend and read recent decisions:

```bash
curl -sS "https://<api-domain>/api/host-balancers/<hostUuid>/decisions?limit=50" \
  -H "Authorization: Bearer <token>"
```

Check assignment in SQL after a real subscription request:

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

Sticky assignment behavior:

1. Request the subscription once.
2. Record `target_uuid`.
3. Request the subscription again.
4. `target_uuid` should stay the same while the target is valid and sticky assignments are enabled.
5. `last_used_at` should update.

## 8. Status Lifecycle Tests

Run these tests with one test user and two targets.

`ACTIVE`:

1. Set both targets to `ACTIVE`.
2. Remove the test user's assignment if you need a fresh selection.
3. Request subscription.
4. Expected: an active target can receive the user.

`DRAINING`:

1. Assign the user to Target A.
2. Set Target A to `DRAINING`.
3. Request subscription for the same user.
4. Expected: sticky assignment keeps Target A.
5. Request subscription for a different test user.
6. Expected: new users are not assigned to Target A; they go to an `ACTIVE` target.

`DISABLED`:

1. Assign the user to Target A.
2. Set Target A to `DISABLED` or `enabled=false`.
3. Request subscription.
4. Expected: assignment is moved to another valid `ACTIVE` target.

`DEAD`:

1. Assign the user to Target A.
2. Set Target A to `DEAD`.
3. Request subscription.
4. Expected: assignment is moved to another valid `ACTIVE` target.

SQL helper for checking target status:

```sql
select "uuid", "enabled", "status", "override_address", "override_port"
from "host_balancer_targets"
where "balancer_uuid" = (
  select "uuid" from "host_balancers" where "host_uuid" = '<hostUuid>'
);
```

## 9. Traffic Strategy Tests

Traffic-aware strategies require targets with `nodeUuid`.

`LEAST_TRAFFIC`:

1. Set strategy to `LEAST_TRAFFIC`.
2. Set `trafficMetric` to `LAST_1H`, `LAST_6H`, `LAST_24H`, or `CURRENT_PERIOD`.
3. Ensure Target A and Target B have different recent node traffic.
4. Request subscription for a new test user.
5. Expected: new assignment prefers the lower-traffic node.

`WEIGHTED_LEAST_TRAFFIC`:

1. Set strategy to `WEIGHTED_LEAST_TRAFFIC`.
2. Give Target A a larger `weight` than Target B.
3. Request subscription for new test users.
4. Expected: score is traffic divided by weight, so a higher weight can make a busier node eligible.

Missing traffic fallback:

1. Use targets with `nodeUuid`.
2. Pick a metric window where one or more nodes have no traffic rows.
3. Use preview.
4. Expected diagnostics include:

```text
Traffic data missing, fallback strategy used.
```

The fallback strategy is least-assigned.

Useful SQL for traffic visibility:

```sql
select "node_uuid", "download_bytes", "upload_bytes", "created_at"
from "nodes_traffic_usage_history"
where "node_uuid" in ('<node-a-uuid>', '<node-b-uuid>')
order by "created_at" desc
limit 20;
```

If your schema stores the relevant metric in another traffic history table, check `nodes_usage_history` and `nodes_user_usage_history` as well.

## 10. Rollback

Immediate rollback:

1. Set the backend env flag to false.

```env
HOST_BALANCER_ENABLED=false
```

2. Restart backend.

```bash
docker compose up -d --no-deps backend
docker compose logs --tail=100 backend
```

3. Request subscription again.

```bash
curl -sS -H "User-Agent: v2rayN" "https://<api-domain>/api/sub/<shortUuid>" -o rollback.txt
```

4. Compare with the pre-test disabled output.

```bash
cmp after-disabled.txt rollback.txt
```

Expected: output matches old behavior.

Optional database restore:

Use only if you must remove all test configuration or recover from unrelated database changes.

```bash
docker compose stop backend frontend
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < remnawave-before-host-balancer.dump
docker compose up -d
```

If you do not restore the database, Host Balancer settings and assignments remain stored but are ignored while `HOST_BALANCER_ENABLED=false`.

## 11. Known Limitations

- Traffic stats are asynchronous; immediately after a node change, traffic-aware selection may use stale or missing data.
- Existing sticky assignments are not rebalanced by traffic unless `rebalanceExistingAssignmentsByTraffic` is enabled.
- Host Balancer settings, targets, and assignments remain in the database while the feature is disabled.
- The global kill-switch affects subscription generation only; API settings pages may still show saved balancer configuration.
- `hosts_to_nodes` is not used for native Host Balancer selection.
- If target `overrideAddress` is empty, the target uses the original Host address.
- If all candidates are unavailable, behavior depends on `unavailablePolicy`: `HIDE_HOST`, `ORIGINAL_HOST`, or `KEEP_LAST_IF_POSSIBLE`.
