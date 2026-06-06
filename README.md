# Remnawave Native Host Balancer

Этот репозиторий содержит форк Remnawave с нативной балансировкой на уровне `Host`.

Native Host Balancer встроен в backend и UI Remnawave. Оператор настраивает балансировку прямо в форме `Host`, а backend выбирает целевую ноду до генерации подписки. Пользователь по-прежнему видит публичное имя исходного `Host`, но технические параметры подключения могут быть подменены выбранной целью.

## Три уровня включения

Балансировка применяется только если включены все три уровня:

1. `HOST_BALANCER_ENABLED=true` в окружении backend.
2. Глобальная настройка `Host Balancer` включена в UI Remnawave.
3. Балансировка включена у конкретного `Host`.

`HOST_BALANCER_ENABLED=false` - это жесткий аварийный выключатель. При таком значении backend полностью пропускает Host Balancer, даже если настройки в UI включены.

## Чем отличается от remnawave-subscription-page-with-balancer

`remnawave-subscription-page-with-balancer` балансирует снаружи Remnawave, на уровне отдельной страницы подписки.

Native Host Balancer работает внутри backend Remnawave:

- не требует отдельной страницы подписки для балансировки;
- не переписывает уже готовый текст подписки;
- видит реальные `Host`, target-ноды, assignments и diagnostics;
- сохраняет audit решений в `host_balancer_decisions`;
- показывает validation, preview и последние решения прямо в UI;
- может использовать обычную страницу подписки Remnawave.

Практический вывод: публичный `Host` остается логической точкой входа, а target только подменяет технические поля подключения.

## Как работает

1. Пользователь запрашивает подписку.
2. Remnawave получает список `Host`, доступных пользователю.
3. Для каждого `Host` backend проверяет `HOST_BALANCER_ENABLED`, глобальную настройку и настройку конкретного `Host`.
4. Если все уровни включены, Balancer выбирает target по стратегии.
5. Если включен sticky mode и assignment уже есть, backend может переиспользовать старый target.
6. Assignment хранится как:

```text
userUuid + hostUuid -> targetUuid
```

7. Пользователь видит remark исходного публичного `Host`.
8. Выбранный target может переопределить:

```text
address
port
sni
host
path
```

9. В `host_balancer_decisions` записывается причина выбора, список кандидатов, исключенные targets и итоговые overrides.

## Установка поверх существующего Remnawave

Ниже пример для установки в `/opt/remnawave`. Подставьте свои имена сервисов, compose-файлы, registry и домены.

### 1. Сделать резервную копию файлов

```bash
cd /opt
sudo tar -czf remnawave-files-before-native-balancer.tgz remnawave
```

### 2. Сделать резервную копию PostgreSQL

Если PostgreSQL работает в docker:

```bash
docker exec -t remnawave-postgres pg_dump -U remnawave remnawave > remnawave-db-before-native-balancer.sql
```

Если имя контейнера или БД другое, проверьте:

```bash
docker ps
docker exec -it remnawave-postgres psql -U remnawave -l
```

### 3. Остановить старый remnawave-subscription-page-with-balancer

```bash
cd /opt/remnawave
docker compose stop remnawave-subscription-page-with-balancer
docker compose rm -f remnawave-subscription-page-with-balancer
```

Если сервис назывался иначе, найдите его:

```bash
docker compose ps
```

### 4. Вернуть обычную subscription-page

В compose-файле используйте обычную subscription page Remnawave или тот вариант, который был до внешнего balancer.

Проверьте, что маршрутизация домена подписки больше не указывает на старую внешнюю balancer-page.

### 5. Собрать образ из root Dockerfile

Важно: используйте `Dockerfile` из корня репозитория. `backend/Dockerfile` может подтянуть frontend без UI Host Balancer.

```bash
cd /opt/remnawave-native-balancer
docker build -t remnawave-native-balancer:local -f Dockerfile .
```

### 6. Запустить с выбранной схемой

Безопасная схема первого запуска:

```yaml
environment:
  HOST_BALANCER_ENABLED: "false"
```

Так backend запустится с новым кодом, но не будет применять Balancer к подпискам.

После проверки UI можно включить:

```yaml
environment:
  HOST_BALANCER_ENABLED: "true"
```

Затем перезапустите backend:

```bash
docker compose up -d backend
```

### 7. Проверить Panel

Откройте Panel и проверьте:

- авторизация работает;
- список пользователей открывается;
- список hosts открывается;
- `Настройки Remnawave -> Host Balancer` доступен;
- env status показывает ожидаемое значение `HOST_BALANCER_ENABLED`;
- в форме `Host` есть блок `Балансировка`.

### 8. Проверить Host Balancer UI

В UI проверьте:

- глобальный switch `Глобально включить Host Balancer`;
- runtime status в форме Host;
- добавление целевых нод;
- validation targets;
- preview выбора;
- последние решения;
- сохранение settings и targets.

## Сборка на слабом VPS

### Симптомы

Сборка может завершиться так:

```text
exit code 137
Killed
```

Чаще всего это означает, что сработал OOM-killer: системе не хватило памяти во время сборки frontend.

### Очистить Docker builder cache

```bash
docker builder prune -af
docker system df
```

### Временно добавить swap 6G

```bash
sudo fallocate -l 6G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h
```

После сборки swap можно отключить:

```bash
sudo swapoff /swapfile
sudo rm /swapfile
```

### Ограничить память Node.js

```bash
export NODE_OPTIONS="--max-old-space-size=2048"
docker build --build-arg NODE_OPTIONS="--max-old-space-size=2048" -t remnawave-native-balancer:local -f Dockerfile .
```

### Использовать Dockerfile.prebuilt-frontend

Если VPS совсем слабый, соберите frontend на более мощной машине:

```bash
cd frontend
npm ci
npm run build
```

Затем собирайте образ backend через root `Dockerfile.prebuilt-frontend`:

```bash
cd ..
docker build -t remnawave-native-balancer:local -f Dockerfile.prebuilt-frontend .
```

## Проверка образа

Обычный `docker run` запускает `entrypoint` приложения. Он потребует рабочий `DATABASE_URL` и другие env.

Такой запуск может падать, хотя образ собран корректно:

```bash
docker run --rm remnawave-native-balancer:local
```

Правильная быстрая проверка содержимого образа:

```bash
docker run --rm --entrypoint sh remnawave-native-balancer:local -c 'node -v && ls -la && ls -la /opt/app'
```

Проверка env внутри контейнера:

```bash
docker run --rm --entrypoint sh -e HOST_BALANCER_ENABLED=true remnawave-native-balancer:local -c 'echo $HOST_BALANCER_ENABLED'
```

## Настройка Host Balancer

### 1. Включить глобально

В Panel:

```text
Настройки Remnawave -> Host Balancer -> Глобально включить Host Balancer
```

Если `HOST_BALANCER_ENABLED=false`, UI покажет, что Balancer отключен переменной окружения. В этом состоянии backend не будет применять Balancer.

### 2. Включить на конкретном Host

Откройте `Host` и включите блок:

```text
Балансировка -> Включить балансировку
```

### 3. Добавить целевые ноды

В блоке `Целевые ноды` нажмите:

```text
+ Добавить целевую ноду
```

Выберите ноду из списка. UI автоматически заполнит:

- `overrideAddress = node.address`;
- `overridePort = host.port`;
- `weight = 1`;
- `priority = 100`;
- `status = ACTIVE`;
- `enabled = true`.

### 4. Проверить validation

Validation показывает:

- `Готова` - target может участвовать в балансировке;
- `Предупреждение` - target можно сохранить, но есть особенность;
- `Ошибка` - active target не должен участвовать и сохранение блокируется.

Типовая ошибка:

```text
На ноде нет inbound, который использует этот Host
```

Это означает, что выбранная нода не имеет нужного inbound из `configProfileInboundUuid` исходного Host.

### 5. Проверить preview

В блоке `Предпросмотр выбора` укажите `userUuid` или `shortUuid` и нажмите `Проверить выбор`.

Preview должен показать:

- пользователя;
- Host;
- стратегию;
- выбранную цель;
- причину выбора;
- кандидатов;
- исключенные targets;
- итоговые overrides, которые получит пользователь в подписке.

Preview является dry-run: он не создает и не меняет assignment.

### 6. Проверить decisions

После реального обновления подписки пользователем откройте:

```text
Балансировка -> Последние решения
```

Там должны быть видны:

- время;
- masked user;
- selected target;
- strategy;
- action;
- reason;
- candidates;
- excluded targets;
- finalHostOverrides.

### 7. Проверить assignments

Assignments появляются после реального subscription request, если стратегия и sticky mode требуют закрепления target за пользователем.

Проверка через SQL есть в `TESTING_HOST_BALANCER.md`.

## Типовые проблемы

### targets не сохраняются из UI

Проверьте DevTools -> Network.

При сохранении изменения targets должны быть запросы:

```text
PUT /api/host-balancers/:hostUuid
PUT /api/host-balancers/:hostUuid/targets
```

`PATCH /api/hosts/` появляется только если изменялись обычные поля Host.

Если `PUT /targets` вернул ошибку, UI не должен показывать общий успех и должен оставить форму открытой.

### target node lacks required inbound

Причина:

```text
target node lacks required inbound
```

Русский текст в UI:

```text
На ноде нет inbound, который использует этот Host
```

Исправление:

- выберите другую target-ноду;
- добавьте нужный inbound на ноду;
- переведите target в `DISABLED`, если хотите сохранить его как заготовку.

### Host исчезает из подписки

Проверьте `unavailablePolicy`.

Если стоит `HIDE_HOST` и нет доступных targets, Host будет скрыт из подписки.

Для диагностики используйте preview. Он покажет, какая fallback policy сработала.

### App not supported через curl

Remnawave может выбирать тип ответа по `User-Agent`. Простой `curl` может попасть в browser/app guard или response rules.

Используйте реалистичный `User-Agent`:

```bash
curl -H 'User-Agent: v2rayN/7.0' 'https://sub.example.com/<shortUuid>'
```

Для raw/debug endpoint используйте авторизованные API-запросы из runbook.

### original Host CSV random мешает тесту

Если у исходного Host или старой схемы есть CSV/random/shuffle логика, результат может выглядеть как балансировка, хотя Native Host Balancer не применился.

На время теста выключите random/shuffle и используйте один понятный Host.

### sticky выключен и пользователь получает разные targets

Если `stickyEnabled=false`, target может пересчитываться при каждом обновлении подписки. Это ожидаемо.

Для стабильного закрепления включите sticky mode.

### traffic strategy не ребалансит существующие sticky assignments

Стратегии `LEAST_TRAFFIC` и `WEIGHTED_LEAST_TRAFFIC` выбирают target по трафику для новых решений.

Существующие sticky assignments не переезжают автоматически, если выключено:

```text
rebalanceExistingAssignmentsByTraffic
```

Включите эту настройку, если нужно пересчитывать существующие назначения по traffic strategy.

## Откат

### 1. Быстрый аварийный откат через env

```yaml
environment:
  HOST_BALANCER_ENABLED: "false"
```

Затем:

```bash
docker compose up -d backend
```

Это самый безопасный откат: данные Balancer остаются в БД, но поток выдачи подписки их не применяет.

### 2. Отключить глобальную настройку в UI

```text
Настройки Remnawave -> Host Balancer -> Глобально включить Host Balancer -> Off
```

Используйте, если UI/API работают и нужен штатный откат без перезапуска backend.

### 3. Отключить конкретный Host

```text
Host -> Балансировка -> Включить балансировку -> Off
```

Так можно отключить проблемный Host, не выключая Balancer целиком.

### 4. Вернуть образ remnawave/backend:2

В compose-файле верните прежний образ:

```yaml
image: remnawave/backend:2
```

Затем:

```bash
docker compose pull backend
docker compose up -d backend
```

Если frontend тоже возвращается на официальный, убедитесь, что Panel соответствует версии backend.

### 5. Restore DB только как крайняя мера

Восстановление БД удалит изменения после резервной копии. Используйте только если миграции или данные повреждены и другие способы не помогли.

Пример:

```bash
docker exec -i remnawave-postgres psql -U remnawave remnawave < remnawave-db-before-native-balancer.sql
```

Перед restore остановите backend и сделайте дополнительную резервную копию текущего состояния.
