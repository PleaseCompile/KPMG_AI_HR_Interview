const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// อ่าน .env แบบ real-time (ทุกครั้งที่เรียก)
function readEnv() {
    const envPath = path.join(__dirname, '.env');
    const vars = {};
    try {
        if (fs.existsSync(envPath)) {
            fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const idx = line.indexOf('=');
                    if (idx > 0) {
                        vars[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
                    }
                }
            });
        }
    } catch (e) {
        console.error('Error reading .env:', e.message);
    }
    return vars;
}

function cleanJSONString(str) {
    return str.replace(/^```json\s*/i, '')
              .replace(/^```\s*/i, '')
              .replace(/\s*```$/i, '')
              .trim();
}

function callAlibabaAPI(payload, env, res) {
    const apiKey = env.ALIBABA_API_KEY;
    const endpoint = env.ALIBABA_ENDPOINT || 'https://ws-mdu7bwolkfs5bk1i.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
    const model = env.ALIBABA_MODEL || 'qwen-plus';

    const url = `${endpoint}/chat/completions`;

    // แปลงประวัติการสนทนาให้เป็น OpenAI/Qwen Format
    const messages = [
        { role: 'system', content: payload.systemPrompt }
    ];
    
    if (payload.history && Array.isArray(payload.history)) {
        payload.history.forEach(h => {
            messages.push({
                role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
                content: h.content
            });
        });
    }

    messages.push({
        role: 'user',
        content: payload.message
    });

    const requestBody = JSON.stringify({
        model: model,
        messages: messages,
        response_format: { type: 'json_object' }
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    };

    console.log(`🤖 [Qwen API] calling: ${model}`);
    const req = https.request(url, options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
            try {
                const json = JSON.parse(data);
                if (json.choices && json.choices[0] && json.choices[0].message) {
                    let text = json.choices[0].message.content.trim();
                    text = cleanJSONString(text);
                    const parsed = JSON.parse(text);
                    res.end(JSON.stringify(parsed));
                } else {
                    res.end(data);
                }
            } catch (e) {
                res.end(data);
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Qwen API Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    });

    req.write(requestBody);
    req.end();
}

function callGeminiAPI(payload, env, res) {
    const apiKey = env.GEMINI_API_KEY;
    const model = env.GEMINI_MODEL || 'gemini-2.0-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // แปลงประวัติการสนทนาให้เป็น Gemini Format
    const contents = [];
    if (payload.history && Array.isArray(payload.history)) {
        payload.history.forEach(h => {
            contents.push({
                role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.content }]
            });
        });
    }

    contents.push({
        role: 'user',
        parts: [{ text: payload.message }]
    });

    const requestBody = JSON.stringify({
        systemInstruction: {
            parts: [{ text: payload.systemPrompt }]
        },
        contents: contents,
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8
        }
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    console.log(`🤖 [Gemini API] calling: ${model}`);
    const req = https.request(url, options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
            try {
                const json = JSON.parse(data);
                if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
                    let text = json.candidates[0].content.parts[0].text.trim();
                    text = cleanJSONString(text);
                    const parsed = JSON.parse(text);
                    res.end(JSON.stringify(parsed));
                } else {
                    res.end(data);
                }
            } catch (e) {
                res.end(data);
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Gemini API Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    });

    req.write(requestBody);
    req.end();
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
    // API endpoint: ตรวจสอบความถูกต้องของ API Key
    if (req.url === '/api/config') {
        const env = readEnv();
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        
        // ส่งผลบอก Client ว่าใช้ตัวไหนอยู่
        const activeProvider = env.ALIBABA_API_KEY ? 'Alibaba Qwen' : (env.GEMINI_API_KEY ? 'Gemini' : 'None');
        res.end(JSON.stringify({
            GEMINI_API_KEY: env.ALIBABA_API_KEY || env.GEMINI_API_KEY || '',
            PROVIDER: activeProvider
        }));
        return;
    }

    // API endpoint: Proxy Chat Call
    if (req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const env = readEnv();
            try {
                const payload = JSON.parse(body);
                if (env.ALIBABA_API_KEY) {
                    callAlibabaAPI(payload, env, res);
                } else if (env.GEMINI_API_KEY) {
                    callGeminiAPI(payload, env, res);
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No API Key configured in .env' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON request payload' }));
            }
        });
        return;
    }

    // Serve static files
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    const env = readEnv();
    console.log(`\n  🚀 AI HR Interview Assistant`);
    console.log(`  ───────────────────────────`);
    console.log(`  Server running at: http://localhost:${PORT}`);
    
    if (env.ALIBABA_API_KEY) {
        console.log(`  Active Provider:  ✅ Alibaba Qwen (qwen-plus)`);
    } else if (env.GEMINI_API_KEY) {
        console.log(`  Active Provider:  ✅ Google Gemini (${env.GEMINI_MODEL || 'gemini-2.0-flash-lite'})`);
    } else {
        console.log(`  Active Provider:  ❌ No Key Loaded (Please configure .env)`);
    }
    
    console.log(`  .env จะถูกอ่านใหม่ทุกครั้งที่ refresh หน้า`);
    console.log(`\n  กด Ctrl+C เพื่อหยุด server\n`);
});
