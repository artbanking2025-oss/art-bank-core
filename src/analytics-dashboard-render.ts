// Minimalist Analytics Dashboard renderer (due to file size constraints)

export function renderAnalyticsDashboard(): string {
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Панель аналитики - Art Bank</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
</head>
<body class="bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 min-h-screen">
    <header class="bg-white shadow-md border-b-4 border-purple-500">
        <div class="container mx-auto px-6 py-4 flex justify-between items-center">
            <div class="flex items-center space-x-4">
                <i class="fas fa-chart-line text-purple-600 text-3xl"></i>
                <div>
                    <h1 class="text-2xl font-bold text-gray-800">Панель аналитики Art Bank</h1>
                    <p class="text-sm text-gray-600">Единый коридор платформы</p>
                </div>
            </div>
            <div class="flex gap-2">
                <div class="relative">
                    <button id="exportBtn" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                        <i class="fas fa-download mr-2"></i>Export
                    </button>
                    <div id="exportMenu" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-10">
                        <a href="/api/export/nodes?format=json" class="block px-4 py-2 hover:bg-gray-100 rounded-t-lg">
                            <i class="fas fa-file-code mr-2 text-blue-600"></i>Nodes (JSON)
                        </a>
                        <a href="/api/export/nodes?format=csv" class="block px-4 py-2 hover:bg-gray-100">
                            <i class="fas fa-file-csv mr-2 text-green-600"></i>Nodes (CSV)
                        </a>
                        <a href="/api/export/artworks?format=json" class="block px-4 py-2 hover:bg-gray-100">
                            <i class="fas fa-file-code mr-2 text-blue-600"></i>Artworks (JSON)
                        </a>
                        <a href="/api/export/artworks?format=csv" class="block px-4 py-2 hover:bg-gray-100">
                            <i class="fas fa-file-csv mr-2 text-green-600"></i>Artworks (CSV)
                        </a>
                        <a href="/api/export/transactions?format=json" class="block px-4 py-2 hover:bg-gray-100">
                            <i class="fas fa-file-code mr-2 text-blue-600"></i>Transactions (JSON)
                        </a>
                        <a href="/api/export/transactions?format=csv" class="block px-4 py-2 hover:bg-gray-100">
                            <i class="fas fa-file-csv mr-2 text-green-600"></i>Transactions (CSV)
                        </a>
                        <a href="/api/export/validations?format=json" class="block px-4 py-2 hover:bg-gray-100">
                            <i class="fas fa-file-code mr-2 text-blue-600"></i>Validations (JSON)
                        </a>
                        <a href="/api/export/validations?format=csv" class="block px-4 py-2 hover:bg-gray-100 rounded-b-lg">
                            <i class="fas fa-file-csv mr-2 text-green-600"></i>Validations (CSV)
                        </a>
                    </div>
                </div>
                <a href="/" class="px-4 py-2 bg-purple-600 text-white rounded-lg">
                    <i class="fas fa-home mr-2"></i>Главная
                </a>
            </div>
        </div>
    </header>

    <div class="container mx-auto px-6 py-8">
        <div class="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 class="text-xl font-bold mb-4">Выбор произведения</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select id="artworkSelect" class="px-4 py-2 border rounded-lg">
                    <option value="">Выберите...</option>
                </select>
                <input type="number" id="periodInput" value="6" min="1" max="60" class="px-4 py-2 border rounded-lg">
                <button id="analyzeBtn" class="px-6 py-2 bg-purple-600 text-white rounded-lg">
                    <i class="fas fa-chart-bar mr-2"></i>Анализировать
                </button>
            </div>
        </div>

        <div id="resultsSection" class="hidden">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6">
                    <p class="text-sm mb-1">Текущая цена</p>
                    <p class="text-3xl font-bold" id="currentPrice">—</p>
                </div>
                <div class="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6">
                    <p class="text-sm mb-1">Медиана галерей</p>
                    <p class="text-3xl font-bold" id="galleryMedian">—</p>
                </div>
                <div class="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6">
                    <p class="text-sm mb-1">Медиана сделок</p>
                    <p class="text-3xl font-bold" id="salesMedian">—</p>
                </div>
                <div class="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6">
                    <p class="text-sm mb-1">Spread</p>
                    <p class="text-3xl font-bold" id="spreadValue">—</p>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-6 mb-6">
                <h2 class="text-xl font-bold mb-4">Коридор цены</h2>
                <canvas id="corridorChart" height="80"></canvas>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-6">
                <h2 class="text-xl font-bold mb-4">Рыночные факторы</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="border rounded-lg p-4">
                        <h3 class="font-semibold mb-2">F1: Институциональная подпорка</h3>
                        <div class="text-2xl font-bold" id="f1Weight">—</div>
                        <p class="text-sm mt-2" id="f1Interpretation">—</p>
                    </div>
                    <div class="border rounded-lg p-4">
                        <h3 class="font-semibold mb-2">F2: Рыночный ажиотаж</h3>
                        <div class="text-2xl font-bold" id="f2Weight">—</div>
                        <p class="text-sm mt-2" id="f2Interpretation">—</p>
                    </div>
                    <div class="border rounded-lg p-4">
                        <h3 class="font-semibold mb-2">F3: Ликвидность</h3>
                        <div class="text-2xl font-bold" id="f3Weight">—</div>
                        <p class="text-sm mt-2" id="f3Interpretation">—</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let corridorChart = null;

        async function loadArtworks() {
            try {
                const response = await axios.get('/api/artworks');
                const select = document.getElementById('artworkSelect');
                response.data.artworks.forEach(a => {
                    const option = document.createElement('option');
                    option.value = a.id;
                    option.textContent = a.title;
                    select.appendChild(option);
                });
            } catch (error) {
                console.error('Error:', error);
            }
        }

        document.getElementById('analyzeBtn').addEventListener('click', async () => {
            const artworkId = document.getElementById('artworkSelect').value;
            const period = document.getElementById('periodInput').value;

            if (!artworkId) {
                alert('Выберите произведение');
                return;
            }

            try {
                const [corridorResp, factorsResp] = await Promise.all([
                    axios.post('/api/analytics-extended/price-corridor', {
                        artwork_id: artworkId,
                        period_months: parseInt(period)
                    }),
                    axios.post('/api/analytics-extended/market-factors', {
                        artwork_id: artworkId
                    })
                ]);

                displayResults(corridorResp.data, factorsResp.data);
            } catch (error) {
                console.error('Error:', error);
                alert('Ошибка анализа');
            }
        });

        function displayResults(corridorData, factorsData) {
            document.getElementById('resultsSection').classList.remove('hidden');

            document.getElementById('currentPrice').textContent = formatPrice(corridorData.current_price);
            document.getElementById('galleryMedian').textContent = formatPrice(corridorData.corridor.gallery_median);
            document.getElementById('salesMedian').textContent = formatPrice(corridorData.corridor.sales_median);
            document.getElementById('spreadValue').textContent = corridorData.liquidity.spread_percentage + '%';

            updateChart(corridorData);

            const { f1_institutional_support: f1, f2_market_hype: f2, f3_liquidity: f3 } = factorsData.factors;
            document.getElementById('f1Weight').textContent = f1.weight;
            document.getElementById('f1Interpretation').textContent = f1.interpretation;
            document.getElementById('f2Weight').textContent = f2.weight;
            document.getElementById('f2Interpretation').textContent = f2.interpretation;
            document.getElementById('f3Weight').textContent = f3.weight;
            document.getElementById('f3Interpretation').textContent = f3.interpretation;

            document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        }

        function updateChart(data) {
            const ctx = document.getElementById('corridorChart').getContext('2d');
            if (corridorChart) corridorChart.destroy();

            corridorChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Lower Bound', 'Sales Median', 'Current Price', 'Gallery Median', 'Upper Bound'],
                    datasets: [{
                        label: 'Цена (₽)',
                        data: [
                            data.corridor.lower_bound,
                            data.corridor.sales_median,
                            data.current_price,
                            data.corridor.gallery_median,
                            data.corridor.upper_bound
                        ],
                        backgroundColor: [
                            'rgba(59, 130, 246, 0.7)',
                            'rgba(249, 115, 22, 0.7)',
                            'rgba(139, 92, 246, 0.9)',
                            'rgba(34, 197, 94, 0.7)',
                            'rgba(59, 130, 246, 0.7)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } }
                }
            });
        }

        function formatPrice(price) {
            return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
        }

        // Toggle export menu
        document.getElementById('exportBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = document.getElementById('exportMenu');
            menu.classList.toggle('hidden');
        });

        // Close menu when clicking outside
        document.addEventListener('click', () => {
            document.getElementById('exportMenu').classList.add('hidden');
        });

        loadArtworks();
    </script>
</body>
</html>
  `;
}
