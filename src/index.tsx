import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import type { Env } from './types';
import { ArtBankDB } from './lib/db';
import { 
  globalEventBus, 
  createTradeEvent, 
  createAssetEvent, 
  createPriceCalculationEvent 
} from './lib/events';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for API
app.use('/api/*', cors());

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }));

// ========== API ROUTES ==========

// Nodes API
app.get('/api/nodes', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const type = c.req.query('type');
  
  const nodes = type ? await db.getNodesByType(type) : await db.getAllNodes();
  return c.json({ nodes });
});

app.get('/api/nodes/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const node = await db.getNode(c.req.param('id'));
  
  if (!node) {
    return c.json({ error: 'Node not found' }, 404);
  }
  
  return c.json({ node });
});

app.post('/api/nodes', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const node = await db.createNode(data);
    await db.logActivity(node.id, 'created', { node_type: node.node_type, name: node.name });
    return c.json({ node }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Edges API
app.get('/api/edges', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const nodeId = c.req.query('node_id');
  
  const edges = nodeId ? await db.getEdgesByNode(nodeId) : await db.getAllEdges();
  return c.json({ edges });
});

app.post('/api/edges', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const edge = await db.createEdge(data);
    await db.logActivity(data.from_node_id, 'edge_created', { 
      to: data.to_node_id, 
      type: data.edge_type 
    });
    return c.json({ edge }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Artworks API
app.get('/api/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artistId = c.req.query('artist_id');
  const ownerId = c.req.query('owner_id');
  
  let artworks;
  if (artistId) {
    artworks = await db.getArtworksByArtist(artistId);
  } else if (ownerId) {
    artworks = await db.getArtworksByOwner(ownerId);
  } else {
    artworks = await db.getAllArtworks();
  }
  
  return c.json({ artworks });
});

app.get('/api/artworks/:id', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artwork = await db.getArtwork(c.req.param('id'));
  
  if (!artwork) {
    return c.json({ error: 'Artwork not found' }, 404);
  }
  
  return c.json({ artwork });
});

app.post('/api/artworks', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const artwork = await db.createArtwork(data);
    await db.logActivity(data.artist_node_id, 'artwork_created', { 
      artwork_id: artwork.id, 
      title: artwork.title 
    });
    
    // Create edge: Artist -> Artwork
    await db.createEdge({
      from_node_id: data.artist_node_id,
      to_node_id: artwork.id,
      edge_type: 'created',
      weight: 1.0
    });
    
    return c.json({ artwork }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Transactions API
app.get('/api/transactions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const nodeId = c.req.query('node_id');
  const artworkId = c.req.query('artwork_id');
  
  let transactions;
  if (nodeId) {
    transactions = await db.getTransactionsByNode(nodeId);
  } else if (artworkId) {
    transactions = await db.getTransactionsByArtwork(artworkId);
  } else {
    transactions = await db.getAllTransactions();
  }
  
  return c.json({ transactions });
});

app.post('/api/transactions', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const transaction = await db.createTransaction(data);
    
    // Update artwork owner
    await db.updateArtworkOwner(data.artwork_id, data.to_node_id);
    
    // Log activity
    await db.logActivity(data.from_node_id, 'transaction_created', { 
      transaction_id: transaction.id,
      artwork_id: data.artwork_id,
      price: data.price 
    });
    
    // Publish TRADE_CREATED event
    const tradeEvent = createTradeEvent('TRADE_CREATED', {
      transaction_id: transaction.id,
      artwork_id: data.artwork_id,
      from_node_id: data.from_node_id,
      to_node_id: data.to_node_id,
      price: data.price,
      bank_node_id: data.bank_node_id
    });
    await globalEventBus.publish(tradeEvent);
    
    return c.json({ transaction }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

app.patch('/api/transactions/:id/status', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const { status } = await c.req.json();
  
  try {
    await db.updateTransactionStatus(parseInt(c.req.param('id')), status);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Analytics Integration API
app.post('/api/analytics/fair-price', async (c) => {
  const data = await c.req.json();
  const analyticsUrl = c.env.ANALYTICS_SERVICE_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${analyticsUrl}/analytics/calculate_fair_price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      return c.json({ error: error.detail || 'Analytics service error' }, response.status);
    }
    
    const result = await response.json();
    
    // Publish PRICE_CALCULATED event
    const priceEvent = createPriceCalculationEvent({
      artwork_id: result.asset_id,
      fair_value: result.fair_value,
      risk_score: result.risk_score,
      confidence_interval: result.confidence_interval,
      reasoning: result.reasoning
    });
    await globalEventBus.publish(priceEvent);
    
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: 'Failed to connect to Analytics Service: ' + error.message }, 503);
  }
});

app.post('/api/analytics/risk-score', async (c) => {
  const data = await c.req.json();
  const analyticsUrl = c.env.ANALYTICS_SERVICE_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${analyticsUrl}/analytics/risk_score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      return c.json({ error: error.detail || 'Analytics service error' }, response.status);
    }
    
    const result = await response.json();
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: 'Failed to connect to Analytics Service: ' + error.message }, 503);
  }
});

// Validations API
app.get('/api/validations', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const artworkId = c.req.query('artwork_id');
  const expertId = c.req.query('expert_id');
  
  let validations;
  if (artworkId) {
    validations = await db.getValidationsByArtwork(artworkId);
  } else if (expertId) {
    validations = await db.getValidationsByExpert(expertId);
  } else {
    validations = [];
  }
  
  return c.json({ validations });
});

app.post('/api/validations', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const data = await c.req.json();
  
  try {
    const validation = await db.createValidation(data);
    
    // Create edge: Expert -> Artwork
    await db.createEdge({
      from_node_id: data.expert_node_id,
      to_node_id: data.artwork_id,
      edge_type: 'validated',
      weight: data.confidence_level || 0.8
    });
    
    // Log activity
    await db.logActivity(data.expert_node_id, 'validation_created', { 
      validation_id: validation.id,
      artwork_id: data.artwork_id 
    });
    
    // Publish ASSET_VALIDATED event
    const validationEvent = createAssetEvent('ASSET_VALIDATED', {
      artwork_id: data.artwork_id,
      expert_node_id: data.expert_node_id,
      validation_result: data.result
    });
    await globalEventBus.publish(validationEvent);
    
    return c.json({ validation }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// Events API (для мониторинга событийной архитектуры)
app.get('/api/events', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const type = c.req.query('type');
  
  const events = type 
    ? globalEventBus.getEventsByType(type as any, limit)
    : globalEventBus.getRecentEvents(limit);
  
  return c.json({ events, count: events.length });
});

// Dashboard & Analytics
app.get('/api/dashboard/stats', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const stats = await db.getDashboardStats();
  return c.json({ stats });
});

app.get('/api/dashboard/graph', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const graphData = await db.getGraphData();
  return c.json(graphData);
});

app.get('/api/nodes/:id/activity', async (c) => {
  const db = new ArtBankDB(c.env.DB);
  const limit = parseInt(c.req.query('limit') || '50');
  const activity = await db.getActivityByNode(c.req.param('id'), limit);
  return c.json({ activity });
});

// ========== FRONTEND ROUTES ==========

// Main landing page with role selection
app.get('/', (c) => {
  return c.html(renderLandingPage());
});

// Role-specific dashboards
app.get('/dashboard/:role', (c) => {
  const role = c.req.param('role');
  return c.html(renderDashboard(role));
});

export default app;

// ========== HTML RENDERERS ==========

function renderLandingPage() {
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Art Bank - Графовая платформа для арт-рынка</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 min-h-screen">
    <div class="container mx-auto px-4 py-12">
        <div class="text-center mb-16">
            <h1 class="text-6xl font-bold text-white mb-4">
                <i class="fas fa-project-diagram mr-4"></i>
                Art Bank Core
            </h1>
            <p class="text-2xl text-blue-200">
                Графовая система для арт-рынка с репутационной моделью
            </p>
        </div>

        <div class="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-12">
            <h2 class="text-3xl font-bold text-white mb-6">
                <i class="fas fa-info-circle mr-2"></i>
                О платформе
            </h2>
            <p class="text-lg text-blue-100 mb-4">
                Art Bank Core - это математическая модель арт-рынка, представленная в виде графа. 
                Каждый участник рынка - это узел (Node) с уникальным цифровым паспортом и репутационным весом.
            </p>
            <p class="text-lg text-blue-100">
                Связи между участниками формируют "доверительную сеть", которая автоматически выявляет 
                аномалии и обеспечивает прозрачность транзакций.
            </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <!-- Stats -->
            <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-center" id="stats-loading">
                <div class="text-4xl text-white mb-2">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <div class="text-blue-200">Загрузка статистики...</div>
            </div>
        </div>

        <div class="text-center mb-12">
            <h2 class="text-3xl font-bold text-white mb-8">
                <i class="fas fa-users mr-2"></i>
                Выберите роль для входа
            </h2>
            <p class="text-lg text-blue-200 mb-8">
                Каждая роль имеет свой интерфейс и набор функций
            </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Artist -->
            <a href="/dashboard/artist" class="group bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-palette"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Художник</h3>
                <p class="text-white/80 text-center">
                    Создание работ, цифровая подпись, отслеживание провенанса
                </p>
            </a>

            <!-- Collector -->
            <a href="/dashboard/collector" class="group bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-gem"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Коллекционер</h3>
                <p class="text-white/80 text-center">
                    Управление коллекцией, покупка, история владения
                </p>
            </a>

            <!-- Gallery -->
            <a href="/dashboard/gallery" class="group bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-store"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Галерея</h3>
                <p class="text-white/80 text-center">
                    Экспонирование работ, организация продаж
                </p>
            </a>

            <!-- Bank -->
            <a href="/dashboard/bank" class="group bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-university"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Банк</h3>
                <p class="text-white/80 text-center">
                    Кредитование под арт, валидация сделок
                </p>
            </a>

            <!-- Expert -->
            <a href="/dashboard/expert" class="group bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-certificate"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Эксперт</h3>
                <p class="text-white/80 text-center">
                    Оценка подлинности, экспертиза, сертификация
                </p>
            </a>

            <!-- Public View -->
            <a href="/dashboard/public" class="group bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl p-8 hover:scale-105 transition-transform cursor-pointer">
                <div class="text-6xl text-white mb-4 text-center">
                    <i class="fas fa-chart-network"></i>
                </div>
                <h3 class="text-2xl font-bold text-white mb-2 text-center">Публичный просмотр</h3>
                <p class="text-white/80 text-center">
                    Граф связей, статистика рынка, аналитика
                </p>
            </a>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script>
        // Load stats
        axios.get('/api/dashboard/stats')
            .then(response => {
                const stats = response.data.stats;
                document.getElementById('stats-loading').outerHTML = \`
                    <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                        <div class="text-4xl font-bold text-white mb-2">\${stats.total_nodes}</div>
                        <div class="text-blue-200">Участников</div>
                    </div>
                    <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                        <div class="text-4xl font-bold text-white mb-2">\${stats.total_artworks}</div>
                        <div class="text-blue-200">Произведений</div>
                    </div>
                    <div class="bg-white/10 backdrop-blur-lg rounded-xl p-6">
                        <div class="text-4xl font-bold text-white mb-2">\${stats.total_transactions}</div>
                        <div class="text-blue-200">Транзакций</div>
                    </div>
                \`;
            })
            .catch(error => {
                console.error('Error loading stats:', error);
            });
    </script>
</body>
</html>
  `;
}

function renderDashboard(role: string) {
  const roleConfig: Record<string, any> = {
    artist: {
      title: 'Панель художника',
      icon: 'fa-palette',
      color: 'from-pink-500 to-purple-600',
      features: ['Создать произведение', 'Мои работы', 'История провенанса', 'Цифровая подпись']
    },
    collector: {
      title: 'Панель коллекционера',
      icon: 'fa-gem',
      color: 'from-blue-500 to-cyan-600',
      features: ['Моя коллекция', 'Купить работу', 'История транзакций', 'Оценка портфеля']
    },
    gallery: {
      title: 'Панель галереи',
      icon: 'fa-store',
      color: 'from-amber-500 to-orange-600',
      features: ['Экспозиции', 'Продажи', 'Связи с художниками', 'Статистика']
    },
    bank: {
      title: 'Панель банка',
      icon: 'fa-university',
      color: 'from-green-500 to-emerald-600',
      features: ['Заявки на кредит', 'Валидация сделок', 'Портфель залогов', 'Риск-анализ']
    },
    expert: {
      title: 'Панель эксперта',
      icon: 'fa-certificate',
      color: 'from-indigo-500 to-purple-600',
      features: ['Запросы на экспертизу', 'Выданные сертификаты', 'Индекс точности', 'Репутация']
    },
    public: {
      title: 'Публичный просмотр',
      icon: 'fa-chart-network',
      color: 'from-gray-600 to-gray-800',
      features: ['Граф рынка', 'Статистика', 'Ценовые коридоры', 'Топ художников']
    }
  };

  const config = roleConfig[role] || roleConfig['public'];

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.title} - Art Bank</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100">
    <!-- Header -->
    <div class="bg-gradient-to-r ${config.color} text-white p-6 shadow-lg">
        <div class="container mx-auto flex justify-between items-center">
            <div>
                <h1 class="text-3xl font-bold">
                    <i class="fas ${config.icon} mr-2"></i>
                    ${config.title}
                </h1>
            </div>
            <div>
                <a href="/" class="bg-white/20 hover:bg-white/30 px-6 py-2 rounded-lg transition">
                    <i class="fas fa-home mr-2"></i>
                    На главную
                </a>
            </div>
        </div>
    </div>

    <!-- Dashboard Content -->
    <div class="container mx-auto px-4 py-8">
        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8" id="stats-container">
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Всего узлов</p>
                        <p class="text-2xl font-bold" id="stat-nodes">-</p>
                    </div>
                    <i class="fas fa-circle-nodes text-4xl text-blue-500"></i>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Произведений</p>
                        <p class="text-2xl font-bold" id="stat-artworks">-</p>
                    </div>
                    <i class="fas fa-image text-4xl text-purple-500"></i>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Транзакций</p>
                        <p class="text-2xl font-bold" id="stat-transactions">-</p>
                    </div>
                    <i class="fas fa-exchange-alt text-4xl text-green-500"></i>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-gray-500 text-sm">Ср. репутация</p>
                        <p class="text-2xl font-bold" id="stat-trust">-</p>
                    </div>
                    <i class="fas fa-star text-4xl text-yellow-500"></i>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <!-- Features -->
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-tasks mr-2"></i>
                    Доступные функции
                </h2>
                <div class="space-y-3">
                    ${config.features.map((f: string) => `
                        <div class="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition">
                            <i class="fas fa-chevron-right mr-3 text-gray-400"></i>
                            <span class="font-medium">${f}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Graph Preview -->
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-project-diagram mr-2"></i>
                    Граф связей
                </h2>
                <div class="bg-gray-50 rounded-lg h-64 flex items-center justify-center">
                    <canvas id="graphChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Data Tables -->
        <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-xl font-bold mb-4">
                <i class="fas fa-table mr-2"></i>
                Недавняя активность
            </h2>
            <div id="data-container" class="overflow-x-auto">
                <p class="text-gray-500">Загрузка данных...</p>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script>
        const role = '${role}';
        
        // Load stats
        axios.get('/api/dashboard/stats')
            .then(response => {
                const stats = response.data.stats;
                document.getElementById('stat-nodes').textContent = stats.total_nodes;
                document.getElementById('stat-artworks').textContent = stats.total_artworks;
                document.getElementById('stat-transactions').textContent = stats.total_transactions;
                document.getElementById('stat-trust').textContent = stats.avg_trust_level.toFixed(2);
            });

        // Load role-specific data
        if (role === 'artist') {
            loadArtists();
        } else if (role === 'collector') {
            loadCollectors();
        } else if (role === 'gallery') {
            loadGalleries();
        } else if (role === 'bank') {
            loadBanks();
        } else if (role === 'expert') {
            loadExperts();
        } else if (role === 'public') {
            loadPublicData();
        }

        function loadArtists() {
            axios.get('/api/nodes?type=artist')
                .then(response => {
                    const artists = response.data.nodes;
                    displayTable(artists, ['Имя', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadCollectors() {
            axios.get('/api/nodes?type=collector')
                .then(response => {
                    const collectors = response.data.nodes;
                    displayTable(collectors, ['Имя', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadGalleries() {
            axios.get('/api/nodes?type=gallery')
                .then(response => {
                    const galleries = response.data.nodes;
                    displayTable(galleries, ['Название', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadBanks() {
            axios.get('/api/nodes?type=bank')
                .then(response => {
                    const banks = response.data.nodes;
                    displayTable(banks, ['Название', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadExperts() {
            axios.get('/api/nodes?type=expert')
                .then(response => {
                    const experts = response.data.nodes;
                    displayTable(experts, ['Имя', 'Репутация', 'Юрисдикция', 'Статус']);
                });
        }

        function loadPublicData() {
            axios.get('/api/artworks')
                .then(response => {
                    const artworks = response.data.artworks;
                    displayArtworksTable(artworks);
                });
        }

        function displayTable(data, headers) {
            const html = \`
                <table class="min-w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            \${headers.map(h => \`<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">\${h}</th>\`).join('')}
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        \${data.map(item => {
                            const metadata = JSON.parse(item.metadata || '{}');
                            return \`
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap font-medium">\${item.name}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                            \${item.trust_level.toFixed(2)}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${item.jurisdiction || '-'}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full \${
                                            item.status === 'verified' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }">
                                            \${item.status}
                                        </span>
                                    </td>
                                </tr>
                            \`;
                        }).join('')}
                    </tbody>
                </table>
            \`;
            document.getElementById('data-container').innerHTML = html;
        }

        function displayArtworksTable(artworks) {
            const html = \`
                <table class="min-w-full">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Художник</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Год</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Стиль</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FPC</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        \${artworks.map(artwork => \`
                            <tr class="hover:bg-gray-50">
                                <td class="px-6 py-4 whitespace-nowrap font-medium">\${artwork.title}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${artwork.artist_node_id.substring(0, 20)}...</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${artwork.created_year || '-'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${artwork.style || '-'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                                    \${artwork.current_fpc ? artwork.current_fpc.toLocaleString('ru-RU') + ' ₽' : '-'}
                                </td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
            document.getElementById('data-container').innerHTML = html;
        }
    </script>
</body>
</html>
  `;
}
