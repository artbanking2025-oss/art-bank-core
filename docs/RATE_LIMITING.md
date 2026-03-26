# 🛡️ Rate Limiting Guide

## Обзор

Art Bank использует rate limiting для защиты API от злоупотреблений и DDoS атак.

### Лимиты по типам пользователей

| Тип пользователя | Запросов/минуту | Применяется к |
|-----------------|-----------------|---------------|
| **Public** (неаутентифицированные) | 60 | Публичные эндпоинты |
| **Authenticated** (с JWT) | 300 | Все API после логина |
| **Admin** | 1000 | Admin routes |
| **Strict** (auth endpoints) | 10 | `/api/auth/login`, `/api/auth/register` |

---

## ⚙️ Настройка

### 1. Создать KV Namespace

```bash
# Production KV
npx wrangler kv:namespace create RATE_LIMIT

# Preview KV (для тестирования)
npx wrangler kv:namespace create RATE_LIMIT --preview
```

Вывод команды:
```
{ binding = "RATE_LIMIT", id = "abc123..." }
{ binding = "RATE_LIMIT", preview_id = "def456..." }
```

### 2. Обновить wrangler.jsonc

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "RATE_LIMIT",
      "id": "abc123...",           // Production ID
      "preview_id": "def456..."     // Preview ID
    }
  ]
}
```

### 3. Добавить middleware в index.tsx

```typescript
import { rateLimitMiddleware, strictRateLimitMiddleware } from './middleware/rate-limit'

// Глобальный rate limiter
app.use('*', rateLimitMiddleware)

// Строгий rate limiter для auth
app.use('/api/auth/*', strictRateLimitMiddleware)
```

---

## 📊 Response Headers

Rate limiting добавляет заголовки в каждый ответ:

```http
X-RateLimit-Limit: 60          # Максимум запросов
X-RateLimit-Remaining: 42      # Осталось запросов
X-RateLimit-Reset: 1711483200  # Unix timestamp сброса счётчика
```

### При превышении лимита (429 Too Many Requests):

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "limit": 60,
  "reset": "2024-03-26T21:00:00.000Z"
}
```

---

## 🔑 Идентификация клиентов

### Аутентифицированные пользователи
- По `user_id` из JWT токена
- Ключ в KV: `ratelimit:auth:user:abc123...`

### Неаутентифицированные
- По IP адресу (из `CF-Connecting-IP` или `X-Forwarded-For`)
- Ключ в KV: `ratelimit:public:ip:123.45.67.89`

---

## 🧪 Тестирование

### Локальная разработка (без KV)

Если KV не настроен, middleware автоматически отключается с предупреждением:

```
⚠️ Rate Limiting disabled: KV namespace RATE_LIMIT not configured
```

### Production тест

```bash
# Быстрая серия запросов
for i in {1..70}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    https://art-bank.pages.dev/api/graph-data
done

# Первые 60 запросов: 200 OK
# Запросы 61-70: 429 Too Many Requests
```

### С аутентификацией

```bash
TOKEN="your-jwt-token"

for i in {1..310}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://art-bank.pages.dev/api/nodes
done

# Первые 300 запросов: 200 OK
# Запросы 301-310: 429 Too Many Requests
```

---

## 📈 Мониторинг

### Cloudflare Analytics

1. Dashboard → Workers & Pages → art-bank
2. Metrics → Requests by Status Code
3. Фильтр: `Status Code = 429`

### KV Storage Usage

```bash
# Проверить количество ключей
npx wrangler kv:key list --namespace-id=abc123...

# Посмотреть конкретный ключ
npx wrangler kv:key get "ratelimit:public:ip:123.45.67.89" \
  --namespace-id=abc123...
```

---

## 🔧 Настройка лимитов

Изменить лимиты можно в `src/middleware/rate-limit.ts`:

```typescript
const RATE_LIMITS = {
  public: {
    windowMs: 60 * 1000,      // Временное окно
    maxRequests: 60,           // Максимум запросов
    keyPrefix: 'ratelimit:public:'
  },
  authenticated: {
    windowMs: 60 * 1000,
    maxRequests: 300,          // Увеличить для VIP
    keyPrefix: 'ratelimit:auth:'
  }
}
```

После изменений:
```bash
npm run build
npm run deploy
```

---

## ⚠️ Troubleshooting

### Rate limiting не работает
1. Проверьте, что KV namespace создан
2. Убедитесь, что `binding: "RATE_LIMIT"` в wrangler.jsonc
3. Проверьте логи: `npx wrangler tail`

### Ложные срабатывания
- Если много пользователей за одним IP (корпоративная сеть), рассмотрите переход на user-based rate limiting
- Используйте `X-RateLimit-Remaining` header для предупреждения клиентов

### KV Storage costs
- Cloudflare Workers Free tier: 100,000 reads/day, 1,000 writes/day
- Paid tier: $0.50 per million reads, $5 per million writes
- Типичное использование: ~1-2 write на запрос = $5 за ~1M запросов

---

## 🚀 Best Practices

1. **Используйте JWT**: Аутентифицированные пользователи получают в 5x больше запросов
2. **Кэшируйте данные**: Не делайте повторные запросы за одними и теми же данными
3. **Экспоненциальный backoff**: При получении 429, увеличивайте интервал между запросами
4. **Мониторинг**: Настройте алерты на высокий процент 429 ошибок

---

**Version**: v2.7  
**Last Updated**: 2026-03-26  
**Status**: ✅ Ready (requires KV namespace setup)
