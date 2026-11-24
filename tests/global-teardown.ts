import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  const reportDir = path.resolve(process.cwd(), 'playwright-report');
  if (fs.existsSync(reportDir)) {
    console.log('\n[E2E-QA] HTML 리포트 확인:');
    console.log('  yarn playwright show-report .\\playwright-report\n');
  }
}
