// server.js FINAL - Adaptado para PostgreSQL e Render

import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { MercadoPagoConfig, Preference } from "mercadopago";
import dotenv from "dotenv";
import pg from "pg";

// NOVAS IMPORTAÇÕES PARA O GRÁFICO
import { SimpleLinearRegression } from "ml-regression";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

// --- Configurações Iniciais ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// --- Configuração da Conexão com o PostgreSQL ---
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL, // Esta variável virá da Render
  ssl: {
    rejectUnauthorized: false,
  },
});

// --- Middlewares ---
app.use(
  cors({
    origin: "https://passa-pra-ela-oficial.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);

app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "images")));

// --- Configuração do Multer (sem alterações) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, path.join(__dirname, "images/players/")),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage: storage });

// ==============================================================================
// ===== ENDPOINTS COMPLETOS E ADAPTADOS PARA POSTGRESQL ========================
// ==============================================================================

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

app.post("/jogadoras", upload.array("imagens", 15), async (req, res) => {
  const { nome, posicao, numero_camisa, nome_time } = req.body;
  const files = req.files;
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

app.get("/jogadoras", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM jogadoras ORDER BY id ASC");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar jogadoras:", error);
    res.status(500).json({ message: "Erro interno." });
  }
});

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
    res.status(201).json({
      success: true,
      message: "Usuário cadastrado com sucesso!",
      email: email,
      teamName: nomeDaEquipe,
      redirectTo: "/team",
    });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error);
    res.status(500).json({ message: "Erro interno ao cadastrar usuário." });
  }
});

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
  }
  const ADMIN_EMAIL = "admin@passapraela.com";
  const ADMIN_SENHA = "adminpassword";
  if (email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    return res.status(200).json({
      success: true,
      message: "Login de admin bem-sucedido!",
      redirectTo: "/admin",
    });
  }
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
        email: user.email, // Adiciona o email do usuário na resposta
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

app.post("/escalacao", async (req, res) => {
  const { email, team } = req.body;
  if (!email || !team) {
    return res.status(400).json({ message: "Email e time são obrigatórios." });
  }
  try {
    const escalacaoJSON = JSON.stringify(team);
    await db.query(
      "UPDATE usuarios SET escalacao_atual = $1 WHERE email = $2",
      [escalacaoJSON, email]
    );
    res
      .status(200)
      .json({ success: true, message: "Escalação salva com sucesso!" });
  } catch (error) {
    console.error("Erro ao salvar escalação:", error);
    res.status(500).json({ message: "Erro interno ao salvar escalação." });
  }
});

app.get("/escalacao/:email", async (req, res) => {
  const { email } = req.params;
  if (!email) {
    return res.status(400).json({ message: "Email é obrigatório." });
  }

  try {
    const result = await db.query(
      "SELECT escalacao_atual FROM usuarios WHERE email = $1",
      [email]
    );

    if (result.rows.length > 0 && result.rows[0].escalacao_atual) {
      const escalacao = JSON.parse(result.rows[0].escalacao_atual);
      res.status(200).json({ success: true, escalacao });
    } else {
      res.status(200).json({ success: true, escalacao: null }); // Usuário existe, mas não tem escalação
    }
  } catch (error) {
    console.error("Erro ao buscar escalação:", error);
    res.status(500).json({ message: "Erro interno ao buscar escalação." });
  }
});

app.post("/mercado/status", async (req, res) => {
  const { status } = req.body;
  if (status !== "aberto" && status !== "fechado") {
    return res.status(400).json({ message: "Status inválido." });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    if (status === "fechado") {
      await client.query("UPDATE mercado_status SET status = $1 WHERE id = 1", [
        "fechado",
      ]);
    } else {
      const usuariosResult = await client.query(
        "SELECT id, escalacao_atual FROM usuarios WHERE escalacao_atual IS NOT NULL"
      );
      for (const usuario of usuariosResult.rows) {
        const escalacao = JSON.parse(usuario.escalacao_atual);
        const idsJogadoras = Object.values(escalacao)
          .filter((j) => j)
          .map((j) => j.id);
        if (idsJogadoras.length === 0) continue;
        const placeholders = idsJogadoras.map((_, i) => `$${i + 1}`).join(",");
        const pontuacaoResult = await client.query(
          `SELECT SUM(pontuacao) as total_pontos_rodada FROM jogadoras WHERE id IN (${placeholders})`,
          idsJogadoras
        );
        const total_pontos_rodada = pontuacaoResult.rows[0].total_pontos_rodada;
        if (total_pontos_rodada) {
          await client.query(
            "UPDATE usuarios SET pontuacao_total = pontuacao_total + $1 WHERE id = $2",
            [total_pontos_rodada, usuario.id]
          );
        }
      }
      await client.query(
        "UPDATE jogadoras SET gols=0, assistencias=0, finalizacoes=0, desarmes=0, defesas=0, gol_sofrido=0, cartao_amarelo=0, cartao_vermelho=0, pontuacao=0"
      );
      await client.query("UPDATE usuarios SET escalacao_atual = NULL");
      await client.query("UPDATE mercado_status SET status = $1 WHERE id = 1", [
        "aberto",
      ]);
    }
    await client.query("COMMIT");
    const message =
      status === "fechado"
        ? "Mercado fechado! As escalações estão travadas."
        : "Ranking atualizado! Mercado aberto para a nova rodada.";
    res.status(200).json({ message });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao processar o mercado:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  } finally {
    client.release();
  }
});

app.get("/mercado/status", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT status FROM mercado_status WHERE id = 1"
    );
    res.status(200).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar status do mercado." });
  }
});

app.get("/ranking", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT nome_time, pontuacao_total FROM usuarios ORDER BY pontuacao_total DESC LIMIT 10"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar o ranking." });
  }
});

app.post("/jogadoras/:id/stats-fisicas", async (req, res) => {
  const { id } = req.params;
  const { passos, distanciaMetros } = req.body;
  try {
    await db.query(
      `UPDATE jogadoras SET passos_total = $1, distancia_km = $2 WHERE id = $3`,
      [passos, (distanciaMetros / 1000).toFixed(2), id]
    );
    res.status(200).json({
      success: true,
      message: `Estatísticas da jogadora ${id} atualizadas.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar estatísticas físicas:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

app.get("/jogadoras/:id/stats-fisicas", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "SELECT nome, passos_total, distancia_km FROM jogadoras WHERE id = $1",
      [id]
    );
    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ message: "Jogadora não encontrada." });
    }
  } catch (error) {
    console.error("Erro ao buscar estatísticas físicas:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

app.get("/math-stats-image", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT passos_total, distancia_km FROM jogadoras WHERE id = 1"
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Jogadora 1 não encontrada" });

    const { passos_total, distancia_km } = result.rows[0];
    const x = [],
      y = [];
    for (let i = 0; i < 50; i++) {
      const randomX = passos_total * (0.8 + Math.random() * 0.4);
      x.push(randomX);
      const randomY = distancia_km * (0.8 + Math.random() * 0.4);
      y.push(randomY);
    }
    x.push(passos_total);
    y.push(distancia_km);

    const regression = new SimpleLinearRegression(x, y);
    const linePoints = x
      .sort((a, b) => a - b)
      .map((val) => ({ x: val, y: regression.predict(val) }));

    const width = 800,
      height = 480;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: "#F9FAFB",
    });
    const configuration = {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Performance Simulado por Jogo",
            data: x.map((val, i) => ({ x: val, y: y[i] })),
            backgroundColor: "rgba(139, 92, 246, 0.6)",
          },
          {
            label: "Linha de Tendência (Regressão)",
            data: linePoints,
            type: "line",
            borderColor: "rgba(236, 72, 153, 1)",
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
          },
        ],
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: "Análise de Desempenho Físico (IoT)",
            font: { size: 20, weight: "bold" },
          },
          legend: { position: "bottom" },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Passos Totais na Partida",
              font: { size: 14 },
            },
          },
          y: {
            title: {
              display: true,
              text: "Distância Percorrida (km)",
              font: { size: 14 },
            },
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

    await db.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL,
        nome_time TEXT, pontuacao_total REAL DEFAULT 0, escalacao_atual TEXT
      );`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS jogadoras (
        id SERIAL PRIMARY KEY, nome TEXT NOT NULL, numero_camisa INT, posicao TEXT,
        url_imagem TEXT, nome_time TEXT, gols INT DEFAULT 0, assistencias INT DEFAULT 0,
        finalizacoes INT DEFAULT 0, desarmes INT DEFAULT 0, defesas INT DEFAULT 0,
        gol_sofrido INT DEFAULT 0, cartao_amarelo INT DEFAULT 0, cartao_vermelho INT DEFAULT 0,
        pontuacao REAL DEFAULT 0, passos_total INT DEFAULT 0, distancia_km REAL DEFAULT 0
      );`);

    await db.query(
      `CREATE TABLE IF NOT EXISTS mercado_status (id INT PRIMARY KEY, status TEXT NOT NULL);`
    );

    const mercado = await db.query("SELECT * FROM mercado_status WHERE id = 1");
    if (mercado.rows.length === 0) {
      await db.query(
        "INSERT INTO mercado_status (id, status) VALUES (1, 'aberto')"
      );
    }

    app.listen(port, () => {
      console.log(`✅ Backend rodando na porta ${port}`);
    });
  } catch (error) {
    console.error(
      "❌ Falha ao iniciar o servidor ou conectar à base de dados:",
      error
    );
  }
};

initialize();
