const https = require('https');

const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
const BOOSTERS_CHAT_ID = '-5225091937';
const ADMIN_ID = '1482409914';
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

function sendPhotoToTg(chatId, base64Data, caption) {
    return new Promise((resolve) => {
        if (!base64Data || !base64Data.includes('base64,')) return resolve(null);
        const base64Clean = base64Data.split('base64,');
        const imgBuffer = Buffer.from(base64Clean, 'base64');
        const boundary = '----WebKitFormBoundary' + Math.random().toString(16).slice(2);

        const header = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
            `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
            `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="receipt.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
        );
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([header, imgBuffer, footer]);

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendPhoto`,
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.ok ? parsed.result.message_id : null);
                } catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
    });
}

function postToGoogleSheets(payload, targetUrl = GOOGLE_SCRIPT_URL) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload);
        const parsedUrl = new URL(targetUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(postToGoogleSheets(payload, res.headers.location));
            }
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

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { id, server, method, login, password, route, price, receiptImage, clientUserId } = req.body || {};

        // 1. Сохраняем скриншот чека в Telegram (чтобы получить ссылку для таблицы)
        let receiptInfo = 'Без скриншота';
        if (receiptImage) {
            const msgId = await sendPhotoToTg(ADMIN_ID, receiptImage, `🧾 Чек к новому заказу (${route} — ${price})`);
            if (msgId) {
                receiptInfo = `Чек в боте (ID сообщения: ${msgId})`;
            }
        }

        // 2. Записываем заказ в Google Таблицу и получаем строгий порядковый номер (#1, #2...)
        const sheetRes = await postToGoogleSheets({
            action: 'create',
            route,
            price,
            id,
            server,
            method,
            login,
            password,
            receiptUrl: receiptInfo
        });

        if (!sheetRes || !sheetRes.success) {
            return res.status(500).json({ success: false, error: 'Ошибка записи в Google Таблицу' });
        }

        const orderNumber = sheetRes.orderNumber;

        // 3. Кидаем чистую карточку БЕЗ паролей в общий чат бустеров
        const boosterText = 
`🔥 <b>НОВЫЙ ЗАКАЗ #${orderNumber}</b>\n\n` +
`🗺 <b>Маршрут:</b> ${route}\n` +
`💰 <b>Стоимость:</b> <code>${price}</code>\n\n` +
`👇 <i>Нажмите кнопку ниже, чтобы забрать заказ и получить данные в личку:</i>`;

        await tgRequest('sendMessage', {
            chat_id: BOOSTERS_CHAT_ID,
            text: boosterText,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '⚡ Взять заказ', callback_data: `take_${orderNumber}` }
                ]]
            }
        });

        // 4. Дублируем официальный чек клиенту в личку от бота (если клиент запускал бота)
        if (clientUserId) {
            const clientReceipt = 
`🧾 <b>ЭЛЕКТРОННЫЙ ЧЕК #${orderNumber}</b>\n\n` +
`✅ <b>Статус:</b> Оплата принята на проверку\n` +
`🗺 <b>Услуга:</b> ${route}\n` +
`💰 <b>Сумма:</b> <code>${price}</code>\n` +
`🎮 <b>ID аккаунта:</b> <code>${id} (${server})</code>\n\n` +
`📌 <i>Сохраните этот чек. При обращении в поддержку назовите номер заказа <b>#${orderNumber}</b>.</i>`;

            await tgRequest('sendMessage', {
                chat_id: clientUserId,
                text: clientReceipt,
                parse_mode: 'HTML'
            });
        }

        return res.status(200).json({ success: true, orderNumber: orderNumber });

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
