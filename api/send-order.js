export default async function handler(req, res) {
    // Разрешаем запросы только методом POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { id, server, method, login, password, route, price } = req.body;

        // Токен твоего бота и ID закрытого чата бустеров
        const BOT_TOKEN = '9207077949:AAGH1qKVUPZf5s3rgOk0T-sDQhBXXUg3o4Y';
        const CHAT_ID = '-5225091937';

        // Формируем дорогую и понятную карточку заказа для бустеров
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

        // Отправляем данные в Telegram через официальное API
        const telegramUrl = `https://telegram.org{BOT_TOKEN}/sendMessage`;
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: messageText,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();

        if (data.ok) {
            return res.status(200).json({ success: true, message: 'Заказ успешно отправлен!' });
        } else {
            return res.status(500).json({ success: false, error: data.description });
        }

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
