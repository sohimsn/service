const https = require('https');

const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
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
                    reject(new Error('Invalid JSON'));
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
        return res.status(200).send('OK');
    }

    try {
        const update = req.body;

        if (update && update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data || '';

            if (data.startsWith('take_')) {
                const parts = data.split('_');
                const archiveMsgId = parseInt(parts[1], 10);
                const orderNumber = parts[2];

                const boosterId = cb.from.id;
                const boosterName = cb.from.username 
                    ? `@${cb.from.username}` 
                    : `${cb.from.first_name} (ID: ${boosterId})`;

                // Пытаемся переслать данные аккаунта в личку бустеру
                const copyRes = await tgRequest('copyMessage', {
                    chat_id: boosterId,
                    from_chat_id: ADMIN_ID,
                    message_id: archiveMsgId
                });

                if (!copyRes.ok) {
                    // Если бустер еще не нажал /start в боте — показываем предупреждение
                    await tgRequest('answerCallbackQuery', {
                        callback_query_id: cb.id,
                        text: '⚠️ Сначала откройте бота @ghostmlbb_order_bot, нажмите /start и повторите попытку!',
                        show_alert: true
                    });
                    return res.status(200).send('OK');
                }

                // Подтверждаем бустеру во всплывающем окне
                await tgRequest('answerCallbackQuery', {
                    callback_query_id: cb.id,
                    text: '✅ Заказ ваш! Данные аккаунта отправлены вам в личку.',
                    show_alert: true
                });

                // Полностью удаляем карточку заказа из общего чата бустеров
                await tgRequest('deleteMessage', {
                    chat_id: cb.message.chat.id,
                    message_id: cb.message.message_id
                });

                // Отправляем тебе отчёт о том, кто забрал заказ
                await tgRequest('sendMessage', {
                    chat_id: ADMIN_ID,
                    text: `⚡ <b>Заказ #${orderNumber} принят!</b>\nИсполнитель: ${boosterName}`,
                    parse_mode: 'HTML'
                });
            }
        }
    } catch (error) {
        console.error('Webhook error:', error);
    }

    return res.status(200).send('OK');
};
