/**
 * LEMail 엔터프라이즈 메일 플랫폼 PM2 프로세스 설정 파일
 * 
 * 실행 방법:
 *   - 전체 서비스 시작: pm2 start ecosystem.config.js
 *   - 서비스 재시작:    pm2 restart ecosystem.config.js
 *   - 무중단 리로드:    pm2 reload ecosystem.config.js
 *   - 서비스 중지:      pm2 stop ecosystem.config.js
 *   - 프로세스 삭제:    pm2 delete ecosystem.config.js
 *   - 상태 확인:        pm2 status
 *   - 실시간 로그:      pm2 logs
 *   - 부팅 시 자동실행: pm2 startup && pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'lemail-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=4096',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '4G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lemail-web',
      cwd: './apps/web',
      script: 'scripts/start.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '2G',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 9000,
      },
    },
    {
      name: 'lemail-imap',
      cwd: './services/imap',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '2G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lemail-haraka',
      cwd: './services/haraka',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=2048',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: '2G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
