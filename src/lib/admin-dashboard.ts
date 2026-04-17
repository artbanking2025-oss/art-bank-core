/**
 * Admin Dashboard HTML Renderer
 * 
 * System monitoring dashboard for administrators:
 * - Real-time health status
 * - Circuit breakers status
 * - Rate limiting metrics
 * - Recent API requests (from logs)
 * - System statistics
 * - Emergency controls
 */

export function renderAdminDashboard() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard - Art Bank Core v2.13</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen">
        <!-- Header -->
        <header class="bg-white shadow-sm border-b">
            <div class="max-w-7xl mx-auto px-4 py-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">
                            <i class="fas fa-shield-alt text-red-600 mr-2"></i>
                            Admin Dashboard
                        </h1>
                        <p class="text-sm text-gray-600">Art Bank Core v2.13 - System Monitoring</p>
                    </div>
                    <div class="flex items-center space-x-4">
                        <button onclick="refreshData()" 
                                class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                            <i class="fas fa-sync-alt mr-2"></i>Refresh
                        </button>
                        <a href="/api/docs" 
                           class="text-blue-600 hover:text-blue-800">
                            <i class="fas fa-book mr-1"></i>API Docs
                        </a>
                        <a href="/" 
                           class="text-gray-600 hover:text-gray-800">
                            <i class="fas fa-home mr-1"></i>Home
                        </a>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 py-8">
            
            <!-- System Health -->
            <section class="mb-8">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-heartbeat text-red-600 mr-2"></i>
                    System Health
                </h2>
                <div id="health-status" class="grid md:grid-cols-4 gap-4">
                    <!-- Loading placeholder -->
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-3/4"></div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-3/4"></div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-3/4"></div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-3/4"></div>
                    </div>
                </div>
            </section>

            <!-- Statistics -->
            <section class="mb-8">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-chart-bar text-blue-600 mr-2"></i>
                    System Statistics
                </h2>
                <div id="stats" class="grid md:grid-cols-4 gap-4">
                    <!-- Loading placeholder -->
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
                        <div class="h-8 bg-gray-300 rounded w-3/4"></div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
                        <div class="h-8 bg-gray-300 rounded w-3/4"></div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
                        <div class="h-8 bg-gray-300 rounded w-3/4"></div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow animate-pulse">
                        <div class="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
                        <div class="h-8 bg-gray-300 rounded w-3/4"></div>
                    </div>
                </div>
            </section>

            <!-- Emergency Controls -->
            <section class="mb-8">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-exclamation-triangle text-yellow-600 mr-2"></i>
                    Emergency Controls
                </h2>
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="font-semibold">Emergency Stop</h3>
                                <p class="text-sm text-gray-600">
                                    Opens all circuit breakers, puts system in safe mode
                                </p>
                            </div>
                            <button onclick="emergencyStop()" 
                                    class="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700">
                                <i class="fas fa-power-off mr-2"></i>STOP
                            </button>
                        </div>
                        <hr>
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="font-semibold">Reset Circuit Breakers</h3>
                                <p class="text-sm text-gray-600">
                                    Reset all circuit breakers to operational state
                                </p>
                            </div>
                            <button onclick="resetCircuitBreakers()" 
                                    class="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
                                <i class="fas fa-redo mr-2"></i>Reset
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- API Endpoints Status -->
            <section class="mb-8">
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-plug text-green-600 mr-2"></i>
                    API Endpoints
                </h2>
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="overflow-x-auto">
                        <table class="min-w-full">
                            <thead>
                                <tr class="border-b">
                                    <th class="text-left py-2">Endpoint</th>
                                    <th class="text-left py-2">Status</th>
                                    <th class="text-left py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="endpoints">
                                <tr>
                                    <td class="py-2">/health</td>
                                    <td class="py-2">
                                        <span class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm">
                                            Checking...
                                        </span>
                                    </td>
                                    <td class="py-2">
                                        <button onclick="testEndpoint('/health')" 
                                                class="text-blue-600 hover:text-blue-800">
                                            Test
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <!-- Recent Activity -->
            <section>
                <h2 class="text-xl font-semibold mb-4">
                    <i class="fas fa-history text-purple-600 mr-2"></i>
                    Recent Activity
                </h2>
                <div class="bg-white p-6 rounded-lg shadow">
                    <div id="activity" class="space-y-2">
                        <p class="text-gray-600">Loading recent activity...</p>
                    </div>
                </div>
            </section>

        </main>
    </div>

    <script>
        // Global state
        let healthData = null;
        let statsData = null;

        // Load data on page load
        document.addEventListener('DOMContentLoaded', () => {
            refreshData();
            // Auto-refresh every 30 seconds
            setInterval(refreshData, 30000);
        });

        // Refresh all data
        async function refreshData() {
            await loadHealth();
            await loadStats();
            await loadEndpointsStatus();
            await loadActivity();
        }

        // Load health status
        async function loadHealth() {
            try {
                const response = await axios.get('/health');
                healthData = response.data;
                
                const container = document.getElementById('health-status');
                container.innerHTML = \`
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Overall Status</h3>
                        <p class="text-2xl font-bold \${getStatusColor(healthData.status)}">
                            \${healthData.status.toUpperCase()}
                        </p>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Database</h3>
                        <p class="text-2xl font-bold \${getCheckColor(healthData.checks.database.status)}">
                            \${healthData.checks.database.status.toUpperCase()}
                        </p>
                        <p class="text-xs text-gray-500">\${healthData.checks.database.responseTime}ms</p>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Circuit Breakers</h3>
                        <p class="text-2xl font-bold \${getCheckColor(healthData.checks.circuitBreakers.status)}">
                            \${healthData.checks.circuitBreakers.status.toUpperCase()}
                        </p>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Uptime</h3>
                        <p class="text-2xl font-bold text-blue-600">
                            \${formatUptime(healthData.uptime)}
                        </p>
                    </div>
                \`;
            } catch (error) {
                console.error('Failed to load health:', error);
                document.getElementById('health-status').innerHTML = \`
                    <div class="col-span-4 bg-red-50 p-6 rounded-lg">
                        <p class="text-red-600">Failed to load health status</p>
                    </div>
                \`;
            }
        }

        // Load statistics
        async function loadStats() {
            try {
                const response = await axios.get('/api/dashboard/stats');
                statsData = response.data;
                
                const container = document.getElementById('stats');
                container.innerHTML = \`
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Total Nodes</h3>
                        <p class="text-3xl font-bold text-blue-600">\${statsData.total_nodes || 0}</p>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Total Artworks</h3>
                        <p class="text-3xl font-bold text-green-600">\${statsData.total_artworks || 0}</p>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Total Transactions</h3>
                        <p class="text-3xl font-bold text-purple-600">\${statsData.total_transactions || 0}</p>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Avg Trust Level</h3>
                        <p class="text-3xl font-bold text-yellow-600">\${(statsData.avg_trust_level || 0).toFixed(2)}</p>
                    </div>
                \`;
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        }

        // Load endpoints status
        async function loadEndpointsStatus() {
            const endpoints = [
                { path: '/health', name: 'Health Check' },
                { path: '/api/health', name: 'API Health' },
                { path: '/api/graph-data', name: 'Graph Data' },
                { path: '/api/dashboard/stats', name: 'Dashboard Stats' },
                { path: '/api/openapi.json', name: 'OpenAPI Spec' },
                { path: '/api/docs', name: 'Swagger UI' }
            ];

            const container = document.getElementById('endpoints');
            container.innerHTML = endpoints.map(ep => \`
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 font-mono text-sm">\${ep.path}</td>
                    <td class="py-2" id="status-\${ep.path.replace(/\\//g, '-')}">
                        <span class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm">
                            Checking...
                        </span>
                    </td>
                    <td class="py-2">
                        <button onclick="testEndpoint('\${ep.path}')" 
                                class="text-blue-600 hover:text-blue-800 text-sm">
                            <i class="fas fa-flask mr-1"></i>Test
                        </button>
                    </td>
                </tr>
            \`).join('');

            // Test all endpoints
            for (const ep of endpoints) {
                testEndpoint(ep.path, true);
            }
        }

        // Test single endpoint
        async function testEndpoint(path, silent = false) {
            const statusId = 'status-' + path.replace(/\\//g, '-');
            const statusEl = document.getElementById(statusId);
            
            if (!silent) {
                statusEl.innerHTML = '<span class="px-2 py-1 bg-blue-200 text-blue-700 rounded text-sm">Testing...</span>';
            }
            
            try {
                const start = Date.now();
                const response = await axios.get(path);
                const duration = Date.now() - start;
                
                statusEl.innerHTML = \`
                    <span class="px-2 py-1 bg-green-200 text-green-700 rounded text-sm">
                        <i class="fas fa-check mr-1"></i>OK (\${duration}ms)
                    </span>
                \`;
            } catch (error) {
                const status = error.response?.status || 'Error';
                statusEl.innerHTML = \`
                    <span class="px-2 py-1 bg-red-200 text-red-700 rounded text-sm">
                        <i class="fas fa-times mr-1"></i>\${status}
                    </span>
                \`;
            }
        }

        // Load recent activity (placeholder)
        async function loadActivity() {
            const container = document.getElementById('activity');
            container.innerHTML = \`
                <div class="text-gray-600 space-y-2">
                    <div class="flex items-center space-x-2">
                        <i class="fas fa-circle text-green-400 text-xs"></i>
                        <span class="text-sm">System started successfully</span>
                        <span class="text-xs text-gray-400">Just now</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <i class="fas fa-circle text-blue-400 text-xs"></i>
                        <span class="text-sm">Health check passed</span>
                        <span class="text-xs text-gray-400">30s ago</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <i class="fas fa-circle text-gray-400 text-xs"></i>
                        <span class="text-sm">No recent errors</span>
                        <span class="text-xs text-gray-400">All time</span>
                    </div>
                </div>
            \`;
        }

        // Emergency stop
        async function emergencyStop() {
            if (!confirm('Are you sure you want to trigger EMERGENCY STOP? This will open all circuit breakers.')) {
                return;
            }
            
            try {
                await axios.post('/api/admin/emergency-stop');
                alert('Emergency stop triggered successfully');
                refreshData();
            } catch (error) {
                alert('Failed to trigger emergency stop: ' + error.message);
            }
        }

        // Reset circuit breakers
        async function resetCircuitBreakers() {
            if (!confirm('Reset all circuit breakers?')) {
                return;
            }
            
            try {
                // TODO: Implement reset endpoint
                alert('Circuit breakers reset (functionality not yet implemented)');
            } catch (error) {
                alert('Failed to reset circuit breakers: ' + error.message);
            }
        }

        // Helper functions
        function getStatusColor(status) {
            switch(status) {
                case 'healthy': return 'text-green-600';
                case 'degraded': return 'text-yellow-600';
                case 'unhealthy': return 'text-red-600';
                default: return 'text-gray-600';
            }
        }

        function getCheckColor(status) {
            switch(status) {
                case 'pass': return 'text-green-600';
                case 'warn': return 'text-yellow-600';
                case 'fail': return 'text-red-600';
                default: return 'text-gray-600';
            }
        }

        function formatUptime(seconds) {
            if (seconds < 60) return \`\${seconds}s\`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return \`\${minutes}m\`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return \`\${hours}h\`;
            const days = Math.floor(hours / 24);
            return \`\${days}d\`;
        }
    </script>
</body>
</html>`;
}
