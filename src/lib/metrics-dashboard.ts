/**
 * Performance Metrics Dashboard
 * 
 * Real-time performance monitoring dashboard with charts
 * Shows:
 * - Response time trends
 * - Request rate
 * - Error rates
 * - Database performance
 * - Cache hit rates
 * 
 * Updates every 5 seconds
 */

export function renderMetricsDashboard(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Metrics - Art Bank</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <style>
        .chart-container {
            position: relative;
            height: 300px;
            margin-bottom: 2rem;
        }
        
        .metric-card {
            transition: all 0.3s ease;
        }
        
        .metric-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }
        
        .loading {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
        }
    </style>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen">
        <!-- Header -->
        <header class="bg-white shadow-sm border-b border-gray-200">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <a href="/admin" class="text-gray-600 hover:text-gray-900">
                            <i class="fas fa-arrow-left"></i>
                        </a>
                        <h1 class="text-2xl font-bold text-gray-900">
                            <i class="fas fa-chart-line mr-2"></i>
                            Performance Metrics
                        </h1>
                    </div>
                    <div class="flex items-center space-x-4">
                        <div class="text-sm text-gray-500">
                            Last updated: <span id="lastUpdate" class="font-medium">-</span>
                        </div>
                        <button onclick="refreshMetrics()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            <i class="fas fa-sync-alt mr-2"></i>Refresh
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            
            <!-- Summary Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <!-- Total Requests -->
                <div class="metric-card bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">Total Requests</p>
                            <p id="totalRequests" class="text-3xl font-bold text-gray-900 loading">-</p>
                        </div>
                        <div class="bg-blue-100 rounded-full p-3">
                            <i class="fas fa-exchange-alt text-blue-600 text-xl"></i>
                        </div>
                    </div>
                </div>

                <!-- Avg Response Time -->
                <div class="metric-card bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">Avg Response Time</p>
                            <p id="avgResponseTime" class="text-3xl font-bold text-gray-900 loading">-</p>
                        </div>
                        <div class="bg-green-100 rounded-full p-3">
                            <i class="fas fa-tachometer-alt text-green-600 text-xl"></i>
                        </div>
                    </div>
                </div>

                <!-- Error Rate -->
                <div class="metric-card bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">Error Rate</p>
                            <p id="errorRate" class="text-3xl font-bold text-gray-900 loading">-</p>
                        </div>
                        <div class="bg-red-100 rounded-full p-3">
                            <i class="fas fa-exclamation-triangle text-red-600 text-xl"></i>
                        </div>
                    </div>
                </div>

                <!-- Cache Hit Rate -->
                <div class="metric-card bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm text-gray-600">Cache Hit Rate</p>
                            <p id="cacheHitRate" class="text-3xl font-bold text-gray-900 loading">-</p>
                        </div>
                        <div class="bg-purple-100 rounded-full p-3">
                            <i class="fas fa-database text-purple-600 text-xl"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts Row 1 -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <!-- Response Time Chart -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-clock mr-2"></i>
                        Response Time (Last Hour)
                    </h3>
                    <div class="chart-container">
                        <canvas id="responseTimeChart"></canvas>
                    </div>
                </div>

                <!-- Request Rate Chart -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-chart-bar mr-2"></i>
                        Request Rate (Last Hour)
                    </h3>
                    <div class="chart-container">
                        <canvas id="requestRateChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Charts Row 2 -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <!-- Status Code Distribution -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-pie-chart mr-2"></i>
                        Response Status Distribution
                    </h3>
                    <div class="chart-container">
                        <canvas id="statusChart"></canvas>
                    </div>
                </div>

                <!-- Method Distribution -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-list mr-2"></i>
                        HTTP Method Distribution
                    </h3>
                    <div class="chart-container">
                        <canvas id="methodChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Performance Stats Table -->
            <div class="bg-white rounded-lg shadow p-6 mb-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">
                    <i class="fas fa-table mr-2"></i>
                    Response Time Percentiles
                </h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P50</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P95</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P99</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200" id="percentilesTable">
                            <tr>
                                <td colspan="7" class="px-6 py-4 text-center text-gray-500 loading">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Top Endpoints -->
            <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">
                    <i class="fas fa-fire mr-2"></i>
                    Top Endpoints by Request Count
                </h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endpoint</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requests</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">% of Total</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200" id="endpointsTable">
                            <tr>
                                <td colspan="3" class="px-6 py-4 text-center text-gray-500 loading">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </main>
    </div>

    <script>
        let charts = {};
        
        // Initialize charts
        function initCharts() {
            // Response Time Chart
            const responseTimeCtx = document.getElementById('responseTimeChart').getContext('2d');
            charts.responseTime = new Chart(responseTimeCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Response Time (ms)',
                        data: [],
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Milliseconds'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Time'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });

            // Request Rate Chart
            const requestRateCtx = document.getElementById('requestRateChart').getContext('2d');
            charts.requestRate = new Chart(requestRateCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Requests per Minute',
                        data: [],
                        backgroundColor: 'rgba(16, 185, 129, 0.5)',
                        borderColor: 'rgb(16, 185, 129)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Requests'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });

            // Status Code Chart
            const statusCtx = document.getElementById('statusChart').getContext('2d');
            charts.status = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            'rgba(34, 197, 94, 0.8)',   // 2xx - Green
                            'rgba(59, 130, 246, 0.8)',  // 3xx - Blue
                            'rgba(251, 146, 60, 0.8)',  // 4xx - Orange
                            'rgba(239, 68, 68, 0.8)'    // 5xx - Red
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });

            // Method Chart
            const methodCtx = document.getElementById('methodChart').getContext('2d');
            charts.method = new Chart(methodCtx, {
                type: 'pie',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            'rgba(59, 130, 246, 0.8)',
                            'rgba(16, 185, 129, 0.8)',
                            'rgba(251, 146, 60, 0.8)',
                            'rgba(168, 85, 247, 0.8)',
                            'rgba(236, 72, 153, 0.8)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }

        // Load metrics data
        async function loadMetrics() {
            try {
                const token = localStorage.getItem('access_token');
                const headers = token ? { 'Authorization': \`Bearer \${token}\` } : {};
                
                // Get system metrics
                const { data: systemMetrics } = await axios.get('/api/metrics/system', { headers });
                
                // Update summary cards
                document.getElementById('totalRequests').textContent = systemMetrics.requests.total.toLocaleString();
                document.getElementById('avgResponseTime').textContent = Math.round(systemMetrics.performance.responseTime.avg) + ' ms';
                document.getElementById('errorRate').textContent = systemMetrics.errors.rate.toFixed(2) + '%';
                document.getElementById('cacheHitRate').textContent = systemMetrics.cache.hitRate.toFixed(1) + '%';
                
                // Get time series for response time
                const { data: responseTimeSeries } = await axios.get('/api/metrics/timeseries/response_time', { headers });
                updateResponseTimeChart(responseTimeSeries.data);
                
                // Update status code chart
                updateStatusChart(systemMetrics.requests.byStatus);
                
                // Update method chart
                updateMethodChart(systemMetrics.requests.byMethod);
                
                // Update percentiles table
                updatePercentilesTable(systemMetrics.performance.responseTime, systemMetrics.performance.dbQueryTime);
                
                // Update endpoints table
                updateEndpointsTable(systemMetrics.requests.byEndpoint, systemMetrics.requests.total);
                
                // Update last update time
                document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                
            } catch (error) {
                console.error('Failed to load metrics:', error);
            }
        }

        function updateResponseTimeChart(data) {
            const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
            const values = data.map(d => d.value);
            
            charts.responseTime.data.labels = labels;
            charts.responseTime.data.datasets[0].data = values;
            charts.responseTime.update();
            
            // Also update request rate (count of requests per interval)
            const counts = new Array(data.length).fill(1);
            charts.requestRate.data.labels = labels;
            charts.requestRate.data.datasets[0].data = counts;
            charts.requestRate.update();
        }

        function updateStatusChart(byStatus) {
            const labels = Object.keys(byStatus).map(code => \`\${code} - \${getStatusText(code)}\`);
            const values = Object.values(byStatus);
            
            charts.status.data.labels = labels;
            charts.status.data.datasets[0].data = values;
            charts.status.update();
        }

        function updateMethodChart(byMethod) {
            const labels = Object.keys(byMethod);
            const values = Object.values(byMethod);
            
            charts.method.data.labels = labels;
            charts.method.data.datasets[0].data = values;
            charts.method.update();
        }

        function updatePercentilesTable(responseTime, dbQueryTime) {
            const html = \`
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Response Time</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(responseTime.min)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(responseTime.avg)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(responseTime.p50)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(responseTime.p95)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(responseTime.p99)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(responseTime.max)} ms</td>
                </tr>
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">DB Query Time</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(dbQueryTime.min)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(dbQueryTime.avg)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(dbQueryTime.p50)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(dbQueryTime.p95)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(dbQueryTime.p99)} ms</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${Math.round(dbQueryTime.max)} ms</td>
                </tr>
            \`;
            document.getElementById('percentilesTable').innerHTML = html;
        }

        function updateEndpointsTable(byEndpoint, total) {
            const sorted = Object.entries(byEndpoint)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            
            const html = sorted.map(([endpoint, count]) => {
                const percentage = ((count / total) * 100).toFixed(2);
                return \`
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">\${endpoint}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${count.toLocaleString()}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\${percentage}%</td>
                    </tr>
                \`;
            }).join('');
            
            document.getElementById('endpointsTable').innerHTML = html || '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500">No data available</td></tr>';
        }

        function getStatusText(code) {
            const statusTexts = {
                200: 'OK',
                201: 'Created',
                204: 'No Content',
                301: 'Moved Permanently',
                302: 'Found',
                304: 'Not Modified',
                400: 'Bad Request',
                401: 'Unauthorized',
                403: 'Forbidden',
                404: 'Not Found',
                500: 'Internal Server Error',
                502: 'Bad Gateway',
                503: 'Service Unavailable'
            };
            return statusTexts[code] || 'Unknown';
        }

        function refreshMetrics() {
            loadMetrics();
        }

        // Initialize on page load
        window.addEventListener('DOMContentLoaded', () => {
            initCharts();
            loadMetrics();
            
            // Auto-refresh every 5 seconds
            setInterval(loadMetrics, 5000);
        });
    </script>
</body>
</html>
  `;
}
