# Art Bank Core - Art-OS: Гибридная платформа для арт-рынка

## 🎯 Обзор проекта

**Art Bank Core (Art-OS)** - это трёхслойная аналитическая платформа для арт-рынка с графовой моделью данных, событийной архитектурой и математическим ядром для расчёта справедливых цен (Fair Value).

### 🏗️ Архитектура Art-OS (3 слоя)

#### **Слой 1: Графовое Хранилище** 🗄️
- **Cloudflare D1** (текущая реализация) - SQLite-based графовая БД
- **Neo4j** (рекомендуется для продакшена) - архивная графовая БД на диске
- **Memgraph** (рекомендуется для продакшена) - быстрая in-memory графовая БД
- **Синхронизация**: События через EventBus (упрощённо) / Kafka/RabbitMQ (продакшен)

#### **Слой 2: Core Analytics Service** 🧮
**Python FastAPI сервис** с математическими алгоритмами:
- **KDE (Kernel Density Estimation)** - построение тепловой карты цен
- **NumPy/Pandas** - векторные вычисления
- **SciPy/scikit-learn** - статистическое моделирование
- **Входные данные**:
  - Исторические цены аналогичных активов
  - Репутационные метрики участников (trust_level)
  - Контекстные события (выставки, упоминания)
- **Выходные данные**:
  - Fair Value (справедливая цена)
  - Risk Score (коэффициент риска)
  - Confidence Interval (доверительный интервал)
  - Обоснование решения

#### **Слой 3: Маршрутизатор** 🚦
**Hono Framework** (TypeScript):
- Принимает запросы от пользователей
- Делегирует Analytics Service для расчётов
- Контролирует права доступа
- Обеспечивает шифрование

### 🌟 Основные концепции

- **Узлы (Nodes)**: Участники рынка - художники, коллекционеры, галереи, банки, эксперты
- **Рёбра (Edges)**: Связи между участниками - создание, владение, экспонирование, валидация, финансирование
- **Репутационный вес**: Trust Level (0.0 - 1.0) для каждого участника, влияющий на ценообразование
- **Провенанс**: Полная история жизни произведения в графе
- **Автоматическая валидация**: Система выявляет аномалии через анализ графа
- **Событийная архитектура**: TRADE_CREATED, ASSET_VALIDATED, PRICE_CALCULATED

## 🚀 Текущий статус

### ✅ Реализованные функции

#### Backend API (Hono + Cloudflare D1)
- ✅ **Управление узлами (Nodes API)**
  - Создание узлов всех типов (artist, collector, gallery, bank, expert)
  - Получение узлов по типу и ID
  - Обновление репутационного веса
  
- ✅ **Управление связями (Edges API)**
  - Создание связей между узлами
  - Получение связей по узлу
  - Расчет весов связей
  
- ✅ **Управление произведениями (Artworks API)**
  - Создание произведений с цифровой подписью
  - Привязка к художнику и владельцу
  - Отслеживание провенанса
  - Fair Price Corridor (FPC) - ценовой коридор
  
- ✅ **Транзакции (Transactions API)**
  - Создание транзакций с кредитованием
  - История сделок
  - Обновление владельца при продаже
  - Публикация событий TRADE_CREATED
  
- ✅ **Валидация (Validations API)**
  - Экспертная оценка подлинности
  - Оценка состояния
  - Оценка стоимости
  - Публикация событий ASSET_VALIDATED
  
- ✅ **Аналитика (Analytics API)** 🆕
  - **POST /api/analytics/fair-price** - Расчёт справедливой цены с KDE
  - **POST /api/analytics/risk-score** - Оценка риска транзакции
  - Публикация событий PRICE_CALCULATED
  
- ✅ **Событийная архитектура (Events API)** 🆕
  - **GET /api/events** - Просмотр событий системы
  - EventBus для публикации и подписки
  - Типы событий: TRADE_CREATED, ASSET_VALIDATED, PRICE_CALCULATED
  
- ✅ **Dashboard & Monitoring**
  - Статистика платформы
  - Граф связей
  - История активности

#### Core Analytics Service (Python FastAPI) 🆕
- ✅ **Fair Price Calculation**
  - Kernel Density Estimation (KDE) для построения ценовой карты
  - Учёт репутационных метрик участников
  - Корректировка на контекстные события
  - Доверительный интервал (95%)
  
- ✅ **Risk Assessment**
  - Отклонение цены от справедливой
  - Риск ликвидности
  - Риск репутации участников
  - Комбинированная оценка риска

#### Frontend (Responsive Web UI)
- ✅ **Главная страница (Public Gateway)**
  - Выбор роли пользователя
  - Обзор платформы
  - Статистика в реальном времени
  
- ✅ **Панели управления (Dashboards)**
  - Dashboard для Художника
  - Dashboard для Коллекционера
  - Dashboard для Галереи
  - Dashboard для Банка
  - Dashboard для Эксперта
  - Публичный просмотр

#### База данных (Cloudflare D1)
- ✅ Таблицы: nodes, edges, artworks, transactions, validations, activity_log, user_sessions
- ✅ Миграции и seed данных
- ✅ Индексы для оптимизации запросов

## 📊 Архитектура данных

### Таксономия участников (Graph Model)

#### 1. Кластер «Создатели и Владельцы» (Primary Source)
- **Художник**: Узел с атрибутами - стилевой вектор, период, статус (Emerging/Established)
- **Коллекционер** (Private Owner): Владелец активами, риск-профиль, частота транзакций

#### 2. Кластер «Инфраструктурные посредники» (Market Makers)
- **Галерея**: Ключевой аккредитованный узел, специализация, уровень выставочной активности
- **Аукционный дом**: Высокая интенсивность транзакций, объем торгов
- **Арт-дилер/Консультант**: Узел-агент, репутационный индекс

#### 3. Кластер «Финансовые институты» (Capital Holders)
- **Банк** (Private Banking): Валидация сделок, кредитование под арт
- **Страховая компания**: Оценка рисков повреждения/утраты

#### 4. Кластер «Экспертная среда» (Validation Layer)
- **Эксперт/Аттестованный оценщик**: Цифровая подпись в паспорте
- **Реставратор/Лаборатория**: Индекс подтверждения подлинности

### Backend-логика (Graph Operations)

Связи через типы рёбер (отношений):
- Художник → [создал] → Произведение
- Галерея → [экспонировала] → Произведение
- Коллекционер → [владеет] → Произведение
- Эксперт → [подтвердил] → Паспорт актива
- Банк → [кредитовал под] → Произведение

### Зачем это нужно для системы

- **Проверка «репутационной цепочки»**: Система понижает вес актива если эксперт с низким рейтингом подтверждает произведение
- **Обнаружение связей**: Автоматическое предложение банку сегмента активов как «проверенный»
- **Борьба с аномалиями**: Выявление транзакционных следов через подставную галерею

## 🌐 URLs и доступ

### Sandbox Environment
- **Главная**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai
- **API Base**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/api
- **Dashboard Artist**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/dashboard/artist
- **Dashboard Collector**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/dashboard/collector
- **Dashboard Gallery**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/dashboard/gallery
- **Dashboard Bank**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/dashboard/bank
- **Dashboard Expert**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/dashboard/expert
- **Public View**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/dashboard/public

### API Endpoints

#### Nodes
- `GET /api/nodes` - Получить все узлы (опционально: `?type=artist`)
- `GET /api/nodes/:id` - Получить узел по ID
- `POST /api/nodes` - Создать новый узел

#### Edges
- `GET /api/edges` - Получить все связи (опционально: `?node_id=xxx`)
- `POST /api/edges` - Создать связь

#### Artworks
- `GET /api/artworks` - Получить все произведения (опционально: `?artist_id=xxx` или `?owner_id=xxx`)
- `GET /api/artworks/:id` - Получить произведение по ID
- `POST /api/artworks` - Создать произведение

#### Transactions
- `GET /api/transactions` - Получить транзакции (опционально: `?node_id=xxx` или `?artwork_id=xxx`)
- `POST /api/transactions` - Создать транзакцию
- `PATCH /api/transactions/:id/status` - Обновить статус транзакции

#### Validations
- `GET /api/validations` - Получить валидации (опционально: `?artwork_id=xxx` или `?expert_id=xxx`)
- `POST /api/validations` - Создать валидацию

#### Analytics (Core Analytics Service) 🆕
- `POST /api/analytics/fair-price` - Расчёт справедливой цены актива
- `POST /api/analytics/risk-score` - Оценка риска транзакции

#### Events (Event Bus) 🆕
- `GET /api/events` - Получить события (опционально: `?limit=50&type=TRADE_CREATED`)

#### Dashboard & Analytics
- `GET /api/dashboard/stats` - Статистика платформы
- `GET /api/dashboard/graph` - Данные графа
- `GET /api/nodes/:id/activity` - История активности узла

## 🛠️ Технический стек

### Backend (3-слойная архитектура)
- **Маршрутизатор**: Hono (v4.12.7) - Lightweight web framework
- **Analytics Service**: Python FastAPI (v0.115.0) + NumPy + Pandas + SciPy + scikit-learn
- **Database**: Cloudflare D1 (SQLite) - Serverless SQL database с графовой моделью
- **Event Bus**: Упрощённый EventBus (в разработке: Kafka/RabbitMQ для продакшена)

### Frontend
- **Framework**: Vanilla JavaScript + TailwindCSS
- **Визуализация**: Chart.js (дашборды)
- **Иконки**: FontAwesome

### Infrastructure
- **Runtime**: Cloudflare Workers / Node.js (локальная разработка)
- **Build**: Vite (v6.3.5)
- **Process Manager**: PM2 (для запуска двух сервисов одновременно)
- **Deployment**: Cloudflare Pages (продакшен), Sandbox (разработка)

## 📦 Структура проекта

```
webapp/
├── src/
│   ├── index.tsx           # Main Hono application (API + Frontend)
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   └── lib/
│       ├── db.ts           # Database helper functions
│       └── events.ts       # Event-Driven Architecture (EventBus)
├── analytics_service/      # 🆕 Python FastAPI Analytics Service
│   ├── main.py             # FastAPI app with KDE pricing algorithms
│   ├── requirements.txt    # Python dependencies
│   └── venv/               # Python virtual environment
├── migrations/
│   └── 0001_initial_schema.sql  # Database schema
├── seed.sql                # Test data
├── public/                 # Static assets
├── ecosystem.config.cjs    # PM2 configuration (Hono + FastAPI)
├── wrangler.jsonc          # Cloudflare configuration
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

## 🚀 Локальная разработка

### Установка и запуск

```bash
# Клонировать репозиторий
cd /home/user/webapp

# Установить зависимости (уже установлены)
npm install

# Применить миграции БД
npm run db:migrate:local

# Сбросить БД и добавить тестовые данные
npm run db:reset

# Собрать проект
npm run build

# Запустить в режиме разработки с PM2
pm2 start ecosystem.config.cjs

# Проверить статус
pm2 list

# Посмотреть логи
pm2 logs art-bank --nostream
```

### Доступные скрипты

- `npm run dev` - Vite dev server
- `npm run dev:sandbox` - Wrangler dev server с D1
- `npm run build` - Собрать проект
- `npm run db:migrate:local` - Применить миграции локально
- `npm run db:seed` - Добавить тестовые данные
- `npm run db:reset` - Сбросить БД и пересоздать
- `npm run clean-port` - Очистить порт 3000

## 📈 Текущие данные

### Узлы (Nodes)
- 1 Художник: Иван Шишкин (trust: 0.95)
- 1 Коллекционер: Михаил Петров (trust: 0.85)
- 1 Галерея: Галерея Третьяковская (trust: 0.95)
- 1 Банк: АртБанк Private (trust: 0.92)
- 1 Эксперт: Профессор Антонов (trust: 0.96)

### Произведения (Artworks)
- 1 произведение: "Утро в сосновом лесу" (FPC: 15,000,000 ₽)

### Связи (Edges)
- 1 связь: Банк финансировал Коллекционера

## 🎨 Интерфейсы по ролям

### 1. Художник (Artist Dashboard)
- Создание произведений
- Цифровая подпись работ
- Просмотр провенанса своих работ
- История выставок

### 2. Коллекционер (Collector Dashboard)
- Управление коллекцией
- Покупка произведений
- История транзакций
- Оценка портфеля

### 3. Галерея (Gallery Dashboard)
- Организация экспозиций
- Продажи произведений
- Связи с художниками
- Статистика продаж

### 4. Банк (Bank Dashboard)
- Заявки на кредитование под арт
- Валидация сделок через граф
- Портфель залогов
- Риск-анализ

### 5. Эксперт (Expert Dashboard)
- Запросы на экспертизу
- Выдача сертификатов
- Индекс точности оценок
- Репутационный рейтинг

### 6. Публичный просмотр (Public View)
- Граф рынка
- Статистика платформы
- Ценовые коридоры (FPC)
- Топ художников и галерей

## 🔮 Будущие улучшения

### Ближайшие задачи
- [ ] Добавить визуализацию графа (D3.js или Cytoscape.js)
- [ ] Реализовать алгоритм расчета репутации (PageRank-подобный)
- [ ] Добавить ML-модель для детекции аномалий
- [ ] Реализовать систему аутентификации
- [ ] Добавить upload изображений произведений (R2 storage)

### Долгосрочные цели
- [ ] Интеграция с блокчейном для NFT
- [ ] Мобильное приложение
- [ ] Интеграция с внешними арт-базами
- [ ] Продвинутая аналитика и ML-рекомендации
- [ ] Multi-tenant архитектура

## 📝 Как использовать

1. **Откройте главную страницу**: https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai
2. **Выберите роль**: Нажмите на одну из карточек ролей
3. **Изучите интерфейс**: Каждая роль имеет свой специализированный dashboard
4. **Тестируйте API**: Используйте curl или Postman для работы с API endpoints

### Пример: Создание нового художника

```bash
curl -X POST https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": "artist",
    "name": "Василий Кандинский",
    "jurisdiction": "RU",
    "metadata": {
      "style": "Абстракционизм",
      "period": "XX век",
      "status": "Established"
    }
  }'
```

### Пример: Получение статистики

```bash
curl https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/api/dashboard/stats
```

### Пример: Расчёт справедливой цены (Analytics Service) 🆕

```bash
curl -X POST https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/api/analytics/fair-price \
  -H "Content-Type: application/json" \
  -d '{
    "asset_id": "artwork-1",
    "current_price": 15000000,
    "historical_prices": [
      {"asset_id": "similar-1", "price": 10000000, "sale_date": "2024-01-15", "similarity_score": 0.9},
      {"asset_id": "similar-2", "price": 13000000, "sale_date": "2024-02-20", "similarity_score": 0.85}
    ],
    "trust_metrics": [
      {"node_id": "artist-1", "node_type": "artist", "trust_level": 0.95, "weight": 0.5},
      {"node_id": "expert-1", "node_type": "expert", "trust_level": 0.96, "weight": 0.5}
    ],
    "context_events": [
      {"event_type": "exhibition", "impact_score": 0.15, "timestamp": "2024-06-01"}
    ]
  }'

# Ответ:
# {
#   "asset_id": "artwork-1",
#   "fair_value": 12406712.21,
#   "confidence_interval": [6262602.10, 18772517.02],
#   "risk_score": 0.17,
#   "reasoning": {
#     "base_fair_value": 11371871.87,
#     "trust_adjustment": 1.091,
#     "context_adjustment": 1.017,
#     "data_points": 2,
#     "avg_similarity": 0.875,
#     "price_dispersion": 0.13,
#     "trust_level": 0.955
#   }
# }
```

### Пример: Просмотр событий системы 🆕

```bash
curl https://3000-ir9tb52hhw0a86hr4kq8c-5c13a017.sandbox.novita.ai/api/events?limit=10

# События: TRADE_CREATED, ASSET_VALIDATED, PRICE_CALCULATED
```

## 🤝 Контрибьюция

Проект находится в активной разработке. Приветствуются:
- Идеи по улучшению графовой модели
- Предложения по UI/UX
- Реализация новых фич
- Оптимизация производительности

## 📄 Лицензия

MIT License

## 👥 Автор

Создано на основе исследования "Пачоли Консалтинг" для построения математической модели арт-рынка.

---

**Статус проекта**: 🟢 Активная разработка  
**Версия**: 1.0.0  
**Последнее обновление**: 2026-03-10
