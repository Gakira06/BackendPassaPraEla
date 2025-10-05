import express from "express";
import cors from "cors";
import { open } from "sqlite";
import bcrypt from "bcrypt";
import sqlite3 from "sqlite3";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

// Importações para o Mercado Pago e variáveis de ambiente
import { MercadoPagoConfig, Preference } from "mercadopago";
import dotenv from "dotenv";
import fetch from "node-fetch"; // Importa o node-fetch

// Configuração de diretórios
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
let db;

// --- Middlewares ---
const allowedOrigins = [
  'https://passa-pra-ela-oficial.vercel.app'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permite pedidos sem 'origin' (ex: apps móveis, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'A política de CORS para este site não permite acesso a partir da Origem especificada.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Para compatibilidade com navegadores mais antigos
};


app.use(cors(corsOptions));

// Lida com os pedidos pre-flight para todas as rotas
app.options('*', cors(corsOptions));


// Os seus outros middlewares vêm depois
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "images")));

// --- Configuração do Multer para Upload de Imagens ---
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

// --- ENDPOINTS PADRÕES (Criação de Preferência, Jogadoras, Cadastro, Login, etc.) ---

// Endpoint de pagamento (Mercado Pago)
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
        items: items,
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
    res
      .status(500)
      .json({ message: "Erro interno no servidor ao criar preferência." });
  }
});

// Endpoint para cadastrar novas jogadoras
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

  try {
    await db.exec("BEGIN TRANSACTION");
    for (let i = 0; i < nomes.length; i++) {
      const url_imagem = `/images/players/${files[i].filename}`;
      await db.run(
        "INSERT INTO jogadoras (nome, numero_camisa, posicao, url_imagem, nome_time) VALUES (?, ?, ?, ?, ?)",
        [nomes[i], numeros[i], posicoes[i], url_imagem, nomesTimes[i]]
      );
    }
    await db.exec("COMMIT");
    res.status(201).json({
      success: true,
      message: `Sucesso! ${nomes.length} jogadora(s) cadastrada(s).`,
    });
  } catch (error) {
    await db.exec("ROLLBACK");
    console.error("Erro ao cadastrar jogadoras:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

// Endpoint para atualizar estatísticas e pontuação de uma jogadora
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
    await db.run(
      `UPDATE jogadoras SET gols = ?, assistencias = ?, finalizacoes = ?, desarmes = ?, defesas = ?, gol_sofrido = ?, cartao_amarelo = ?, cartao_vermelho = ?, pontuacao = ? WHERE id = ?`,
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
    res
      .status(200)
      .json({
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
    const jogadoras = await db.all("SELECT * FROM jogadoras");
    res.status(200).json(jogadoras);
  } catch (error) {
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
    const row = await db.get("SELECT * FROM usuarios WHERE email = ?", [email]);
    if (row) {
      return res
        .status(409)
        .json({ message: "Este email já está cadastrado." });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);
    await db.run(
      "INSERT INTO usuarios (email, senha, nome_time) VALUES (?, ?, ?)",
      [email, hashedPassword, nomeDaEquipe]
    );
    res
      .status(201)
      .json({ success: true, message: "Usuário cadastrado com sucesso!" });
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error.message);
    res.status(500).json({ message: "Erro interno ao cadastrar usuário." });
  }
});

// Endpoint de login
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ message: "Email e senha são obrigatórios." });
  }

  const ADMIN_EMAIL = "admin@passapraela.com";
  const ADMIN_SENHA = "adminpassword";

  if (email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    return res
      .status(200)
      .json({
        success: true,
        message: "Login de admin bem-sucedido!",
        redirectTo: "/admin",
      });
  }

  try {
    const user = await db.get("SELECT * FROM usuarios WHERE email = ?", [
      email,
    ]);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }
    const isMatch = await bcrypt.compare(senha, user.senha);
    if (isMatch) {
      res
        .status(200)
        .json({
          success: true,
          message: "Login bem-sucedido!",
          teamName: user.nome_time,
          redirectTo: "/team",
        });
    } else {
      res.status(401).json({ message: "Senha incorreta." });
    }
  } catch (error) {
    console.error("Erro no login:", error.message);
    res.status(500).json({ message: "Erro interno no login." });
  }
});

// Endpoint para o usuário salvar sua escalação no banco de dados
app.post("/escalacao", async (req, res) => {
  const { email, team } = req.body;
  if (!email || !team) {
    return res.status(400).json({ message: "Email e time são obrigatórios." });
  }
  try {
    const escalacaoJSON = JSON.stringify(team);
    await db.run("UPDATE usuarios SET escalacao_atual = ? WHERE email = ?", [
      escalacaoJSON,
      email,
    ]);
    res
      .status(200)
      .json({ success: true, message: "Escalação salva com sucesso!" });
  } catch (error) {
    console.error("Erro ao salvar escalação:", error);
    res.status(500).json({ message: "Erro interno ao salvar escalação." });
  }
});

// ===================================================================================
// ===== NOVA LÓGICA DE MERCADO, PONTUAÇÃO E RANKING (INÍCIO) =======================
// ===================================================================================

app.post("/mercado/status", async (req, res) => {
  const { status } = req.body;
  if (status !== "aberto" && status !== "fechado") {
    return res.status(400).json({ message: "Status inválido." });
  }

  try {
    // Inicia uma transação para garantir que todas as operações sejam bem-sucedidas ou nenhuma seja.
    await db.exec("BEGIN TRANSACTION");

    if (status === "fechado") {
      // ============================================================
      // ===== LÓGICA PARA FECHAR O MERCADO =========================
      // ============================================================
      // Quando o mercado fecha, a única ação é MUDAR O STATUS.
      // Isso "fotografa" a escalação de todos os usuários, impedindo que eles a alterem.
      // A pontuação das jogadoras PODE SER ATUALIZADA pelo admin enquanto o mercado está fechado.

      await db.run('UPDATE mercado_status SET status = "fechado" WHERE id = 1');

      // Confirma a transação, pois a única operação foi concluída com sucesso.
      await db.exec("COMMIT");
      res
        .status(200)
        .json({
          message:
            "Mercado fechado! As escalações estão travadas. Agora você pode atualizar a pontuação das jogadoras.",
        });
    } else {
      // status === 'aberto'
      // ============================================================
      // ===== LÓGICA PARA ABRIR O MERCADO (APURAÇÃO) ===============
      // ============================================================
      // Esta é a ação mais complexa. Ela executa toda a apuração da rodada anterior antes de preparar para a próxima.

      // 1. Calcular a pontuação da rodada para cada usuário e somar ao seu total.
      const usuarios = await db.all(
        "SELECT id, escalacao_atual FROM usuarios WHERE escalacao_atual IS NOT NULL"
      );
      for (const usuario of usuarios) {
        const escalacao = JSON.parse(usuario.escalacao_atual);
        const idsJogadoras = Object.values(escalacao)
          .filter((j) => j)
          .map((j) => j.id);

        if (idsJogadoras.length === 0) continue; // Pula se o usuário não escalou ninguém

        // Busca a soma dos pontos APENAS das jogadoras que o usuário escalou
        const placeholders = idsJogadoras.map(() => "?").join(",");
        const { total_pontos_rodada } = await db.get(
          `SELECT SUM(pontuacao) as total_pontos_rodada FROM jogadoras WHERE id IN (${placeholders})`,
          idsJogadoras
        );

        // Adiciona os pontos da rodada ao placar geral do usuário
        if (total_pontos_rodada) {
          await db.run(
            "UPDATE usuarios SET pontuacao_total = pontuacao_total + ? WHERE id = ?",
            [total_pontos_rodada, usuario.id]
          );
        }
      }

      // 2. ZERAR a pontuação de TODAS as jogadoras para a próxima rodada.
      await db.run(
        "UPDATE jogadoras SET gols = 0, assistencias = 0, finalizacoes = 0, desarmes = 0, defesas = 0, gol_sofrido = 0, cartao_amarelo = 0, cartao_vermelho = 0, pontuacao = 0"
      );

      // 3. LIMPAR a escalação de TODOS os usuários, forçando-os a escalar novamente.
      await db.run("UPDATE usuarios SET escalacao_atual = NULL");

      // 4. Mudar o status para "aberto" no banco de dados.
      await db.run('UPDATE mercado_status SET status = "aberto" WHERE id = 1');

      // Confirma todas as operações da transação.
      await db.exec("COMMIT");
      res
        .status(200)
        .json({
          message: "Ranking atualizado! Mercado aberto para a nova rodada.",
        });
    }
  } catch (error) {
    // Se qualquer erro ocorrer em qualquer uma das etapas acima, a transação inteira é revertida.
    await db.exec("ROLLBACK");
    console.error("Erro ao processar o mercado (transação revertida):", error);
    res
      .status(500)
      .json({
        message: "Erro interno no servidor. Nenhuma alteração foi salva.",
      });
  }
});
// ===================================================================================
// ===== NOVA LÓGICA DE MERCADO, PONTUAÇÃO E RANKING (FIM) ===========================
// ===================================================================================

// Endpoint para buscar status do mercado
app.get("/mercado/status", async (req, res) => {
  try {
    const row = await db.get("SELECT status FROM mercado_status WHERE id = 1");
    res.status(200).json(row);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar status do mercado." });
  }
});

// Endpoint para buscar o ranking
app.get("/ranking", async (req, res) => {
  try {
    const ranking = await db.all(
      "SELECT nome_time, pontuacao_total FROM usuarios ORDER BY pontuacao_total DESC LIMIT 10"
    );
    res.status(200).json(ranking);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar o ranking." });
  }
});

// Endpoint para servir como proxy para a GNews API
app.get("/noticias", async (req, res) => {
  const API_KEY = process.env.GNEWS_API_KEY;
  if (!API_KEY) {
    return res
      .status(500)
      .json({ message: "Chave da GNews API não configurada no backend." });
  }

  const QUERY =
    '"Brasileirão Feminino" OR "NWSL" OR "Liga F" OR "FA WSL" OR "Champions League Feminina"';
  const API_URL = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
    QUERY
  )}&lang=pt&category=sports&apikey=${API_KEY}`;

  try {
    // Usando o node-fetch importado
    const apiResponse = await fetch(API_URL);
    const data = await apiResponse.json();
    res.status(200).json(data);
  } catch (error) {
    console.error("Erro ao buscar notícias da GNews:", error);
    res.status(500).json({ message: "Erro ao buscar notícias." });
  }
});

// --- Inicialização do Servidor e Banco de Dados ---
(async () => {
  try {
    db = await open({
      filename: path.join(__dirname, "passa-pra-ela.db"),
      driver: sqlite3.verbose().Database,
    });

    // Tabela de usuários com pontuação e escalação
    await db.exec(
      `CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, email TEXT UNIQUE, senha TEXT, nome_time TEXT, pontuacao_total REAL DEFAULT 0, escalacao_atual TEXT)`
    );

    // Tabela de jogadoras com todas as estatísticas
    await db.exec(
      `CREATE TABLE IF NOT EXISTS jogadoras (id INTEGER PRIMARY KEY, nome TEXT, numero_camisa INTEGER, posicao TEXT, url_imagem TEXT, nome_time TEXT, gols INTEGER DEFAULT 0, assistencias INTEGER DEFAULT 0, finalizacoes INTEGER DEFAULT 0, desarmes INTEGER DEFAULT 0, defesas INTEGER DEFAULT 0, gol_sofrido INTEGER DEFAULT 0, cartao_amarelo INTEGER DEFAULT 0, cartao_vermelho INTEGER DEFAULT 0, pontuacao REAL DEFAULT 0)`
    );

    // Tabela de status do mercado
    await db.exec(
      `CREATE TABLE IF NOT EXISTS mercado_status (id INTEGER PRIMARY KEY, status TEXT NOT NULL)`
    );

    // Garante que o mercado tenha um status inicial
    const mercado = await db.get("SELECT * FROM mercado_status");
    if (!mercado) {
      await db.run(
        'INSERT INTO mercado_status (id, status) VALUES (1, "aberto")'
      );
    }

    app.listen(port, () => {
      console.log(`✅ Backend rodando em http://localhost:${port}`);
    });
  } catch (error) {
    console.error("❌ Falha ao iniciar o servidor:", error);
  }
})();
