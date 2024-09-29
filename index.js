const express = require('express');
const path = require('path'); // Adicionado para lidar com caminhos de arquivos estáticos
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Conectar com o banco de dados
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'marceloG2024',
  database: process.env.DB_NAME || 'fluxo_caixa'
});

// Verificar a conexão
db.connect((err) => {
  if (err) {
    console.error('Erro ao conectar no banco de dados:', err);
  } else {
    console.log('Conectado ao banco de dados MySQL!');
  }
});

// Middleware para interpretar dados JSON
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:3001', // Permitir requisições do frontend rodando em localhost:3001
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Função auxiliar para tratar erros de banco de dados
const handleDatabaseError = (err, res, message = 'Erro no servidor') => {
  console.error(message, err);
  res.status(500).send(message);
};

// Função para gerar tokens JWT
const generateToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Middleware para verificar o token JWT
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(403).send('Token não fornecido');
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).send('Formato de token inválido');
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Erro JWT:', err);  
      return res.status(401).send('Token inválido');
    }

    req.userId = decoded.id;
    next();
  });
};

// Rota inicial para testar
app.get('/api', (req, res) => {
  res.send('Sistema de Fluxo de Caixa funcionando!');
});

// Rota para cadastrar um novo contribuinte
app.post('/api/contribuintes', (req, res) => {
  const { nome, identificacao } = req.body;
  const query = 'INSERT INTO contribuintes (nome, identificacao) VALUES (?, ?)';

  db.query(query, [nome, identificacao], (err, result) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao cadastrar contribuinte');
    res.status(201).send('Contribuinte cadastrado com sucesso!');
  });
});

// Rota para buscar todos os contribuintes
app.get('/api/contribuintes', (req, res) => {
  const query = 'SELECT * FROM contribuintes';

  db.query(query, (err, results) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao buscar contribuintes');
    res.status(200).json(results);
  });
});

// Rota para registrar uma nova contribuição
app.post('/api/entradas', (req, res) => {
  const { descricao, valor } = req.body; // Incluímos a descrição
  const query = 'INSERT INTO entradas (descricao, valor) VALUES (?, ?)';

  db.query(query, [descricao, valor], (err, result) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao registrar entrada');
    
    res.status(201).send('Contribuição registrada com sucesso!');
  });
});

// Rota para cadastrar um novo motivo de saída
app.post('/api/motivos-saida', (req, res) => {
  const { descricao } = req.body;
  const query = 'INSERT INTO motivos_saida (descricao) VALUES (?)';

  db.query(query, [descricao], (err, result) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao cadastrar motivo de saída');
    res.status(201).send('Motivo de saída cadastrado com sucesso!');
  });
});

// Rota para buscar todos os motivos de saída
app.get('/api/motivos-saida', (req, res) => {
  const query = 'SELECT * FROM motivos_saida';

  db.query(query, (err, results) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao buscar motivos de saída');
    res.status(200).json(results);
  });
});

// Rota para registrar uma nova saída
app.post('/api/saidas', (req, res) => {
  const { descricao, valor } = req.body; // Incluímos a descrição
  const query = 'INSERT INTO saidas (descricao, valor) VALUES (?, ?)';

  db.query(query, [descricao, valor], (err, result) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao registrar saída');
    
    res.status(201).send('Saída registrada com sucesso!');
  });
});

// Rota para consultar o saldo atual do caixa
app.get('/api/caixa', (req, res) => {
  const query = `
    SELECT 
      (SELECT IFNULL(SUM(valor), 0) FROM entradas) AS total_entradas,
      (SELECT IFNULL(SUM(valor), 0) FROM saidas) AS total_saidas
  `;

  db.query(query, (err, result) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao consultar saldo do caixa');
    
    const total_entradas = result[0].total_entradas;
    const total_saidas = result[0].total_saidas;
    const saldo_atual = total_entradas - total_saidas;
    res.status(200).json({ saldo_atual });
  });
});

app.get('/api/historico', (req, res) => {
  const { data_inicio, data_fim } = req.query;

  // Verifica se os parâmetros de data estão presentes
  if (!data_inicio || !data_fim) {
    return res.status(400).send('Parâmetros de data são obrigatórios');
  }

  // Inclui o horário 23:59:59 no fim da data para capturar o dia inteiro
  const dataFimComHorario = `${data_fim} 23:59:59`;

  const query = `
    SELECT descricao, valor, 'entrada' AS tipo, DATE_FORMAT(data, '%Y-%m-%d %H:%i:%s') AS data_hora
    FROM entradas
    WHERE data BETWEEN '${data_inicio}' AND '${dataFimComHorario}'
    UNION
    SELECT descricao, valor, 'saida' AS tipo, DATE_FORMAT(data, '%Y-%m-%d %H:%i:%s') AS data_hora
    FROM saidas
    WHERE data BETWEEN '${data_inicio}' AND '${dataFimComHorario}'
    ORDER BY data_hora DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar histórico:', err);
      return res.status(500).send('Erro ao buscar histórico');
    }

    res.status(200).json(results);
  });
});

// Rota para registrar um novo usuário
app.post('/api/register', (req, res) => {
  const { nome, email, senha } = req.body;

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(senha, salt);

  const query = 'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)';

  db.query(query, [nome, email, hashedPassword], (err, result) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao registrar usuário');
    
    res.status(201).send('Usuário registrado com sucesso!');
  });
});

// Rota para login de usuário
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body;

  const query = 'SELECT * FROM usuarios WHERE email = ?';

  db.query(query, [email], (err, results) => {
    if (err) return handleDatabaseError(err, res, 'Erro ao logar');

    if (results.length === 0) {
      return res.status(401).send('Usuário não encontrado');
    }

    const user = results[0];
    const senhaCorreta = bcrypt.compareSync(senha, user.senha);

    if (!senhaCorreta) {
      return res.status(401).send('Senha incorreta');
    }

    const token = generateToken(user);
    res.status(200).json({ token });
  });
});

// Rota protegida
app.get('/api/protegido', verifyToken, (req, res) => {
  res.send('Você acessou uma rota protegida!');
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});