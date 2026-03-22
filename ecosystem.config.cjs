module.exports = {
  apps: [
    {
      name: 'claude-manager',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '~/.pm2/logs/claude-manager-error.log',
      out_file: '~/.pm2/logs/claude-manager-out.log',
      time: true
    }
  ]
};
