// PM2 Ecosystem — Crosslane Global Production
module.exports = {
  apps: [
    {
      name: 'crosslane-api',
      script: 'server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      // Restart if it crashes
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      // Watch for changes (disable in true production)
      watch: false,
      ignore_watch: ['node_modules', 'server/data', 'logs', '.git'],
      // Memory limits
      max_memory_restart: '256M',
    },
  ],
};
