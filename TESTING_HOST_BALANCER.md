# Testing Host Balancer

Native Host Balancer is protected by a global kill-switch. Keep it disabled until the test window starts.

## Enable

Set the backend env flag and restart the API:

```env
HOST_BALANCER_ENABLED=true
```

Default and rollback value:

```env
HOST_BALANCER_ENABLED=false
```

When the flag is `false`, subscription generation skips `HostBalancerService` and keeps upstream Remnawave behavior.

## Create Host Balancer

Use the Host create/edit modal in the frontend:

1. Open `Hosts`.
2. Create or edit a Host.
3. Open `Balancing`.
4. Enable balancing.
5. Select strategy, sticky assignment mode, unavailable policy, and traffic metric if using traffic strategies.

API equivalent:

```http
PUT /api/host-balancers/{hostUuid}
PATCH /api/host-balancers/{hostUuid}/toggle
```

## Add Targets

In the same Host modal, add targets in the balancing table:

1. Select a Node when the target should track node state or traffic.
2. Set `overrideAddress` and `overridePort` for the actual connection endpoint.
3. Set `weight`, `priority`, `maxAssignedUsers`, and status.
4. Save the Host.

API equivalent:

```http
PUT /api/host-balancers/{hostUuid}/targets
```

If a target has `nodeUuid` but no `overrideAddress`, it uses the original Host address.

## Request Subscription

Request a normal user subscription URL:

```bash
curl -H "User-Agent: v2rayN" "https://SUB_PUBLIC_DOMAIN/{shortUuid}"
```

For base64 Xray output, decode it and inspect the VLESS links:

```bash
curl -s -H "User-Agent: v2rayN" "https://SUB_PUBLIC_DOMAIN/{shortUuid}" | base64 -d
```

Expected result for an enabled balancer:

- link remark stays the original Host remark;
- address and port come from the selected target override;
- `sni`, `host`, and `path` use target overrides when set.

## Verify Assignments

Use preview before requesting a real subscription:

```http
GET /api/host-balancers/{hostUuid}/preview?userUuid={userUuid}
```

After a real subscription request, check stats:

```http
GET /api/host-balancers/{hostUuid}/stats
```

Direct database check:

```sql
select "host_uuid", "user_uuid", "target_uuid", "reason", "last_used_at"
from "host_balancer_assignments"
where "host_uuid" = '<hostUuid>';
```

## Disable Instantly

Set the env flag back to false and restart the API:

```env
HOST_BALANCER_ENABLED=false
```

This is the one-line rollback. Existing balancer settings and assignments remain in the database, but subscription generation does not read or apply them while the flag is disabled.

## Known Test Limits

- Generators are not modified; balancing happens before proxy config resolving.
- `hosts_to_nodes` is not reused for subscription balancing.
- Existing sticky assignments are not rebalanced by traffic unless `rebalanceExistingAssignmentsByTraffic` is enabled.
- Missing traffic data falls back to least-assigned selection and reports diagnostics.
