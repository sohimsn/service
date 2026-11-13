const https = require('https');

const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
const ADMIN_ID = '1482409914';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwb5Vmc1-O0rkLNCylyTrxbSPO5m1XyYh9UUe1jwHMUs2eW9KMzWEiU0bkenWJY5Lb6eQ/exec';

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
                try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false }); }
            });
        });
        req.on('error', () => resolve({ ok: false }));
        req.write(postData);
        req.end();
    });
}

function httpsGetJson(targetUrl) {
    return new Promise((resolve, reject) => {
        https.get(targetUrl, { family: 4 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(httpsGetJson(res.headers.location));
            }
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Ошибка ответа таблицы')); }
            });
        }).on('error', reject);
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('OK');
    }

    try {
        const update = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

        // 1. Обработка нажатий на кнопки
        if (update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data || '';
            const boosterId = cb.from.id;
            const boosterName = cb.from.username 
                ? `@${cb.from.username}` 
                : `${cb.from.first_name} (ID: ${boosterId})`;

            // Бустер забирает заказ из общего чата
            if (data.startsWith('take_')) {
                const orderNumber = data.replace('take_', '');

                const payloadString = encodeURIComponent(JSON.stringify({
                    action: 'take',
                    orderNumber: orderNumber,
                    boosterName: boosterName
                }));

                const sheetRes = await httpsGetJson(`${GOOGLE_SCRIPT_URL}?payload=${payloadString}`);

                if (!sheetRes || !sheetRes.success) {
                    await tgRequest('answerCallbackQuery', {
                        callback_query_id: cb.id,
                        text: `⚠️ ${sheetRes?.error || 'Не удалось получить заказ'}`,
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
`📸 <i>Сделайте скриншот ДО начала игр и ПОСЛЕ достижения ранга. Когда закончите — нажмите кнопку ниже:</i>`;

                const sendRes = await tgRequest('sendMessage', {
                    chat_id: boosterId,
                    text: privateDetails,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: `✅ Сдать заказ #${orderNumber}`, 
                                callback_data: `done_${orderNumber}`,
                                style: 'success'
                            }
                        ]]
                    }
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
            }

            // Бустер нажал "Сдать заказ" в своей личке
            if (data.startsWith('done_')) {
                const orderNumber = data.replace('done_', '');

                await tgRequest('answerCallbackQuery', {
                    callback_query_id: cb.id,
                    text: '📸 Отправьте скриншот результата в ответ на следующее сообщение!'
                });

                await tgRequest('sendMessage', {
                    chat_id: boosterId,
                    text: `📸 <b>Сдача заказа #${orderNumber}</b>\n\nПрикрепите скриншот финального ранга ответом (Reply) на это сообщение:`,
                    parse_mode: 'HTML',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: 'Прикрепите скриншот...'
                    }
                });
            }
        }

        // 2. Обработка присланного скриншота от бустера в личке
        if (update.message && update.message.photo && update.message.reply_to_message) {
            const replyText = update.message.reply_to_message.text || '';
            const match = replyText.match(/Сдача заказа #(\d+)/);

            if (match) {
                const orderNumber = match[1];
                const boosterId = update.message.from.id;
                const boosterName = update.message.from.username 
                    ? `@${update.message.from.username}` 
                    : `${update.message.from.first_name} (ID: ${boosterId})`;

                const photoArray = update.message.photo;
                const bestPhotoId = photoArray[photoArray.length - 1].file_id;

                // Пересылаем скриншот главному админу
                const adminPhotoRes = await tgRequest('sendPhoto', {
                    chat_id: ADMIN_ID,
                    photo: bestPhotoId,
                    caption: `🏆 <b>ЗАКАЗ #${orderNumber} ВЫПОЛНЕН!</b>\n\n👤 <b>Бустер:</b> ${boosterName}\n📸 <i>Скриншот финального ранга прикреплён.</i>`,
                    parse_mode: 'HTML'
                });

                const reportNote = adminPhotoRes.ok 
                    ? `Скрин у админа (ID: ${adminPhotoRes.result.message_id})` 
                    : 'Скриншот загружен';

                // Обновляем статус в Google Таблице на "Выполнен"
                const payloadString = encodeURIComponent(JSON.stringify({
                    action: 'complete',
                    orderNumber: orderNumber,
                    reportInfo: reportNote
                }));
                await httpsGetJson(`${GOOGLE_SCRIPT_URL}?payload=${payloadString}`);

                // Подтверждаем бустеру
                await tgRequest('sendMessage', {
                    chat_id: boosterId,
                    text: `🎉 <b>Отчёт по заказу #${orderNumber} принят!</b>\n\nСтатус заказа обновлён на «Выполнен». Выплата переведена в очередь на расчёт.`,
                    parse_mode: 'HTML'
                });
            }
        }

    } catch (error) {
        console.error('Webhook error:', error);
    }

    return res.status(200).send('OK');
};
