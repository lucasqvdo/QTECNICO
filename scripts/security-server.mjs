import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'server/index.ts');
let source = fs.readFileSync(indexPath, 'utf8');

if (!source.includes("./httpSecurity.js")) {
  source = source.replace(
    "import webauthnRouter from './routes/webauthn.js';\n",
    "import webauthnRouter from './routes/webauthn.js';\nimport { applyHttpSecurity } from './httpSecurity.js';\n",
  );

  source = source.replace(
    "const PORT = parseInt(process.env.PORT || '5000', 10);\n\napp.use(cors());",
    "const PORT = parseInt(process.env.PORT || '5000', 10);\n\napplyHttpSecurity(app);",
  );

  if (!source.includes('applyHttpSecurity(app);')) {
    throw new Error('Security server: could not install HTTP security middleware.');
  }

  fs.writeFileSync(indexPath, source);
}

console.log('Security server: HTTP headers and strict CORS policy installed.');
