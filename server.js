import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { MercadoPagoConfig, Preference } from "mercadopago";
import dotenv from "dotenv";
import pg from "pg"; // 1. Importa o novo driver 'pg'

// Configuração de diretórios
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// --- 2. Configuração da Conexão com o PostgreSQL ---
const { Pool } = pg;
const db = new Pool({
  // A connection string virá do seu ficheiro .env (ex: do Render)
  connectionString: process.env.DATABASE_URL,
  // Esta opção é muitas vezes necessária para serviços de alojamento como o Render
  ssl: {
    rejectUnauthorized: false,
  },
});

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "images")));

// --- Configuração do Multer (sem alterações) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "images/players/"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage: storage });

// --- ENDPOINTS ATUALIZADOS PARA POSTGRESQL ---
// A lógica é a mesma, mas a sintaxe das queries muda:
// - "db.all/get/run" torna-se "db.query"
// - Os resultados estão em "result.rows"
// - Os parâmetros "?" tornam-se "$1, $2, $3, ..."

// Endpoint de pagamento (Mercado Pago) - sem alterações na base de dados
app.post("/create_preference", async (req, res) => {
  const { cartItems } = req.body;
  try {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    });
    const preference = new Preference(client);
    const items = cartItems.map((item) => ({
      title: item.nome,
      unit_price: Number(
        parseFloat(item.preco.replace("R$ ", "").replace(",", "."))
      ),
      quantity: item.quantity,
      currency_id: "BRL",
    }));
    const result = await preference.create({
      body: {
        items,
        back_urls: {
          success: "https://passa-pra-ela-oficial.vercel.app/loja",
          failure: "https://passa-pra-ela-oficial.vercel.app/carrinhoDecompras",
        },
        auto_return: "approved",
      },
    });
    res.status(201).json({ id: result.id });
  } catch (error) {
    console.error("Erro ao criar preferência:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Endpoint para cadastrar novas jogadoras
app.post("/jogadoras", upload.array("imagens", 15), async (req, res) => {
  const { nome, posicao, numero_camisa, nome_time } = req.body;
  const files = req.files;
  // ... (a sua lógica de tratamento de arrays permanece igual)
  const nomes = Array.isArray(nome) ? nome : [nome];
  const posicoes = Array.isArray(posicao) ? posicao : [posicao];
  const numeros = Array.isArray(numero_camisa)
    ? numero_camisa
    : [numero_camisa];
  const nomesTimes = Array.isArray(nome_time) ? nome_time : [nome_time];

  if (!files || files.length !== nomes.length) {
    return res.status(400).json({ message: "Dados de jogadoras incompletos." });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < nomes.length; i++) {
      const url_imagem = `/images/players/${files[i].filename}`;
      await client.query(
        "INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem, nome_time) VALUES ($1, $2, $3, $4, $5)",
        [nomes[i], numeros[i], posicoes[i], url_imagem, nomesTimes[i]]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({
      success: true,
      message: `Sucesso! ${nomes.length} jogadora(s) cadastrada(s).`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao cadastrar jogadoras:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  } finally {
    client.release();
  }
});

// Endpoint para atualizar estatísticas de JOGO
app.put("/jogadoras/:id/stats", async (req, res) => {
  const { id } = req.params;
  const {
    gols,
    assistencias,
    finalizacoes,
    desarmes,
    defesas,
    gol_sofrido,
    cartao_amarelo,
    cartao_vermelho,
  } = req.body;
  const pontuacao =
    gols * 8 +
    assistencias * 5 +
    finalizacoes * 1.5 +
    desarmes * 1 +
    defesas * 2 -
    gol_sofrido * 2 -
    cartao_amarelo * 2 -
    cartao_vermelho * 5;

  try {
    await db.query(
      `UPDATE jogadoras SET gols = $1, assistencias = $2, finalizacoes = $3, desarmes = $4, defesas = $5, gol_sofrido = $6, cartao_amarelo = $7, cartao_vermelho = $8, pontuacao = $9 WHERE id = $10`,
      [
        gols,
        assistencias,
        finalizacoes,
        desarmes,
        defesas,
        gol_sofrido,
        cartao_amarelo,
        cartao_vermelho,
        pontuacao,
        id,
      ]
    );
    res.status(200).json({
      success: true,
      message: "Pontuação atualizada com sucesso!",
      novaPontuacao: pontuacao,
    });
  } catch (error) {
    console.error("Erro ao atualizar estatísticas:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Endpoint para listar todas as jogadoras
app.get("/jogadoras", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM jogadoras");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar jogadoras:", error);
    res.status(500).json({ message: "Erro interno." });
  }
});

// Endpoint de cadastro de usuário
app.post("/cadastrar", async (req, res) => {
  const { email, senha, nomeDaEquipe } = req.body;
  if (!email || !senha || !nomeDaEquipe) {
    return res
      .status(400)
      .json({ message: "Email, senha e nome do time são obrigatórios." });
  }
  try {
    const result = await db.query("SELECT * FROM usuarios WHERE email = $1", [
      email,
    ]);
    if (result.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "Este email já está cadastrado." });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);
    await db.query(
      "INSERT INTO usuarios (email, senha, nome_time) VALUES ($1, $2, $3)",
      [email, hashedPassword, nomeDaEquipe]
    );
    res
      .status(201)
      .json({ success: true, message: "Usuário cadastrado com sucesso!" });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error);
    res.status(500).json({ message: "Erro interno ao cadastrar usuário." });
  }
});

// Endpoint de login
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  // ... (lógica de admin permanece igual)
  try {
    const result = await db.query("SELECT * FROM usuarios WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (isMatch) {
      res.status(200).json({
        success: true,
        message: "Login bem-sucedido!",
        teamName: user.nome_time,
        redirectTo: "/team",
      });
    } else {
      res.status(401).json({ message: "Senha incorreta." });
    }
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ message: "Erro interno no login." });
  }
});

// ==============================================================================
// ===== NOVO ENDPOINT PARA GERAR GRÁFICO (SUBSTITUI O ANTIGO) ================
// ==============================================================================

app.get("/math-stats-image", async (req, res) => {
  try {
    // 1. Simulação de Dados (equivalente ao numpy)
    const x = [];
    const y = [];
    for (let i = 0; i < 50; i++) {
      const randomX = Math.random() * 10;
      x.push(randomX);
      // y = 2x + 1 + ruído
      y.push(2 * randomX + 1 + (Math.random() - 0.5) * 4);
    }

    // 2. Modelo de Regressão Linear (equivalente ao scikit-learn)
    const regression = new SimpleLinearRegression(x, y);

    // Prepara os pontos para a linha de regressão
    const linePoints = x.map((val) => ({ x: val, y: regression.predict(val) }));

    // 3. Geração do Gráfico (equivalente ao matplotlib)
    const width = 800;
    const height = 480;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: "white",
    });

    const configuration = {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Dados Reais",
            data: x.map((val, i) => ({ x: val, y: y[i] })),
            backgroundColor: "rgba(54, 162, 235, 0.6)",
          },
          {
            label: "Linha de Regressão",
            data: linePoints,
            type: "line",
            borderColor: "rgba(255, 99, 132, 1)",
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            fill: false,
            tension: 0.1,
            pointRadius: 0,
          },
        ],
      },
      options: {
        scales: {
          x: {
            title: { display: true, text: "Métricas (Ex: Minutos Jogados)" },
          },
          y: {
            title: { display: true, text: "Pontuação" },
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Análise de Desempenho da Jogadora",
          },
        },
      },
    };

    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);

    res.setHeader("Content-Type", "image/png");
    res.send(imageBuffer);
  } catch (error) {
    console.error("Erro ao gerar o gráfico de análise:", error);
    res.status(500).json({ message: "Erro ao gerar gráfico." });
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR E BANCO DE DADOS ---
const initialize = async () => {
  try {
    await db.connect();
    console.log("✅ Conectado à base de dados PostgreSQL!");

    // Cria as tabelas se elas não existirem
    await db.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        nome_time TEXT,
        pontuacao_total REAL DEFAULT 0,
        escalacao_atual TEXT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS jogadoras (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        numero_camisa INT,
        posicao TEXT,
        url_imagem TEXT,
        nome_time TEXT,
        gols INT DEFAULT 0,
        assistencias INT DEFAULT 0,
        finalizacoes INT DEFAULT 0,
        desarmes INT DEFAULT 0,
        defesas INT DEFAULT 0,
        gol_sofrido INT DEFAULT 0,
        cartao_amarelo INT DEFAULT 0,
        cartao_vermelho INT DEFAULT 0,
        pontuacao REAL DEFAULT 0,
        passos_total INT DEFAULT 0,
        distancia_km REAL DEFAULT 0
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS mercado_status (
        id INT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `);

    // Garante que o mercado tenha um status inicial
    const mercado = await db.query("SELECT * FROM mercado_status WHERE id = 1");
    if (mercado.rows.length === 0) {
      await db.query(
        "INSERT INTO mercado_status (id, status) VALUES (1, 'aberto')"
      );
    }

    app.listen(port, () => {
      console.log(`✅ Backend rodando em http://localhost:${port}`);
    });
  } catch (error) {
    console.error(
      "❌ Falha ao iniciar o servidor ou conectar à base de dados:",
      error
    );
  }
};

initialize();
