# Remnawave Native Host Balancer

Remnawave Native Host Balancer - форк Remnawave с нативной балансировкой на уровне `Host`.

Проект находится в разработке. Перед установкой на production обязательно сделайте backup файлов и PostgreSQL, сначала запустите образ с `HOST_BALANCER_ENABLED=false`, проверьте панель, и только затем включайте балансировку для подписок.

Native Host Balancer не требует отдельного сервиса выдачи подписок: выбор target выполняется внутри backend Remnawave до генерации подписки. Оператор настраивает балансировку прямо в Remnawave Panel в форме создания или редактирования `Host`.

## Что делает Native Host Balancer

`Host` остается публичной локацией, которую видит пользователь: remark и логика доступа к Host остаются понятными для клиента.

Внутри одного `Host` можно добавить несколько целевых нод. Когда пользователь обновляет подписку, backend выбирает одну целевую ноду по стратегии, сохраняет или обновляет закрепление пользователя, а затем подменяет технические поля подключения выбранной целью:

- `address`;
- `port`;
- `sni`;
- `host`;
- `path`.

Итоговая модель выглядит так:

```text
user + host -> target node
```

Пользователь видит публичный `Host` и его remark, но фактический адрес и часть transport-параметров могут прийти от выбранной target-ноды.

## Возможности

- Включение балансировки отдельно для каждого `Host`.
- Целевые ноды с весом, приоритетом, статусом и override-полями.
- Sticky assignments: закрепление `user + host -> target`.
- Стратегии выбора:
  - `LEAST_ASSIGNED` - наименьшее число назначений;
  - `WEIGHTED` - распределение с учетом веса;
  - `LEAST_TRAFFIC` - наименьший трафик по последним данным статистики;
  - `WEIGHTED_LEAST_TRAFFIC` - трафик с учетом веса;
  - `PRIORITY_FAILOVER` - приоритет и failover;
  - `RANDOM` - случайный выбор.
- Политики недоступности:
  - `HIDE_HOST` - скрыть Host из подписки, если нет доступной цели;
  - `ORIGINAL_HOST` - использовать исходный Host без target overrides;
  - `KEEP_LAST_IF_POSSIBLE` - попытаться сохранить последний валидный assignment.
- Проверка совместимости inbound перед сохранением targets.
- Preview выбора target без изменения assignments.
- Decision audit через `host_balancer_decisions`, если включен `HOST_BALANCER_DECISIONS_ENABLED`.
- Глобальный флаг включения в настройках Remnawave.
- Системный аварийный выключатель через env.

## Модель включения

Balancer применяется к подпискам только когда включены все нужные уровни:

1. `HOST_BALANCER_ENABLED=true` в окружении backend.
2. Глобальная настройка Host Balancer включена в Remnawave Panel.
3. Балансировка включена у конкретного `Host`.

`HOST_BALANCER_ENABLED=false` - безопасный системный rollback. При таком значении backend не применяет Balancer к подпискам вообще, даже если настройки в UI включены.

Рекомендуемый production-сценарий:

1. Запустить новый backend image с `HOST_BALANCER_ENABLED=false`.
2. Проверить, что Remnawave Panel открывается, миграции прошли, форма Host работает.
3. Переключить `HOST_BALANCER_ENABLED=true`.
4. Включить глобальную настройку в UI.
5. Включить балансировку только на тестовом `Host`.
6. Проверить preview, curl подписки, SQL assignments и decisions.

`HOST_BALANCER_DECISIONS_ENABLED=true` включает запись audit-решений в таблицу `host_balancer_decisions`. Это удобно для диагностики, но на очень нагруженных установках может добавлять записи в БД при выдаче подписок.

## Как пользоваться Host Balancer в UI

Откройте:

```text
Remnawave Panel -> Hosts -> открыть или создать Host -> секция "Балансировка"
```

Именно в секции `Балансировка` настраивается поведение Balancer для конкретного `Host`: включение, стратегия, политика недоступности, sticky assignments, целевые ноды, preview и последние решения.

Рекомендуемый порядок настройки:

1. Убедиться, что системный статус показывает `HOST_BALANCER_ENABLED=true`.
2. Включить глобальную настройку Host Balancer в настройках Remnawave.
3. Открыть нужный `Host`.
4. Включить балансировку для этого `Host`.
5. Выбрать стратегию и политику недоступности.
6. Добавить целевые ноды.
7. Проверить inbound compatibility.
8. Сохранить Host.
9. Выполнить предпросмотр выбора.
10. Обновить подписку тестового пользователя и проверить последние решения.

## Статусы включения

В UI могут отображаться три разных уровня включения. Они не заменяют друг друга, а работают вместе.

| Статус | Что означает |
| --- | --- |
| `Balancer разрешён переменной окружения` | Backend запущен с `HOST_BALANCER_ENABLED=true`. Если здесь `false`, Balancer не применяется к подпискам вообще. |
| `Глобально включён` | Включена глобальная настройка Host Balancer в настройках Remnawave. |
| `Для этого Host включён` | Включён переключатель балансировки в конкретном `Host`. |

Balancer применяется только если включены все уровни: env-разрешение, глобальная настройка и переключатель конкретного Host. Если хотя бы один уровень выключен, подписка будет генерироваться без выбора target для этого Host.

## Стратегии

Стратегия определяет, какую валидную target-ноду получит новый выбор. Если включено закрепление назначений, уже закреплённый пользователь обычно остаётся на прежней target-ноде, пока она валидна.

| Стратегия | В UI | Как работает |
| --- | --- | --- |
| `LEAST_ASSIGNED` | Наименьшее число назначений | Выбирает активную валидную цель с минимальным количеством закреплённых пользователей. |
| `WEIGHTED` | По весам | Распределяет новых пользователей пропорционально весу целей. Чем больше вес, тем чаще target будет выбираться. |
| `LEAST_TRAFFIC` | Наименьший трафик | Выбирает цель с меньшим трафиком по данным статистики. Это не realtime load balancer соединений. |
| `WEIGHTED_LEAST_TRAFFIC` | Взвешенный трафик | Учитывает трафик и вес цели: более мощной ноде можно поставить больший вес, но перегруженная нода будет менее предпочтительной. |
| `PRIORITY_FAILOVER` | Приоритетный резерв | Использует цель с лучшим приоритетом, резервные цели подключаются при недоступности основной. |
| `RANDOM` | Случайно | Выбирает случайную валидную цель. |

Для стратегий по трафику важно, чтобы backend видел статистику нод. Если статистика ещё не собрана или недоступна, выбор может перейти к fallback-логике, а в UI может отображаться `Трафик: -`.

## Политики недоступности

Политика недоступности отвечает за ситуацию, когда Balancer включён, но не нашёл ни одной target-ноды, которую можно использовать.

| Политика | В UI | Что произойдёт |
| --- | --- | --- |
| `HIDE_HOST` | Скрыть Host | Если нет доступных целей, Host не попадёт в подписку. |
| `ORIGINAL_HOST` | Исходный Host | Если нет доступных целей, будет использована обычная логика Remnawave без target override. |
| `KEEP_LAST_IF_POSSIBLE` | Оставить последнее назначение | Если у пользователя уже было назначение, Balancer попытается сохранить его, если цель ещё валидна. |

Для production обычно безопаснее начинать с `ORIGINAL_HOST`, если важно не потерять Host в подписке при ошибке настройки. `HIDE_HOST` полезен, когда лучше не отдавать пользователю заведомо нерабочую локацию.

## Закреплять назначения

Закрепление назначений хранит связь:

```text
user + host -> target
```

Если закрепление включено, повторное обновление подписки оставляет пользователя на той же target-ноде. Target меняется только если прежняя цель стала недоступной, отключена, аварийна, перестала проходить inbound compatibility или нарушает ограничения.

Если закрепление выключено, target может пересчитываться при каждом обновлении подписки. Это удобно для тестов и случайного распределения, но может быть менее стабильно для пользователя.

## Целевые ноды

Целевая нода - это реальная нода, технические параметры которой могут быть подставлены в подписку вместо публичных параметров Host.

В карточке target важны такие поля:

| Поле | Что означает |
| --- | --- |
| Название ноды | Человекочитаемое имя node из Remnawave. |
| Адрес ноды | Адрес node в Remnawave, обычно используется как подсказка для `Адрес в подписке`. |
| Профиль/inbound | Inbound/config profile, который должен быть доступен на target-ноде для совместимости с Host. |
| Адрес в подписке | `overrideAddress`: адрес, который получит клиент, если выбрана эта target. |
| Порт в подписке | `overridePort`: порт, который получит клиент. |
| Статус цели | Административный статус target: активна, draining, disabled или dead. |
| Статус ноды | Runtime-состояние самой node: подключена ли она, не отключена ли администратором, доступна ли backend. |
| Совместимость inbound | Проверка, есть ли на target-ноде inbound, который использует исходный Host. |
| Назначения | Сколько пользователей закреплено за этой target для данного Host. |
| Трафик | Последние доступные данные статистики по ноде, если backend смог их получить. |
| Вес | Число для weighted-стратегий: target с большим весом выбирается чаще. |
| Приоритет | Число для failover-логики: цель с лучшим приоритетом используется раньше резервных. |

Три похожих статуса в UI означают разные вещи:

| Статус | Значение |
| --- | --- |
| `Активен` | Административный статус target позволяет использовать цель. |
| `Готова` | Target технически валидна: нода существует, доступна, не отключена, имеет нужный inbound и проходит ограничения. |
| `Участвует` | Target реально попала в candidates и может быть выбрана текущей стратегией. |

Target может быть `Активен`, но не `Готова`, если на ноде нет нужного inbound. Target может быть `Готова`, но не `Участвует`, если она исключена стратегией, лимитом или текущим статусом.

## Почему в целевой ноде может быть `Трафик: -` или `Назначения: 0`

`Трафик: -` обычно означает, что статистика ноды ещё не собрана, недоступна или UI не получил enriched stats от API. Для новых нод это нормальная временная ситуация.

`Назначения: 0` до первого реального запроса подписки тоже нормально: preview не создаёт assignment, а запись появляется только после фактической выдачи подписки пользователю.

Если в `Последних решениях` видно, что Balancer выбирал target и создавал или использовал assignment, но карточки target всё ещё показывают старые значения, это похоже на рассинхрон UI. Проверьте refetch данных, endpoint targets/enriched stats и ответ API в DevTools.

## Предпросмотр выбора

Предпросмотр выбора - это dry-run. Он показывает, какую target получил бы пользователь, но не создаёт и не меняет assignment.

Preview полезен, когда нужно понять:

- какая target была бы выбрана;
- какие targets попали в candidates;
- какие targets исключены и почему;
- сработает ли `HIDE_HOST`, `ORIGINAL_HOST` или `KEEP_LAST_IF_POSSIBLE`;
- есть ли ошибка `target node lacks required inbound`;
- влияет ли disabled/dead/draining status;
- какие итоговые `address` и `port` получит пользователь.

Для проверки укажите пользователя через `userUuid` или `shortUuid`, запустите preview и сравните результат с настройками target-ноды.

## Последние решения

`Последние решения` - это audit фактической выдачи подписок. В отличие от preview, эти записи появляются после реального запроса подписки.

Раздел работает только если backend запущен с:

```yaml
HOST_BALANCER_DECISIONS_ENABLED: "true"
```

В решении обычно видны:

- выбранная target;
- стратегия;
- причина выбора;
- candidates;
- excluded targets;
- итоговые `address` и `port`;
- fallback policy;
- действие с assignment: создан, переиспользован, обновлён или пропущен.

Если решений нет, сначала проверьте `HOST_BALANCER_DECISIONS_ENABLED`, затем выполните реальный запрос подписки тестового пользователя. Preview сам по себе не создаёт audit-запись выдачи.

## Типовые UI-проблемы

| Проблема | Что означает | Что проверить |
| --- | --- | --- |
| В target cards `Трафик: -` | Нет данных статистики или UI не получил enriched stats. | Дождаться сбора статистики, проверить API targets/enriched stats и ответ в DevTools. |
| `Назначения: 0`, но в decisions есть назначения | Карточки targets не обновили stats или получили старый ответ. | Проверить refetch после запроса подписки, endpoint targets, SQL `host_balancer_assignments`. |
| Вместо inbound name отображается UUID | UI не подтянул display name профиля/inbound. | Проверить загрузку справочника inbound/config profile и mapping UUID -> name. |
| Дублируется ошибка `На ноде нет inbound...` | UI показывает alert и тот же plain text рядом. | Оставить понятный alert, дублирующий plain text в UI не нужен. |
| Strategy/policy непонятны оператору | Неочевидны последствия выбора. | Свериться с разделами `Стратегии` и `Политики недоступности` выше. |

## Требования

- Linux VPS.
- Docker и Docker Compose plugin.
- Git.
- Доступ к существующей установке Remnawave или новая установка Remnawave.
- Желательно 6-8 GB RAM для сборки frontend внутри Docker.
- На слабом VPS используйте swap или `Dockerfile.prebuilt-frontend`.

## Установка на существующий сервер Remnawave

Команды ниже рассчитаны на типовую установку в `/opt/remnawave`. Если у вас другие имена compose-сервисов, контейнеров или путей, сначала посмотрите реальное состояние:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

### 1. Перейти на сервер

```bash
cd /opt
```

### 2. Сделать backup конфигов

```bash
mkdir -p /opt/remnawave-backups
tar -C /opt -czf /opt/remnawave-backups/remnawave-configs-$(date +%F-%H%M%S).tar.gz remnawave
```

### 3. Сделать backup PostgreSQL

Сначала найдите имя контейнера или compose-сервиса PostgreSQL:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

Пример для compose-сервиса `remnawave-db`:

```bash
cd /opt/remnawave
docker compose exec -T remnawave-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > /opt/remnawave-backups/remnawave-db-before-native-balancer.dump
```

Если service называется `db`, `postgres` или иначе, замените `remnawave-db` на свое имя. Если переменные `POSTGRES_USER` и `POSTGRES_DB` не проброшены в shell контейнера, проверьте `.env` и укажите значения явно:

```bash
docker compose exec -T remnawave-db pg_dump -U remnawave -d remnawave -Fc > /opt/remnawave-backups/remnawave-db-before-native-balancer.dump
```

### 4. Скачать репозиторий

Для новой папки:

```bash
cd /opt
git clone https://github.com/TopoR1/remnawave-native-balancer.git
cd /opt/remnawave-native-balancer
```

Если папка уже есть:

```bash
cd /opt/remnawave-native-balancer
git status
git pull --ff-only
```

### 5. Собрать Docker image

Используйте корневой `Dockerfile`: он собирает локальный frontend и backend вместе.

```bash
cd /opt/remnawave-native-balancer
docker build --progress=plain -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

### 6. Подключить image в docker-compose.override.yml

Откройте `/opt/remnawave/docker-compose.override.yml` и переопределите service backend. В типовой установке service называется `remnawave`; если у вас другое имя, используйте свое.

```yaml
services:
  remnawave:
    image: topor/remnawave-backend:native-balancer
    environment:
      HOST_BALANCER_ENABLED: "false"
      HOST_BALANCER_DECISIONS_ENABLED: "true"
```

`HOST_BALANCER_ENABLED=false` на первом запуске безопасен: панель обновится, миграции применятся, но подписки еще не будут балансироваться. После проверки можно поменять значение на `"true"`.

### 7. Перезапустить backend

```bash
cd /opt/remnawave
docker compose up -d --force-recreate remnawave
docker logs remnawave --tail=200
```

Если service называется `backend`, замените `remnawave` на `backend`.

### 8. Проверить переменные

```bash
docker exec remnawave printenv | grep HOST_BALANCER
```

Ожидаемо на первом запуске:

```text
HOST_BALANCER_ENABLED=false
HOST_BALANCER_DECISIONS_ENABLED=true
```

### 9. Проверить панель

Откройте Remnawave Panel и проверьте:

- авторизация работает;
- список пользователей открывается;
- список Hosts открывается;
- в настройках Remnawave есть карточка Host Balancer;
- в форме Host есть секция `Балансировка`;
- UI показывает статус `HOST_BALANCER_ENABLED`.

## Включение балансировки после проверки

### 1. Включить env kill-switch

В `/opt/remnawave/docker-compose.override.yml` поменяйте:

```yaml
HOST_BALANCER_ENABLED: "true"
```

Перезапустите backend:

```bash
cd /opt/remnawave
docker compose up -d --force-recreate remnawave
docker exec remnawave printenv | grep HOST_BALANCER
```

### 2. Включить глобальную настройку

В Remnawave Panel откройте настройки Remnawave и включите Host Balancer. Если `HOST_BALANCER_ENABLED=false`, UI покажет, что системный выключатель не дает применить настройку.

### 3. Настроить конкретный Host

В форме Host:

1. Откройте секцию `Балансировка`.
2. Включите балансировку для Host.
3. Выберите стратегию.
4. Выберите политику недоступности.
5. Добавьте целевые ноды.
6. Проверьте совместимость inbound.
7. Сохраните Host.
8. Выполните preview выбора.
9. Обновите подписку тестового пользователя.

## Обновление форка

### 1. Проверить состояние репозитория

```bash
cd /opt/remnawave-native-balancer
git status
```

### 2. Если рабочее дерево чистое

```bash
git pull --ff-only
docker build --progress=plain -f Dockerfile -t topor/remnawave-backend:native-balancer .
cd /opt/remnawave
docker compose up -d --force-recreate remnawave
docker logs remnawave --tail=200
```

### 3. Если git pull не проходит из-за локальных изменений

Ошибки вида:

```text
Your local changes would be overwritten
Pulling is not possible because you have unmerged files
```

означают, что на сервере есть локальные изменения или незавершенный merge/rebase. Для deploy-сервера безопаснее сохранить backup и вернуть рабочее дерево к состоянию remote-ветки:

```bash
cd /opt/remnawave-native-balancer

BACKUP_DIR="/opt/remnawave-backups/native-balancer-worktree-$(date +%F-%H%M%S)"
mkdir -p "$BACKUP_DIR"

git status > "$BACKUP_DIR/git-status.txt" || true
git diff > "$BACKUP_DIR/worktree.diff" || true
git diff --staged > "$BACKUP_DIR/staged.diff" || true

tar --exclude='.git' -czf "$BACKUP_DIR/worktree.tar.gz" -C /opt remnawave-native-balancer

git merge --abort || true
git rebase --abort || true

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin
git reset --hard "origin/$BRANCH"
git clean -fd

git status
```

Важно: `git reset --hard` и `git clean -fd` удаляют локальные изменения в репозитории. Backup сохраняется в `/opt/remnawave-backups`, но на production-сервере лучше не вести разработку напрямую.

После очистки:

```bash
docker build --progress=plain -f Dockerfile -t topor/remnawave-backend:native-balancer .
cd /opt/remnawave
docker compose up -d --force-recreate remnawave
docker logs remnawave --tail=200
```

## Сборка на слабом VPS

### Ошибка exit code 137

Если сборка падает так:

```text
Killed
exit code: 137
```

обычно это OOM-killer: Vite/frontend build не поместился в RAM/swap. Это не ошибка TypeScript и не признак сломанного кода.

Проверьте память:

```bash
free -h
swapon --show
docker system df
```

Очистите Docker build cache:

```bash
docker builder prune -af
```

Добавьте временный swap 8G:

```bash
fallocate -l 8G /swapfile-build
chmod 600 /swapfile-build
mkswap /swapfile-build
swapon /swapfile-build

free -h
swapon --show
```

Повторите сборку:

```bash
cd /opt/remnawave-native-balancer
docker build --progress=plain -f Dockerfile -t topor/remnawave-backend:native-balancer .
```

Если нужно ограничить heap Node.js:

```bash
docker build --progress=plain \
  --build-arg FRONTEND_NODE_OPTIONS="--max-old-space-size=4096" \
  -f Dockerfile \
  -t topor/remnawave-backend:native-balancer .
```

После сборки уберите временный swap:

```bash
swapoff /swapfile-build
rm /swapfile-build
free -h
```

### Рекомендуемый вариант для слабого VPS

`Dockerfile.prebuilt-frontend` позволяет собрать frontend заранее на локальном ПК или CI, а на сервере собрать backend image с готовым `frontend/dist`.

На машине для сборки frontend:

```bash
cd frontend
npm ci
NODE_OPTIONS=--max-old-space-size=4096 npm run cb
cd ..
```

Затем на сервере или в той же рабочей папке:

```bash
docker build --progress=plain \
  -f Dockerfile.prebuilt-frontend \
  -t topor/remnawave-backend:native-balancer .
```

## Проверка Docker image

Обычный `docker run` запускает `docker-entrypoint.sh`. Entrypoint пытается выполнить миграции и требует `DATABASE_URL`, поэтому такая команда может упасть:

```bash
docker run --rm topor/remnawave-backend:native-balancer sh -lc "ls -la /opt/app/frontend"
```

Для inspection используйте `--entrypoint sh`:

```bash
docker run --rm --entrypoint sh topor/remnawave-backend:native-balancer \
  -lc "ls -la /opt/app/frontend && find /opt/app/frontend -maxdepth 2 -type f | head -30"
```

Проверка, что frontend assets попали в образ:

```bash
docker run --rm --entrypoint sh topor/remnawave-backend:native-balancer \
  -lc "find /opt/app/frontend -type f | grep -E 'index.html|assets' | head -30"
```

## Диагностика после запуска

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
docker logs remnawave --since=5m | grep -Ei "ERROR|exception|host.?balancer|Nest can't resolve|DATABASE_URL|exited" || true
docker exec remnawave printenv | grep HOST_BALANCER
```

Если контейнер называется иначе, замените `remnawave` на свое имя.

## SQL-проверка Balancer

Задайте UUID проверяемого Host:

```bash
HOST_UUID="PUT_HOST_UUID_HERE"
```

Пример для контейнера `remnawave-db`:

```bash
docker exec -i remnawave-db sh -lc 'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"' <<SQL
SELECT *
FROM host_balancers
WHERE host_uuid = '$HOST_UUID';

SELECT
  t.uuid,
  t.node_uuid,
  t.status,
  t.weight,
  t.priority,
  t.override_address,
  t.override_port
FROM host_balancer_targets t
JOIN host_balancers b ON b.uuid = t.balancer_uuid
WHERE b.host_uuid = '$HOST_UUID';

SELECT
  a.uuid,
  a.user_uuid,
  a.target_uuid,
  a.reason,
  a.created_at,
  a.updated_at,
  a.last_used_at
FROM host_balancer_assignments a
WHERE a.host_uuid = '$HOST_UUID'
ORDER BY a.updated_at DESC
LIMIT 20;

SELECT
  d.created_at,
  d.user_uuid,
  d.target_uuid,
  d.strategy,
  d.reason,
  d.diagnostics
FROM host_balancer_decisions d
WHERE d.host_uuid = '$HOST_UUID'
ORDER BY d.created_at DESC
LIMIT 10;
SQL
```

Основные таблицы:

- `host_balancers`;
- `host_balancer_targets`;
- `host_balancer_assignments`;
- `host_balancer_decisions`.

`host_balancer_decisions` заполняется только если включен audit решений.

## Проверка подписки через curl

Некоторые клиенты требуют специальные headers. Без них можно получить ответ вида:

```text
App not supported => 0.0.0.0:1
```

Рабочий пример:

```bash
SHORT_UUID="PUT_SHORT_UUID_HERE"

curl -sS --compressed \
  -A "v2raytun/windows" \
  -H "X-App-Version: 3.8.12" \
  -H "X-Device-Os: Windows" \
  -H "X-Device-Model: PC | Windows 10 Pro" \
  -H "X-Ver-Os: Windows 10 Pro | 22H2" \
  -H "X-Hwid: test-hwid" \
  "https://YOUR_SUB_DOMAIN/$SHORT_UUID" \
  -o /tmp/native-balanced.raw
```

Декод и просмотр VLESS:

```bash
python3 - <<'PY'
import base64
import urllib.parse

raw = open('/tmp/native-balanced.raw', 'rb').read()
text = raw.decode('utf-8', 'ignore').strip()

try:
    decoded = base64.b64decode(text + '=' * (-len(text) % 4)).decode('utf-8', 'ignore')
    if 'vless://' in decoded:
        text = decoded
except Exception:
    pass

print('VLESS_COUNT:', text.count('vless://'))
for line in text.splitlines():
    if line.startswith('vless://'):
        remark = urllib.parse.unquote(line.split('#', 1)[1]) if '#' in line else ''
        hostport = line.split('@', 1)[1].split('?', 1)[0] if '@' in line else ''
        print(remark, '=>', hostport)
PY
```

Проверьте, что remark остался от публичного Host, а `hostport` соответствует выбранной target-ноде.

## Типовые проблемы

| Проблема | Причина | Решение |
| --- | --- | --- |
| Нет секции `Балансировка` в Host UI | Собран не корневой `Dockerfile` или запущен не тот image | Собрать из корня: `docker build -f Dockerfile ...`, пересоздать backend container |
| `HOST_BALANCER_ENABLED=false` | Balancer отключен системно | Поставить `HOST_BALANCER_ENABLED: "true"` и пересоздать backend |
| `target node lacks required inbound` | Target-нода не имеет inbound/config profile, который использует Host | Добавить нужный inbound на ноду или выбрать совместимую target-ноду |
| Все пользователи попадают на одну ноду | Остальные targets исключены из candidates | Посмотреть preview/decisions diagnostics, проверить inbound compatibility, status, enabled, limits |
| В приложении адрес меняется, но `target_uuid` в assignments не меняется | Исходный Host может содержать CSV/random-адреса или сработала fallback-логика | Для чистого теста уберите CSV/random из исходного Host, используйте preview и SQL decisions |
| `docker build` падает с `exit code 137` | OOM-killer | Добавить swap 8G или использовать `Dockerfile.prebuilt-frontend` |
| `docker run` падает с `DATABASE_URL missing` | Запущен entrypoint приложения | Для inspection использовать `--entrypoint sh` |
| `git pull` пишет `unmerged files` | Незавершенный merge/rebase или локальные изменения | Использовать процедуру backup + abort/reset из раздела обновления |

## Откат

### 1. Мягкий откат через env

В `/opt/remnawave/docker-compose.override.yml`:

```yaml
services:
  remnawave:
    environment:
      HOST_BALANCER_ENABLED: "false"
```

Перезапуск:

```bash
cd /opt/remnawave
docker compose up -d --force-recreate remnawave
```

Это самый безопасный откат: данные Balancer остаются в БД, но backend не применяет их при выдаче подписок.

### 2. Отключить конкретный Host в UI

Откройте Host и выключите секцию `Балансировка`. Используйте этот вариант, если проблема касается только одного Host.

### 3. Вернуть официальный backend image

В compose override замените image:

```yaml
services:
  remnawave:
    image: remnawave/backend:2
```

Перезапустите backend:

```bash
cd /opt/remnawave
docker compose up -d --force-recreate remnawave
```

Если service называется `backend`, замените имя service в compose и командах.

### 4. Restore DB только как крайняя мера

Миграции Native Host Balancer добавляют таблицы и поля для настроек. Обычно достаточно мягкого отката через env или возврата image. Restore БД используйте только если данные повреждены или нужно полностью вернуть состояние на момент backup.

Перед restore сделайте дополнительный backup текущего состояния:

```bash
docker compose exec -T remnawave-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > /opt/remnawave-backups/remnawave-db-before-restore.dump
```

## Финальный checklist

- `docker ps` показывает backend `Up` или `healthy`.
- Panel открывается.
- В Host UI есть секция `Балансировка`.
- `docker exec remnawave printenv | grep HOST_BALANCER` показывает ожидаемые значения.
- Глобальная настройка Host Balancer имеет ожидаемое состояние.
- Целевые ноды добавлены и проходят validation.
- Preview выбора работает.
- После обновления подписки тестового пользователя появляется запись в `host_balancer_assignments`.
- `host_balancer_decisions` показывает candidates/excludedTargets, если включен audit.
- Подписка через curl содержит публичный remark Host и target address/port выбранной ноды.

## Дополнительный регламент тестирования

Подробные API, SQL и сценарные проверки вынесены в `TESTING_HOST_BALANCER.md`. README остается основным входом для установки, обновления, сборки, диагностики и отката.
