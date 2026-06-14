const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function({ client, configPath, warnings, updateTicketPanel, updateVerifyPanel }) {
    const app = express();

    // 1. Проверяем, что ADMIN_SECRET задан в .env
    if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.trim() === '') {
        console.error('❌ ADMIN_SECRET не задан в .env! Дашборд отключён.');
        // Любой запрос будет возвращать 403
        app.use((req, res) => res.status(403).send('Forbidden'));
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`Дашборд запущен на http://localhost:${PORT} (без доступа)`));
        return;
    }

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // 2. Middleware проверки ключа ИСКЛЮЧИТЕЛЬНО из query-параметра ?key=
    function checkAuth(req, res, next) {
        const token = req.query.key;   // берём только из адресной строки
        if (token === process.env.ADMIN_SECRET) return next();
        return res.status(403).json({ error: 'Forbidden' });
    }

    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

    // Основной конфиг (приветствие, автороли)
    app.get('/api/config', checkAuth, (req, res) => {
        try {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            res.json(data);
        } catch {
            res.json({
                welcomeChannelId: '',
                memberRoleId: '',
                unverifiedRoleId: '',
                welcomeEnabled: true,
                welcomeMessage: 'Добро пожаловать, {user}, на сервер!'
            });
        }
    });

    app.post('/api/config', checkAuth, (req, res) => {
        const { welcomeChannelId, memberRoleId, unverifiedRoleId, welcomeEnabled, welcomeMessage } = req.body;
        try {
            let cfg = {};
            try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
            if (welcomeChannelId !== undefined) cfg.welcomeChannelId = welcomeChannelId || '';
            if (memberRoleId !== undefined) cfg.memberRoleId = memberRoleId || '';
            if (unverifiedRoleId !== undefined) cfg.unverifiedRoleId = unverifiedRoleId || '';
            if (welcomeEnabled !== undefined) cfg.welcomeEnabled = welcomeEnabled !== false;
            if (welcomeMessage !== undefined) cfg.welcomeMessage = welcomeMessage || '';
            fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Не удалось сохранить конфиг' });
        }
    });

    // Списки каналов
    app.get('/api/channels', checkAuth, (req, res) => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Гильдия не найдена.' });
        const channels = guild.channels.cache
            .filter(ch => ch.type === 0)
            .map(ch => ({ id: ch.id, name: `#${ch.name}` }));
        res.json(channels);
    });

    // Списки ролей
    app.get('/api/roles', checkAuth, (req, res) => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Гильдия не найдена.' });
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone' && !r.managed)
            .map(r => ({ id: r.id, name: r.name }));
        res.json(roles);
    });

    // Категории
    app.get('/api/categories', checkAuth, (req, res) => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Гильдия не найдена.' });
        const categories = guild.channels.cache
            .filter(ch => ch.type === 4)
            .map(ch => ({ id: ch.id, name: ch.name }));
        res.json(categories);
    });

    // Verify
    app.get('/api/verifysettings', checkAuth, (req, res) => {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            res.json({
                verifyEnabled: cfg.verifyEnabled || false,
                verifyChannelId: cfg.verifyChannelId || '',
                verifiedRoleId: cfg.verifiedRoleId || ''
            });
        } catch {
            res.json({ verifyEnabled: false, verifyChannelId: '', verifiedRoleId: '' });
        }
    });

    app.post('/api/verifysettings', checkAuth, (req, res) => {
        const { verifyEnabled, verifyChannelId, verifiedRoleId } = req.body;
        try {
            let cfg = {};
            try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
            cfg.verifyEnabled = verifyEnabled === true;
            cfg.verifyChannelId = verifyChannelId || '';
            cfg.verifiedRoleId = verifiedRoleId || '';
            if (cfg.verifyChannelId !== verifyChannelId) {
                cfg.verifyMessageId = null;
            }
            fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
            if (typeof updateVerifyPanel === 'function') {
                updateVerifyPanel();
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Не удалось сохранить настройки верификации' });
        }
    });

    // Tickets
    app.get('/api/ticketsettings', checkAuth, (req, res) => {
        try {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            res.json({
                ticketEnabled: cfg.ticketEnabled || false,
                ticketChannelId: cfg.ticketChannelId || '',
                ticketCategoryId: cfg.ticketCategoryId || ''
            });
        } catch {
            res.json({ ticketEnabled: false, ticketChannelId: '', ticketCategoryId: '' });
        }
    });

    app.post('/api/ticketsettings', checkAuth, (req, res) => {
        const { ticketEnabled, ticketChannelId, ticketCategoryId } = req.body;
        try {
            let cfg = {};
            try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
            cfg.ticketEnabled = ticketEnabled === true;
            cfg.ticketChannelId = ticketChannelId || '';
            cfg.ticketCategoryId = ticketCategoryId || '';
            if (cfg.ticketChannelId !== ticketChannelId) {
                cfg.ticketMessageId = null;
            }
            fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
            if (typeof updateTicketPanel === 'function') {
                updateTicketPanel();
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Не удалось сохранить настройки тикетов' });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Дашборд запущен на http://localhost:${PORT}?key=ВАШ_ADMIN_SECRET`));
};