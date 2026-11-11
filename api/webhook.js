const https = require('https');

const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyy1r4w3KroQjixKvGUGJ5wpxLnxw4RoAW2n3zzeiEDZwIkcVy5KtEv9_E9zy9BkiYf1g/exec';

function tgRequest(method, payload) {
    return new Promise((resolve, reject) => {
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
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function postToGoogleSheets(payload, targetUrl = GOOGLE_SCRIPT_URL, isRedirect = false) {
    return new Promise((resolve, reject) => {
        const postData = isRedirect ? '' : JSON.stringify(payload);
        const parsedUrl = new URL(targetUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: isRedirect ? 'GET' : 'POST',
            headers: isRedirect ? {} : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(postToGoogleSheets(payload, res.headers.location, true));
            }
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Google HTML error')); }
            });
        });
        req.on('error', reject);
        if (!isRedirect) req.write(postData);
        req.end();
    });
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send('OK');

    try {
        const update = req.body;
        if (update && update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data || '';

            if (data.startsWith('take_')) {
                const orderNumber = data.split('_');
                const boosterId = cb.from.id;
                const boosterName = cb.from.username 
                    ? `@${cb.from.username}` 
                    : `${cb.from.first_name} (ID: ${boosterId})`;

                // Забираем данные из Google Таблицы и фиксируем бустера
                const sheetRes = await postToGoogleSheets({
                    action: 'take',
                    orderNumber: orderNumber,
                    boosterName: boosterName
                });

                if (!sheetRes || !sheetRes.success) {
                    await tgRequest('answerCallbackQuery', {
                        callback_query_id: cb.id,
                        text: `⚠️ ${sheetRes?.error || 'Не удалось взять заказ'}`,
                        show_alert: true
                    });
                    return res.status(200).send('OK');
                }

                const o = sheetRes.order;
                const privateDetails = 
`🔐 <b>ЗАКАЗ #${orderNumber} — ДАННЫЕ ДЛЯ ВХОДА</b>\n\n` +
`🗺 <b>Маршрут:</b> ${o.route}\n` +
`💰 <b>Стоимость:</b> <code>${o.price}</code>\n\n` +
`👤 <b>Аккаунт клиента:</b>\n` +
`├ <b>ID игрока:</b> <code>${o.id}</code>\n` +
`├ <b>Сервер:</b> <code>${o.server}</code>\n` +
`├ <b>Платформа:</b> <b>${o.method}</b>\n` +
`├ <b>Логин:</b> <code>${o.login}</code>\n` +
`└ <b>Пароль:</b> <code>${o.password}</code>\n\n` +
`📸 <i>Не забудьте сделать скриншот аккаунта ДО начала игр и ПОСЛЕ завершения!</i>`;

                // Отправляем логин и пароль строго в личку бустеру
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
                    text: '✅ Заказ ваш! Данные аккаунта отправлены в личку.',
                    show_alert: true
                });

                // Полностью удаляем карточку из общего чата
                await tgRequest('deleteMessage', {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id
                });
            }
        }
    } catch (error) {
        console.error('Webhook error:', error);
    }

    return res.status(200).send('OK');
};
