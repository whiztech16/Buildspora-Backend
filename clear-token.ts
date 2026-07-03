// clear-token.ts
import { redis } from './src/lib/redis';

(async () => {
  await redis.del('nomba_token');
  await redis.del('nomba_token_live');
  await redis.del('nomba_token_sandbox');
  console.log('Cleared Nomba token cache');
  process.exit(0);
})();