import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'server/index.ts');
let source = fs.readFileSync(indexPath, 'utf8');
let changed = false;

if (!source.includes("./httpSecurity.js")) {
  source = source.replace(
    "import webauthnRouter from './routes/webauthn.js';\n",
    "import webauthnRouter from './routes/webauthn.js';\nimport { applyHttpSecurity } from './httpSecurity.js';\n",
  );
  source = source.replace(
    "const PORT = parseInt(process.env.PORT || '5000', 10);\n\napp.use(cors());",
    "const PORT = parseInt(process.env.PORT || '5000', 10);\n\napplyHttpSecurity(app);",
  );
  if (!source.includes('applyHttpSecurity(app);')) throw new Error('Security server: could not install HTTP security middleware.');
  changed = true;
}

const unsafeSeedCondition = 'if (userCheck.rows.length === 0) {';
const legacySafeSeedCondition = "if (process.env.NODE_ENV !== 'production' && userCheck.rows.length === 0) {";
const explicitSeedCondition = "if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_SEED === 'true' && userCheck.rows.length === 0) {";

if (source.includes(unsafeSeedCondition)) {
  source = source.replace(unsafeSeedCondition, explicitSeedCondition);
  changed = true;
} else if (source.includes(legacySafeSeedCondition)) {
  source = source.replace(legacySafeSeedCondition, explicitSeedCondition);
  changed = true;
}

if (changed) fs.writeFileSync(indexPath, source);
console.log('Security server: HTTP hardening installed; demo seeding requires explicit ENABLE_DEMO_SEED=true outside production.');
