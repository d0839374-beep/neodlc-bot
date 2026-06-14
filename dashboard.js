const express = require('express');
const path = require('path');

module.exports = function({ client, pool, updateTicketPanel, updateVerifyPanel }) {
    const app = express();

    if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.trim() === '') {
        console.error('❌ ADMIN_SECRET не задан в .env! Дашборд отключён.');
        app.use((req, res) => res.status(403).send('Forbidden'));
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`Дашборд запущен на http://localhost:${PORT} (без доступа)`));
        return;
    }

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    function checkAuth(req, res, next) {
        const token = req.query.key;
        if (token === process.env.ADMIN_SECRET) return next();
        return res.status(403).json({ error: 'Forbidden' });
    }

    // Загрузка конфига из БД
    async function getConfig() {
        const res = await pool.query('SELECT value FROM config WHERE key = $1', ['main']);
        if (res.rows.length > 0) return res.rows[0].value;
        return {};
    }

    // Сохранение конфига в БД
    async function setConfig(cfg) {
        await pool.query(
            'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            ['main', JSON.stringify(cfg)]
        );
    }

    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

    // Основной конфиг
    app.get('/api/config', checkAuth, async (req, res) => {
        try {
            const cfg = await getConfig();
            res.json(cfg);
        } catch (e) {
            res.json({});
        }
    });

    app.post('/api/config', checkAuth, async (req, res) => {
        try {
            const cfg = await getConfig();
            const { welcomeChannelId, memberRoleId, unverifiedRoleId, welcomeEnabled, welcomeMessage } = req.body;
            if (welcomeChannelId !== undefined) cfg.welcomeChannelId = welcomeChannelId || '';
            if (memberRoleId !== undefined) cfg.memberRoleId = memberRoleId || '';
            if (unverifiedRoleId !== undefined) cfg.unverifiedRoleId = unverifiedRoleId || '';
            if (welcomeEnabled !== undefined) cfg.welcomeEnabled = welcomeEnabled !== false;
            if (welcomeMessage !== undefined) cfg.welcomeMessage = welcomeMessage || '';
            await setConfig(cfg);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Не удалось сохранить конфиг' });
        }
    });

    // Списки
    app.get('/api/channels', checkAuth, (req, res) => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Гильдия не найдена.' });
        const channels = guild.channels.cache.filter(ch => ch.type === 0).map(ch => ({ id: ch.id, name: `#${ch.name}` }));
        res.json(channels);
    });

    app.get('/api/roles', checkAuth, (req, res) => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Гильдия не найдена.' });
        const roles = guild.roles.cache.filter(r => r.name !== '@everyone' && !r.managed).map(r => ({ id: r.id, name: r.name }));
        res.json(roles);
    });

    app.get('/api/categories', checkAuth, (req, res) => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Гильдия не найдена.' });
        const categories = guild.channels.cache.filter(ch => ch.type === 4).map(ch => ({ id: ch.id, name: ch.name }));
        res.json(categories);
    });

    // Verify
    app.get('/api/verifysettings', checkAuth, async (req, res) => {
        try {
            const cfg = await getConfig();
            res.json({
                verifyEnabled: cfg.verifyEnabled || false,
                verifyChannelId: cfg.verifyChannelId || '',
                verifiedRoleId: cfg.verifiedRoleId || ''
            });
        } catch {
            res.json({ verifyEnabled: false, verifyChannelId: '', verifiedRoleId: '' });
        }
    });

    app.post('/api/verifysettings', checkAuth, async (req, res) => {
        const { verifyEnabled, verifyChannelId, verifiedRoleId } = req.body;
        try {
            const cfg = await getConfig();
            cfg.verifyEnabled = verifyEnabled === true;
            cfg.verifyChannelId = verifyChannelId || '';
            cfg.verifiedRoleId = verifiedRoleId || '';
            if (cfg.verifyChannelId !== verifyChannelId) cfg.verifyMessageId = null;
            await setConfig(cfg);
            if (typeof updateVerifyPanel === 'function') updateVerifyPanel();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Не удалось сохранить настройки верификации' });
        }
    });

    // Tickets
    app.get('/api/ticketsettings', checkAuth, async (req, res) => {
        try {
            const cfg = await getConfig();
            res.json({
                ticketEnabled: cfg.ticketEnabled || false,
                ticketChannelId: cfg.ticketChannelId || '',
                ticketCategoryId: cfg.ticketCategoryId || ''
            });
        } catch {
            res.json({ ticketEnabled: false, ticketChannelId: '', ticketCategoryId: '' });
        }
    });

    app.post('/api/ticketsettings', checkAuth, async (req, res) => {
        const { ticketEnabled, ticketChannelId, ticketCategoryId } = req.body;
        try {
            const cfg = await getConfig();
            cfg.ticketEnabled = ticketEnabled === true;
            cfg.ticketChannelId = ticketChannelId || '';
            cfg.ticketCategoryId = ticketCategoryId || '';
            if (cfg.ticketChannelId !== ticketChannelId) cfg.ticketMessageId = null;
            await setConfig(cfg);
            if (typeof updateTicketPanel === 'function') updateTicketPanel();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Не удалось сохранить настройки тикетов' });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Дашборд запущен на http://localhost:${PORT}?key=ВАШ_ADMIN_SECRET`));
};
