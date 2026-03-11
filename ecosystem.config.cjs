module.exports = {
  apps: [
    {
      name: 'art-bank',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=art-bank-db --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        ANALYTICS_SERVICE_URL: 'http://localhost:8000'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'analytics-service',
      script: './venv/bin/python3',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      cwd: './analytics_service',
      env: {
        PYTHONUNBUFFERED: '1',
        PATH: './venv/bin:' + process.env.PATH
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none'
    }
  ]
}
