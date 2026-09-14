import fs from 'node:fs';

const path = 'src/app/App.tsx';
let s = fs.readFileSync(path, 'utf8');
const replacements = [
  [
`  useEffect(() => {\n    const token = localStorage.getItem("qtecnico_token");\n    if (token) {\n      loadData()\n        .then(() => { setScreen("orders"); setActiveTab("orders"); })\n        .catch(() => localStorage.removeItem("qtecnico_token"));\n    }\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, []);`,
`  useEffect(() => {\n    loadData()\n      .then(() => { setScreen("orders"); setActiveTab("orders"); })\n      .catch(() => {\n        setOrders([]);\n        setClients([]);\n      });\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, []);`
  ],
  [
`  const afterAuth = async (token: string, user: { name: string; role: string; phone: string; email: string; photoUrl?: string | null }) => {\n    localStorage.setItem("qtecnico_token", token);`,
`  const afterAuth = async (user: { name: string; role: string; phone: string; email: string; photoUrl?: string | null }) => {`
  ],
  [
`      const { token, user } = await api.login(loginEmail, loginPassword);\n      await afterAuth(token, user);`,
`      const { user } = await api.login(loginEmail, loginPassword);\n      await afterAuth(user);`
  ],
  [
`    const { token, user } = await api.register(name, email, password);\n    await afterAuth(token, user);`,
`    const { user } = await api.register(name, email, password);\n    await afterAuth(user);`
  ],
  [`    await afterAuth(result.token, result.user);`, `    await afterAuth(result.user);`],
  [
`  const handleLogout = () => {\n    localStorage.removeItem("qtecnico_token");\n    setOrders([]); setClients([]);\n    setScreen("login");\n  };`,
`  const handleLogout = async () => {\n    try {\n      await api.logout();\n    } finally {\n      setOrders([]); setClients([]);\n      setScreen("login");\n    }\n  };`
  ]
];
for (const [oldText, newText] of replacements) {
  if (!s.includes(oldText)) throw new Error(`Expected block not found: ${oldText.slice(0, 80)}`);
  s = s.replace(oldText, newText);
}
if (s.includes('qtecnico_token') || s.includes('localStorage')) throw new Error('Legacy auth storage remains in App.tsx');
fs.writeFileSync(path, s);
