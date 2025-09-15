import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import pg from "pg"; // Importa o 'pg'

const app = express();
const port = process.env.PORT || 3001;

// Configura a conexão com o PostgreSQL usando a URL da Render
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('images'));

// Endpoint da API para o cadastro
app.post("/cadastrar", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
  }
  try {
    const result = await db.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (result.rows.length > 0) {
      return res.status(409).json({ message: "Este email já está cadastrado." });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);
    await db.query("INSERT INTO usuarios (email, senha) VALUES ($1, $2)", [email, hashedPassword]);
    res.status(201).json({ success: true, message: "Usuário cadastrado com sucesso!" });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error.message);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Endpoint da API para o login
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
  }
  try {
    const result = await db.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (isMatch) {
      res.status(200).json({ success: true, message: "Login bem-sucedido!" });
    } else {
      res.status(401).json({ message: "Senha incorreta." });
    }
  } catch (error) {
    console.error("Erro no login:", error.message);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Endpoint para buscar as jogadoras
app.get("/jogadoras", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM jogadoras");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar jogadoras:", error.message);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Backend rodando na porta ${port}`);
});