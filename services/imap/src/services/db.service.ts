import '../config/env-loader';
import * as mysql from 'mysql2/promise';

export class DbService {
  private static pool: mysql.Pool | null = null;

  static getPool(): mysql.Pool {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3300', 10),
        user: process.env.DB_USERNAME || 'lemail',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'lemaildb',
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_POOL_SIZE || '20', 10),
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      console.log('[DbService] MySQL connection pool initialized.');
    }
    return this.pool;
  }

  static async query<T = any>(sql: string, params: any[] = []): Promise<T> {
    const pool = this.getPool();
    const [rows] = await pool.query(sql, params);
    return rows as T;
  }

  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('[DbService] MySQL connection pool closed.');
    }
  }
}
