const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para processar JSON e servir arquivos da pasta
app.use(express.json());
app.use(express.static(__dirname));

// Banco de dados em memória (Simulação)
let usuarios = [
    { id: 1, nome: 'Admin Sistema', email: 'admin@banco.com', senha: '123', status: 'Ativo' }
];

// -------------------------------------------------------------
// ROTAS DE PÁGINAS (HTML)
// -------------------------------------------------------------

// ROTA PRINCIPAL: Abre a Central de Controle (index.html) direto na URL principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ROTA DO APP: Abre o aplicativo do cliente
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.html'));
});


// -------------------------------------------------------------
// ROTAS DA API
// -------------------------------------------------------------

// Cadastro de novos clientes (Iniciam com status 'Pendente')
app.post('/api/auth/registrar', (req, res) => {
    const { nome, email, senha } = req.body;
    
    const jaExiste = usuarios.find(u => u.email === email);
    if (jaExiste) {
        return res.status(400).json({ erro: 'Este e-mail já está cadastrado!' });
    }

    const novoUsuario = {
        id: Date.now(),
        nome,
        email,
        senha,
        status: 'Pendente' // Fica aguardando aprovação na Central
    };

    usuarios.push(novoUsuario);
    res.status(201).json({ mensagem: 'Cadastro realizado! Aguarde aprovação.', usuario: novoUsuario });
});

// Login do cliente
app.post('/api/auth/login', (req, res) => {
    const { email, senha } = req.body;
    const usuario = usuarios.find(u => u.email === email && u.senha === senha);

    if (!usuario) {
        return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    if (usuario.status !== 'Ativo') {
        return res.status(403).json({ erro: 'Sua conta ainda está Pendente de aprovação pelo Administrador.' });
    }

    res.json({ mensagem: 'Login realizado com sucesso!', usuario });
});

// Listar todos os usuários (Para a Central Admin)
app.get('/api/admin/usuarios', (req, res) => {
    res.json(usuarios);
});

// Alterar status do usuário (Para a Central Admin aprovar ou bloquear)
app.post('/api/admin/status', (req, res) => {
    const { id, status } = req.body;
    const usuario = usuarios.find(u => u.id == id);

    if (!usuario) {
        return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    usuario.status = status;
    res.json({ mensagem: `Status alterado para ${status} com sucesso!`, usuario });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
