import { config } from 'dotenv';

config({ path: '.env.test' });
process.env.APP_SECRET ??= 'test-secret-test-secret-test-secret-123';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
