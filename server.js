import express from "express";
import cors from "cors";
import { open } from "sqlite";
import bcrypt from "bcrypt";
import sqlite3 from "sqlite3";




const app = express();
const port = process.env.PORT || 3001;
let db;

// Middlewares
app.use(cors()); // Habilita o CORS para todas as rotas
app.use(express.json()); // Permite que o servidor entenda JSON no corpo das requisições
app.use(express.static('images'));

// Endpoint da API para o cadastro
app.post("/cadastrar", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
  }

  try {
    // Verifica se o usuário já existe
    const row = await db.get("SELECT * FROM usuarios WHERE email = ?", [email]);
    if (row) {
      return res
        .status(409)
        .json({ message: "Este email já está cadastrado."});
    }

    // Criptografa a senha antes de salvar
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);

    // Insere o novo usuário
    await db.run("INSERT INTO usuarios (email, senha) VALUES (?, ?)", [email, hashedPassword]);
    console.log(`Usuário ${email} cadastrado com sucesso!`);
    res
      .status(201)
      .json({ success: true, message: "Usuário cadastrado com sucesso!" });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error.message);
    res.status(500).json({
      message: "Erro interno no servidor ao tentar cadastrar o usuário.",
    });
  }
});

// Endpoint da API para o login
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
  }

  try {
    const user = await db.get("SELECT * FROM usuarios WHERE email = ?", [email]);

    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    // Compara a senha enviada com a senha criptografada no banco
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

// Inicia o servidor e o banco de dados
(async () => {
  try {
    db = await open({
      filename: "./passa-pra-ela.db",
      driver: sqlite3.verbose().Database,
    });

    await db.exec(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            email TEXT UNIQUE NOT NULL, 
            senha TEXT NOT NULL
        )`);

    app.listen(port, () => {
      console.log(`Backend rodando em http://localhost:${port}`);
    });
  } catch (error) {
    console.error(
      "Falha ao iniciar o servidor ou conectar ao banco de dados:",
      error
    );
  }
})();


// parte das jogadoras
app.get("/jogadoras", async (req, res) => {
  try {
    const jogadoras = await db.all("SELECT * FROM jogadoras");
    res.status(200).json(jogadoras);
  } catch (error) {
    console.error("Erro ao buscar jogadoras:", error.message);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});


// Inicia o servidor e o banco de dados
(async () => {
  try {
    db = await open({
      filename: "./passa-pra-ela.db", // Este é o arquivo que será usado
      driver: sqlite3.verbose().Database,
    });

    // Cria a tabela de usuários (SE NÃO EXISTIR)
    await db.exec(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            email TEXT UNIQUE NOT NULL, 
            senha TEXT NOT NULL
        )`);

    // Cria a tabela de jogadoras (SE NÃO EXISTIR)
    await db.exec(`CREATE TABLE IF NOT EXISTS jogadoras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome VARCHAR(255) NOT NULL,
        numero_camisa INT NOT NULL,
        posicao VARCHAR(50) NOT NULL,
        url_imagem VARCHAR(255) NOT NULL
    )`);
    
    // VERIFICA SE A TABELA JÁ FOI POPULADA ANTES DE INSERIR
    const count = await db.get("SELECT COUNT(id) as total FROM jogadoras");
    if (count.total === 0) {
        console.log('Populando a tabela de jogadoras pela primeira vez...');
        // Usa db.run para cada insert para evitar problemas de concorrência com exec
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Letícia Izidoro (Lelê)', 1, 'Goleira', '/players/leticiaIzidoro.jpg')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Antônia', 2, 'Lateral-Direita', '/players/antoniaSilva.jpg')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Rafaelle Souza', 4, 'Zagueira', '/players/rafaelleSouza.png')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Lauren', 3, 'Zagueira', '/players/lauren.jpg')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Tamires', 6, 'Lateral-Esquerda', '/players/tamires.jpg')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Angelina', 8, 'Meio-campista', '/players/Angelina.webp')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Ary Borges', 17, 'Meio-campista', '/players/aryBorges.webp')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Kerolin', 21, 'Meia-Atacante', '/players/kerolin.jpg')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Adriana Leal', 11, 'Atacante', '/players/adrianaLeal.jpg')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Geyse Ferreira', 18, 'Atacante', '/players/geyseFerreira.jpg')");
        await db.run("INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem) VALUES ('Debinha', 9, 'Atacante', '/players/debinha.webp')");
    }


    app.listen(port, () => {
      console.log(`Backend rodando em http://localhost:${port}`);
    });
  } catch (error) {
    console.error(
      "Falha ao iniciar o servidor ou conectar ao banco de dados:",
      error
    );
  }
})();