module.exports = {
  apps: [
    {
      name: 'torrent-fitness',
      script: './dist/server.mjs',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      listen_timeout: 8000,
      kill_timeout: 5000
    }
  ]
};
