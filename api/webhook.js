const https = require('https');

const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
// ВСТАВЬ СЮДА СВОЙ РАБОЧИЙ URL ИЗ send-order.js:
const GOOGLE_SCRIPT_URL = 'https://google.com';

function tgRequest(method, payload) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(payload);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/${method}`,
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false, raw: body }); }
            });
        });
        req.on('error', (e) => resolve({ ok: false, err: e.message }));
        req.write(postData);
        req.end();
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        const webhookUrl = 'https://' + 'service-1-two.vercel.app' + '/api/webhook';
        const setupRes = await tgRequest('setWebhook', {
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query'],
            drop_pending_updates: true
        });
        return res.status(200).json(setupRes);
    }

    try {
        const update = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

        if (update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data || '';

            if (data.startsWith('take_')) {
                const boosterId = cb.from.id;
                const boosterName = cb.from.username 
                    ? `@${cb.from.username}` 
                    : `${cb.from.first_name} (ID: ${boosterId})`;

                const entities = cb.message.entities || [];
                const linkEntity = entities.find(e => e.type === 'text_link' && e.url.includes('url='));

                if (!linkEntity) {
                    await tgRequest('answerCallbackQuery', {
                        callback_query_id: cb.id,
                        text: '⚠️ Создайте новый тестовый заказ в приложении, чтобы проверить кнопку.',
                        show_alert: true
                    });
                    return res.status(200).send('OK');
                }

                const encodedData = decodeURIComponent(linkEntity.url.split('url=').pop());
                const o = JSON.parse(Buffer.from(encodedData, 'base64').toString('utf-8'));

                const privateDetails = 
`🔐 <b>ЗАКАЗ #${o.n} — ДАННЫЕ ДЛЯ ВХОДА</b>\n\n` +
`🗺 <b>Маршрут:</b> ${o.r}\n` +
`💰 <b>Стоимость:</b> <code>${o.p}</code>\n\n` +
`👤 <b>Аккаунт клиента:</b>\n` +
`├ <b>ID игрока:</b> <code>${o.i}</code>\n` +
`├ <b>Сервер:</b> <code>${o.s}</code>\n` +
`├ <b>Платформа:</b> <b>${o.m}</b>\n` +
`├ <b>Логин:</b> <code>${o.l}</code>\n` +
`└ <b>Пароль:</b> <code>${o.pw}</code>\n\n` +
`📸 <i>Не забудьте сделать скриншот аккаунта ДО начала игр и ПОСЛЕ завершения!</i>`;

                const sendRes = await tgRequest('sendMessage', {
                    chat_id: boosterId,
                    text: privateDetails,
                    parse_mode: 'HTML'
                });

                if (!sendRes.ok) {
                    await tgRequest('answerCallbackQuery', {
                        callback_query_id: cb.id,
                        text: '⚠️ Сначала откройте бота @ghostmlbb_order_bot, нажмите /start и повторите попытку!',
                        show_alert: true
                    });
                    return res.status(200).send('OK');
                }

                await tgRequest('answerCallbackQuery', {
                    callback_query_id: cb.id,
                    text: '✅ Заказ ваш! Данные аккаунта отправлены вам в личку.',
                    show_alert: true
                });

                await tgRequest('deleteMessage', {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id
                });

                const payloadString = encodeURIComponent(JSON.stringify({
                    action: 'take',
                    orderNumber: o.n,
                    boosterName: boosterName
                }));
                await fetch(`${GOOGLE_SCRIPT_URL}?payload=${payloadString}`, { method: 'GET' }).catch(() => {});
            }
        }
    } catch (error) {
        if (req.body && req.body.callback_query) {
            await tgRequest('answerCallbackQuery', {
                callback_query_id: req.body.callback_query.id,
                text: '❌ Ошибка: ' + error.message,
                show_alert: true
            });
        }
    }

    return res.status(200).send('OK');
};
