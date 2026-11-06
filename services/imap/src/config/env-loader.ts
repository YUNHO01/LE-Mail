import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

export function loadEnv(): void {
  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
    path.resolve(__dirname, '../../../../'),
    path.resolve(__dirname, '../../../'),
    path.resolve(__dirname, '../../'),
  ];

  for (const dir of candidateDirs) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile });
      return;
    }
  }
}

loadEnv();
