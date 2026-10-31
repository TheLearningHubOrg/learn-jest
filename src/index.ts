// Public entry point plus a tiny demo you can run with `npm run dev` or `npm start`.
import { pathToFileURL } from 'node:url';
import { formatCents, totalFor } from './pricing.js';

export * from './types.js';
export * from './pricing.js';
export * from './retry.js';
export { UserService } from './userService.js';

const entry = process.argv[1];
const isMain = entry !== undefined && import.meta.url === pathToFileURL(entry).href;

if (isMain) {
  const total = totalFor({ plan: 'pro' }, [
    { sku: 'BOOK-1', unitPrice: 2999, quantity: 2 },
    { sku: 'PEN-9', unitPrice: 199, quantity: 3 },
  ]);
  console.log(`Pro plan total: ${formatCents(total)}`);
}
