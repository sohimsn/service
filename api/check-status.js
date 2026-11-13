const https = require('https');

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwb5Vmc1-O0rkLNCylyTrxbSPO5m1XyYh9UUe1jwHMUs2eW9KMzWEiU0bkenWJY5Lb6eQ/exec';


function httpsGetJson(targetUrl) {
    return new Promise((resolve, reject) => {
        https.get(targetUrl, { family: 4 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(httpsGetJson(res.headers.location));
            }
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Invalid JSON')); }
            });
        }).on('error', reject);
    });
}

module.exports = async (req, res) => {
    const orderNumber = req.query.order;
    if (!orderNumber) {
        return res.status(400).json({ success: false, error: 'Нет номера заказа' });
    }

    try {
        const payloadString = encodeURIComponent(JSON.stringify({
            action: 'status',
            orderNumber: orderNumber
        }));
        const result = await httpsGetJson(`${GOOGLE_SCRIPT_URL}?payload=${payloadString}`);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};
