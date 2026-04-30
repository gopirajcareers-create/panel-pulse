/**
 * PM2 Ecosystem Config — Panel Pulse AI
 * Usage: pm2 start ecosystem.config.js --env production
 */
module.exports = {
  apps: [
    {
      name: 'panel-pulse-backend',
      script: 'src/index.js',
      cwd: '/opt/panel-pulse/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        FRONTEND_URL: 'http://10.10.142.91',
        ALLOWED_ORIGIN: 'http://10.10.142.91',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/panel-pulse/backend-error.log',
      out_file: '/var/log/panel-pulse/backend-out.log',
      merge_logs: true,
    },
  ],
};
