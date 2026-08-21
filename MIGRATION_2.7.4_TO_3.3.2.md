# Миграция Remnawave Native Host Balancer: 2.7.4 → 3.3.2

## Зафиксированный upstream

| Компонент | Исходная база | Целевая версия | Целевой tag commit |
| --- | ---: | ---: | --- |
| Backend | 2.7.4 | 3.3.2 | `347e6de` |
| Frontend | 2.7.4 | 3.3.2 | `0288af` |

Ветка миграции: `upgrade/remnawave-latest`.

## Stage 0: аудит

Сравнение выполнено между точными тегами 2.7.4 и 3.3.2, а не с плавающей веткой. Backend
изменил 1288 файлов, frontend — 1008. В upstream добавлено 32 Prisma migration.

Критичные изменения:

- `Users.uuid` удалён, внутренние связи HWID и Subscription Request History переведены на
  numeric `userId`;
- Host: `tag → tags[]`, `xHttpExtraParams → xhttpExtraParams`, удалён `allowInsecure`;
- Host получил `pinnedPeerCertSha256`, `verifyPeerCertByName`, `mihomoIpVersion` и mapper;
- API tokens получили scopes и expiration;
- subscription pipeline, ResolveProxyConfig и XRAY JSON generator существенно переработаны;
- frontend Host dialogs перенесены на общий modal/drawer framework, Mantine обновлён до 9.4.2.

## Что перенесено

- Prisma-модели, миграции, repository/service/controller и contracts Native Host Balancer.
- Стратегии, sticky assignment, target lifecycle, traffic-aware rebalance, fallback policies,
  preview, validation, stats и decision audit.
- Применение выбора target перед обычным, raw и XRAY JSON rendering.
- Fail-open: ошибка Balancer не ломает выдачу подписки.
- Runtime env kill switch и глобальная настройка в Remnawave settings.
- UI секция Balancer в новых Create/Edit Host drawers.
- Balancing-only save не выполняет лишний Host PATCH.
- EN/RU locale keys и проверки отсутствия захардкоженного английского.

## Data migration Native Balancer

`20260720130000_host_balancers_user_id` выполняется до upstream
`20260720132335_drop_user_uuid`:

1. добавляет `user_id BIGINT` в assignments и decisions;
2. заполняет его join-ом с `users.uuid`;
3. перестраивает foreign keys, unique key и decision index;
4. удаляет старые `user_uuid`.

Если join оставит NULL, migration останавливается на `SET NOT NULL`, не удаляя старый UUID:
это намеренная защита от тихой потери assignment.

## Docker

Доступны два воспроизводимых варианта:

- `Dockerfile` — source build локальных backend и frontend 3.3.2;
- `Dockerfile.prebuilt-frontend` — backend source build с заранее собранным
  `frontend/dist` для малопамятных VPS.

Оба используют `node:24.19-trixie-slim` и содержат version labels 3.3.2. Рекомендуемый tag:

```bash
docker build -f Dockerfile -t topor/remnawave-backend:native-balancer-3.3.2 .
docker image inspect topor/remnawave-backend:native-balancer-3.3.2 --format '{{.Id}}'
```

При exit code 137 используйте builder с большей памятью/swap либо
`Dockerfile.prebuilt-frontend`; не снижайте лимит памяти production-контейнера вслепую.

## Staging checklist

- [ ] Проверен backup restore в отдельную PostgreSQL.
- [ ] `prisma migrate deploy` проходит на копии production-БД.
- [ ] Нет failed migration в `_prisma_migrations`.
- [ ] Backend health и login работают.
- [ ] Users, Nodes, Hosts, HWID и SRH читаются.
- [ ] Обычная, raw и XRAY JSON подписки содержат ожидаемые адрес, port и remark.
- [ ] При `HOST_BALANCER_ENABLED=false` результат совпадает с обычным upstream.
- [ ] Preview не создаёт assignment.
- [ ] Реальный subscription request создаёт/reuses assignment.
- [ ] HIDE_HOST, ORIGINAL_HOST, sticky, disabled/dead/draining проверены.
- [ ] Decision audit включён только на время контролируемой проверки.

## Production rollout

1. Создать финальный backup и записать старый image digest.
2. Запретить параллельные изменения панели на время миграции.
3. Запустить 3.3.2 с Balancer kill switch=false.
4. Дождаться успешного завершения миграций и пройти базовые smoke-тесты.
5. Включить Balancer для тестового Host и тестового пользователя.
6. Сравнить subscription output, assignment/decision и логи.
7. Расширять rollout по Host; мониторить 5xx, latency, PostgreSQL writes и размер audit table.

## Rollback

- До применения миграций: вернуть прежний image digest.
- После миграций, если старый backend совместим с новой схемой: выключить Balancer env и вернуть
  проверенный image только после staging-проверки.
- При несовместимости схемы или повреждении данных: остановить backend, сохранить аварийный dump,
  восстановить полный pre-upgrade dump и запустить прежний image digest.
- Не откатывать отдельные SQL-файлы вручную на production: цепочка включает удаление upstream
  колонок и должна откатываться восстановлением согласованного snapshot.

## Ограничения локальной проверки

На Windows-хосте без Docker выполнены Prisma generation, backend/frontend builds, typecheck,
lint/format и unit/integration tests. Сборка образов и migration deploy на реальной копии
production PostgreSQL должны быть выполнены в staging перед production rollout.
