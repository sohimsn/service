const https = require('https');

const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
const CHAT_ID = '-5225091937';

module.exports = (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { id, server, method, login, password, route, price } = req.body || {};

    const messageText = 
`📦 <b>ПОСТУПИЛ НОВЫЙ ЗАКАЗ НА БУСТ!</b>\n\n` +
`🗺 <b>Маршрут:</b> ${route}\n` +
`💰 <b>Стоимость:</b> <code>${price}</code>\n\n` +
`👤 <b>Данные аккаунта:</b>\n` +
`├ <b>ID игрока:</b> <code>${id}</code>\n` +
`├ <b>Сервер:</b> <code>${server}</code>\n` +
`├ <b>Платформа:</b> <b>${method}</b>\n` +
`├ <b>Логин:</b> <code>${login}</code>\n` +
`└ <b>Пароль:</b> <code>${password}</code>\n\n` +
`⚡️ <i>Бустеры, кто берет заказ — отпишитесь админу!</i>`;

    const postData = JSON.stringify({
        chat_id: CHAT_ID,
        text: messageText,
        parse_mode: 'HTML'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        family: 4, // Принудительный IPv4 для стабильной связи с Telegram
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const request = https.request(options, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.ok) {
                    return res.status(200).json({ success: true, message: 'Заказ успешно отправлен!' });
                } else {
                    return res.status(500).json({ success: false, error: data.description });
                }
            } catch (e) {
                return res.status(500).json({ success: false, error: 'Ошибка ответа Telegram' });
            }
        });
    });

    request.on('error', (error) => {
        return res.status(500).json({ success: false, error: error.message });
    });

    request.write(postData);
    request.end();
};
