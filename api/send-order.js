const https = require('https');

const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
const BOOSTERS_CHAT_ID = '-5225091937';
const ADMIN_ID = '1482409914';

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
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Invalid JSON from Telegram'));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { id, server, method, login, password, route, price } = req.body || {};
        const orderNumber = Math.floor(10000 + Math.random() * 90000);

        // 1. Сохраняем полную анкету с паролем в твою личку (сейф-архив)
        const adminText = 
`🔐 <b>ЗАКАЗ #${orderNumber} (АРХИВ ДАННЫХ)</b>\n\n` +
`🗺 <b>Маршрут:</b> ${route}\n` +
`💰 <b>Стоимость:</b> <code>${price}</code>\n\n` +
`👤 <b>Данные для входа:</b>\n` +
`├ <b>ID игрока:</b> <code>${id}</code>\n` +
`├ <b>Сервер:</b> <code>${server}</code>\n` +
`├ <b>Платформа:</b> <b>${method}</b>\n` +
`├ <b>Логин:</b> <code>${login}</code>\n` +
`└ <b>Пароль:</b> <code>${password}</code>`;

        const adminRes = await tgRequest('sendMessage', {
            chat_id: ADMIN_ID,
            text: adminText,
            parse_mode: 'HTML'
        });

        if (!adminRes.ok) {
            return res.status(500).json({ 
                success: false, 
                error: 'Бот не смог сохранить архив админу. Напишите /start боту @ghostmlbb_order_bot!' 
            });
        }

        const archiveMsgId = adminRes.result.message_id;

        // 2. Отправляем чистую карточку БЕЗ паролей в общий чат бустеров
        const boosterText = 
`🔥 <b>НОВЫЙ ЗАКАЗ #${orderNumber}</b>\n\n` +
`🗺 <b>Маршрут:</b> ${route}\n` +
`💰 <b>Стоимость:</b> <code>${price}</code>\n\n` +
`👇 <i>Нажмите кнопку ниже, чтобы забрать заказ и получить данные в личку:</i>`;

        const boosterRes = await tgRequest('sendMessage', {
            chat_id: BOOSTERS_CHAT_ID,
            text: boosterText,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '⚡ Взять заказ', callback_data: `take_${archiveMsgId}_${orderNumber}` }
                ]]
            }
        });

        if (boosterRes.ok) {
            return res.status(200).json({ success: true, message: 'Заказ отправлен!' });
        } else {
            return res.status(500).json({ success: false, error: boosterRes.description });
        }

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
