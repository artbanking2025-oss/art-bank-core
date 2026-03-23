# 🚀 Deployment Guide - Art Bank Core

Руководство по развёртыванию Art Bank Platform на Cloudflare Pages.

## 📋 Предварительные требования

1. **Аккаунт Cloudflare**
   - Зарегистрируйтесь на https://dash.cloudflare.com
   - Подтвердите email

2. **Cloudflare API Token**
   - Перейдите в **Deploy** tab в GenSpark
   - Создайте API Token в Cloudflare Dashboard:
     - Profile → API Tokens → Create Token
     - Используйте шаблон "Edit Cloudflare Workers"
     - Permissions: Account/Cloudflare Pages (Edit), Account/D1 (Edit)
   - Сохраните токен в Deploy tab

3. **Установленные инструменты**
   - Node.js 18+
   - npm/pnpm
   - wrangler CLI

## 🔧 Шаг 1: Настройка API ключа

```bash
# После настройки в Deploy tab, проверьте:
npx wrangler whoami

# Должно показать ваш email и account
```

## 🗄️ Шаг 2: Создание Production D1 Database

```bash
# Создайте production базу данных
npx wrangler d1 create art-bank-db

# Сохраните database_id из вывода!
# Обновите wrangler.jsonc:
# "database_id": "ваш-database-id-здесь"
```

**Пример вывода:**
```
✅ Successfully created DB 'art-bank-db'!

[[d1_databases]]
binding = "DB"
database_name = "art-bank-db"
database_id = "12345678-abcd-1234-abcd-123456789abc"
```

## 🔄 Шаг 3: Применение миграций

```bash
# Примените миграции к production базе
npx wrangler d1 migrations apply art-bank-db

# Проверьте таблицы
npx wrangler d1 execute art-bank-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

## 📦 Шаг 4: Сборка проекта

```bash
# Соберите production bundle
npm run build

# Проверьте выходные файлы
ls -lh dist/
# Должны видеть: _worker.js, _routes.json
```

## 🌐 Шаг 5: Создание Pages проекта

```bash
# Создайте проект Cloudflare Pages
npx wrangler pages project create art-bank \
  --production-branch main \
  --compatibility-date 2026-03-10

# Подтвердите настройки
```

## 🚀 Шаг 6: Deploy на Production

```bash
# Развёртывание
npx wrangler pages deploy dist --project-name art-bank

# Вывод покажет URLs:
# ✨ Deployment complete!
# 🌍 https://art-bank.pages.dev
# 🔗 https://main.art-bank.pages.dev
```

## 🔑 Шаг 7: Настройка переменных окружения (опционально)

```bash
# Если нужны secrets
npx wrangler pages secret put API_KEY --project-name art-bank

# Список secrets
npx wrangler pages secret list --project-name art-bank
```

## ✅ Шаг 8: Проверка deployment

После успешного развёртывания:

1. **Откройте production URL**
   ```
   https://art-bank.pages.dev
   ```

2. **Проверьте основные страницы:**
   - `/` - Landing page с Network Graph
   - `/dashboard/analytics` - Analytics Dashboard
   - `/dashboard/3d-visualization` - 3D Visualization
   - `/dashboard/media` - Media Hub
   - `/api-docs` - API Documentation
   - `/artwork/artwork-1` - Sample artwork page

3. **Тест API endpoints:**
   ```bash
   # Nodes
   curl https://art-bank.pages.dev/api/nodes
   
   # Graph data
   curl https://art-bank.pages.dev/api/graph-data
   
   # Export
   curl https://art-bank.pages.dev/api/export/nodes?format=json
   ```

4. **Проверьте Database connectivity:**
   - Откройте Analytics Dashboard
   - Выберите произведение
   - Нажмите "Анализировать"
   - Должны загрузиться данные

## 🔄 Последующие обновления

```bash
# После изменений в коде:
npm run build
npx wrangler pages deploy dist --project-name art-bank

# Откатить к предыдущей версии через Dashboard:
# Pages → art-bank → Deployments → Rollback
```

## 📊 Мониторинг

**Cloudflare Dashboard:**
1. Pages → art-bank → Analytics
   - Requests per day
   - Bandwidth usage
   - Errors

2. D1 → art-bank-db
   - Query statistics
   - Storage usage
   - Recent queries

## 🐛 Troubleshooting

### Ошибка: "Authentication failed"
```bash
# Повторно настройте API key через Deploy tab
# Затем проверьте:
npx wrangler whoami
```

### Ошибка: "Database not found"
```bash
# Убедитесь, что database_id в wrangler.jsonc правильный
npx wrangler d1 list
```

### Ошибка: "Build failed"
```bash
# Проверьте зависимости
npm install

# Очистите кэш
rm -rf node_modules/.vite
npm run build
```

### Static files 404
```bash
# Убедитесь, что public/static файлы скопированы в dist
ls dist/static/

# Проверьте vite.config.ts:
# publicDir: 'public'
```

## 🔐 Security Best Practices

1. **Не коммитьте .env файлы**
   ```bash
   echo ".env" >> .gitignore
   echo ".dev.vars" >> .gitignore
   ```

2. **Используйте Cloudflare Secrets для API ключей**
   ```bash
   npx wrangler pages secret put OPENAI_API_KEY --project-name art-bank
   ```

3. **Настройте Access Control (опционально)**
   - Cloudflare Access для защиты admin routes
   - Rate limiting для API endpoints

## 📞 Support

- **Cloudflare Docs:** https://developers.cloudflare.com/pages/
- **Hono Docs:** https://hono.dev/
- **Issues:** GitHub repository

---

## 🎉 Готово!

После выполнения всех шагов ваша платформа Art Bank будет доступна по адресу:
- **Production:** https://art-bank.pages.dev
- **Preview:** https://main.art-bank.pages.dev

**Следующие шаги:**
1. ✅ Настроить custom domain (опционально)
2. ✅ Добавить JWT authentication
3. ✅ Настроить мониторинг
4. ✅ Заполнить production данными
