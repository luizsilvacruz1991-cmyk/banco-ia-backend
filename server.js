const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const JWT_SECRET = process.env.JWT_SECRET || 'chave_super_secreta_banco_ia_2026';

// Memória do sistema
let usuarios = [];
let logsErros = [];

// Função para registrar erros no sistema
function registrarErro(origem, mensagem, detalhe = null) {
    const erroObj = {
        id: Date.now().toString(),
        data: new Date().toLocaleString('pt-BR'),
        origem,
        mensagem,
        detalhe: detalhe ? detalhe.toString() : 'Sem detalhes adicionais'
    };
    logsErros.unshift(erroObj);
}

// Configuração de envio de e-mail
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: process.env.EMAIL_USER || 'teste@bancoia.com',
        pass: process.env.EMAIL_PASS || 'senha_teste'
    }
});

async function enviarNotificacaoEmail(destino, assunto, mensagem) {
    try {
        await transporter.sendMail({
            from: '"Segurança Banco IA" <seguranca@bancoia.com>',
            to: destino,
            subject: assunto,
            text: mensagem
        });
    } catch (error) {
        registrarErro('Serviço de E-mail', `Falha ao enviar e-mail para ${destino}`, error.message);
    }
}

// Rota para abrir o HTML na raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Listar todos os usuários para o Painel
app.get('/api/admin/usuarios', (req, res) => {
    const listaTratada = usuarios.map(u => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        status: u.status,
        criado_em: u.criado_em
    }));
    res.json(listaTratada);
});

// Listar logs de erro do sistema
app.get('/api/admin/erros', (req, res) => {
    res.json(logsErros);
});

// ROTA DE CADASTRO
app.post('/api/auth/registrar', async (req, res) => {
    try {
        const { nome, email, senha, renda_mensal } = req.body;

        if (!nome || !email || !senha) {
            registrarErro('Cadastro', 'Tentativa de cadastro com dados incompletos.');
            return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios.' });
        }

        const usuarioExiste = usuarios.find(u => u.email === email);
        if (usuarioExiste) {
            registrarErro('Cadastro', `Tentativa de duplicar o e-mail: ${email}`);
            return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
        }

        const senhaHash = await bcrypt.hash(senha, 10);

        const novoUsuario = {
            id: Date.now().toString(),
            nome,
            email,
            senha: senhaHash,
            status: 'PENDENTE',
            e_admin: false,
            renda_mensal: parseFloat(renda_mensal) || 0,
            saldo_atual: 0,
            criado_em: new Date().toLocaleString('pt-BR')
        };

        usuarios.push(novoUsuario);

        res.status(201).json({
            mensagem: 'Usuário cadastrado com sucesso!',
            usuario: { id: novoUsuario.id, nome: novoUsuario.nome, email: novoUsuario.email, status: novoUsuario.status }
        });
    } catch (error) {
        registrarErro('Cadastro', 'Erro interno ao processar cadastro.', error.message);
        res.status(500).json({ erro: 'Erro interno no servidor ao cadastrar.' });
    }
});

// ROTA DE LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        const usuario = usuarios.find(u => u.email === email);
        if (!usuario) {
            registrarErro('Login', `Falha de autenticação: e-mail ${email} não encontrado.`);
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        if (usuario.status === 'BLOQUEADO') {
            registrarErro('Login Rejeitado', `Tentativa de login de usuário bloqueado: ${email}`);
            return res.status(403).json({ erro: 'Acesso revogado pelo administrador.' });
        }

        if (usuario.status === 'PENDENTE') {
            registrarErro('Login Rejeitado', `Tentativa de login de conta pendente: ${email}`);
            return res.status(403).json({ erro: 'Acesso aguardando aprovação.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            registrarErro('Login', `Senha incorreta para a conta: ${email}`);
            return res.status(401).json({ erro: 'Senha incorreta.' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, status: usuario.status },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ mensagem: 'Login efetuado com sucesso!', token });
    } catch (error) {
        registrarErro('Login', 'Erro crítico durante autenticação.', error.message);
        res.status(500).json({ erro: 'Erro interno no login.' });
    }
});

// ALTERAR STATUS + MOTIVO POR E-MAIL
app.patch('/api/admin/usuarios/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { novoStatus, motivo } = req.body;

        const usuario = usuarios.find(u => u.id === id);
        if (!usuario) {
            registrarErro('Admin Status', `Tentativa de alterar status de ID inexistente: ${id}`);
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        usuario.status = novoStatus;

        const assunto = novoStatus === 'BLOQUEADO' ? 'Aviso Importante: Acesso Revogado' : 'Aviso: Acesso Reativado';
        const corpoEmail = `Olá ${usuario.nome},\n\nSeu acesso ao Banco IA foi alterado para: ${novoStatus}.\nMotivo informado pelo Administrador:\n"${motivo || 'Sem motivo especificado'}"\n\nAtenciosamente,\nEquipe de Segurança Banco IA.`;

        enviarNotificacaoEmail(usuario.email, assunto, corpoEmail);

        res.json({
            mensagem: `Status de ${usuario.email} alterado para ${novoStatus}. E-mail de notificação enviado!`,
            usuario: { id: usuario.id, email: usuario.email, status: usuario.status }
        });
    } catch (error) {
        registrarErro('Admin Status', 'Erro ao alterar status do usuário.', error.message);
        res.status(500).json({ erro: 'Erro ao processar alteração de status.' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`Servidor Ativo em http://localhost:${PORT}`);
    console.log(`=================================`);
});