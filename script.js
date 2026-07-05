/* ========================================
   CONFIG
   ======================================== */
const CONFIG = {
    GEMINI_API_KEY: "",
    GEMINI_MODEL: "gemini-2.0-flash-lite",
    LANGUAGE: "th-TH",
    MAX_QUESTIONS: 7
};

/* โหลด API Key จาก server (.env) */
async function loadConfig() {
    try {
        var response = await fetch('/api/config');
        if (response.ok) {
            var data = await response.json();
            if (data.GEMINI_API_KEY) {
                CONFIG.GEMINI_API_KEY = data.GEMINI_API_KEY;
                console.log('✅ โหลด API Key จาก .env สำเร็จ');
            } else {
                console.warn('⚠️ ไฟล์ .env ไม่มี GEMINI_API_KEY');
            }
        } else {
            console.warn('⚠️ /api/config ตอบ ' + response.status + ' - ใช้ fallback key สำหรับ static deploy');
            CONFIG.GEMINI_API_KEY = 'sk-ws-H.YEEMLP.F6tq.MEQCIFZwKx0DxxrIwbi8C2nS3DpOdDkSyjtrnAp4op_9abGlAiBe6VhLUWmuL-mm-94jMz243lnTx-wkksxUo8vLqd2r1A';
        }
    } catch (e) {
        console.warn('❌ ไม่สามารถโหลด config - ใช้ fallback key สำหรับ static deploy:', e.message);
        CONFIG.GEMINI_API_KEY = 'sk-ws-H.YEEMLP.F6tq.MEQCIFZwKx0DxxrIwbi8C2nS3DpOdDkSyjtrnAp4op_9abGlAiBe6VhLUWmuL-mm-94jMz243lnTx-wkksxUo8vLqd2r1A';
    }
}

const MAX_HISTORY = 10;
const CIRCUMFERENCE = 2 * Math.PI * 52;

/* ========================================
   STATE
   ======================================== */
const state = {
    currentView: 'landing',
    candidate: null,
    settings: null,
    conversation: [],
    geminiContents: [],
    currentQuestion: '',
    currentQuestionIndex: 0,
    totalQuestions: 7,
    allEvaluations: [],
    startTime: null,
    timerInterval: null,
    elapsedSeconds: 0,
    isAISpeaking: false,
    isListening: false,
    recognition: null,
    interimTranscript: '',
    finalTranscript: '',
    currentMode: 'voice',
    abortController: null,
    isSending: false,
    interviewEnded: false,
    resultData: null,
    thaiVoice: null
};

/* ========================================
   UTILITIES
   ======================================== */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function refreshIcons() {
    if (window.lucide) {
        try { lucide.createIcons(); } catch (e) { /* ignore */ }
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return m + ':' + s;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return day + '/' + month + '/' + year + ' ' + h + ':' + min;
}

/* ========================================
   TOAST NOTIFICATION
   ======================================== */
function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var iconName = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : type === 'warning' ? 'alert-triangle' : 'info';
    toast.innerHTML = '<i data-lucide="' + iconName + '"></i><span>' + escapeHTML(message) + '</span>';
    container.appendChild(toast);
    refreshIcons();
    setTimeout(function () {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = '0.3s';
        setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
}

/* ========================================
   NAVIGATION
   ======================================== */
function navigateTo(page) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var target = document.getElementById(page + '-page');
    if (target) target.classList.add('active');
    state.currentView = page;
    document.querySelectorAll('.nav-link').forEach(function (l) {
        l.classList.toggle('active', l.getAttribute('data-page') === page);
    });
    closeNavMenu();
    window.scrollTo(0, 0);
}

function closeNavMenu() {
    document.getElementById('nav-menu').classList.remove('open');
}

function goToSetup() {
    if (!checkAPIKey()) return;
    navigateTo('setup');
}

/* ========================================
   MODAL
   ======================================== */
function openModal(id) {
    var modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        refreshIcons();
    }
}

function closeModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
}

/* ========================================
   API KEY CHECK
   ======================================== */
function checkAPIKey() {
    var key = CONFIG.GEMINI_API_KEY;
    if (!key || key.indexOf('PASTE_YOUR') === 0 || key.trim() === '') {
        openModal('apikey-modal');
        return false;
    }
    return true;
}

/* ========================================
   SETUP FORM VALIDATION
   ======================================== */
function clearFormErrors() {
    document.querySelectorAll('.form-error').forEach(function (e) { e.textContent = ''; });
    document.querySelectorAll('.input-error').forEach(function (e) { e.classList.remove('input-error'); });
}

function setFormError(fieldId, message) {
    var inp = document.getElementById('inp-' + fieldId);
    var err = document.getElementById('err-' + fieldId);
    if (inp) inp.classList.add('input-error');
    if (err) err.textContent = message;
}

function validateSetup() {
    clearFormErrors();
    var valid = true;
    var fields = [
        { id: 'name', label: 'ชื่อ-นามสกุล', minLen: 2 },
        { id: 'nickname', label: 'ชื่อเล่น', minLen: 1 },
        { id: 'education', label: 'ระดับการศึกษา' },
        { id: 'major', label: 'สาขาวิชา', minLen: 2 },
        { id: 'experience', label: 'ประสบการณ์' },
        { id: 'position', label: 'ตำแหน่งงาน' },
        { id: 'difficulty', label: 'ระดับคำถาม' },
        { id: 'type', label: 'รูปแบบสัมภาษณ์' },
        { id: 'duration', label: 'จำนวนคำถาม' }
    ];
    fields.forEach(function (f) {
        var inp = document.getElementById('inp-' + f.id);
        var val = inp ? inp.value.trim() : '';
        if (!val) {
            setFormError(f.id, 'กรุณา' + (f.minLen ? 'กรอก' : 'เลือก') + f.label);
            valid = false;
        } else if (f.minLen && val.length < f.minLen) {
            setFormError(f.id, f.label + 'ต้องมีอย่างน้อย ' + f.minLen + ' ตัวอักษร');
            valid = false;
        }
    });
    return valid;
}

function enterInterviewRoom() {
    if (!checkAPIKey()) return;
    if (!validateSetup()) {
        showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
        return;
    }
    state.candidate = {
        name: document.getElementById('inp-name').value.trim(),
        nickname: document.getElementById('inp-nickname').value.trim(),
        education: document.getElementById('inp-education').value,
        major: document.getElementById('inp-major').value.trim(),
        experience: document.getElementById('inp-experience').value
    };
    state.settings = {
        position: document.getElementById('inp-position').value,
        difficulty: document.getElementById('inp-difficulty').value,
        type: document.getElementById('inp-type').value,
        totalQuestions: parseInt(document.getElementById('inp-duration').value, 10)
    };
    state.totalQuestions = state.settings.totalQuestions;
    state.conversation = [];
    state.geminiContents = [];
    state.currentQuestionIndex = 0;
    state.allEvaluations = [];
    state.elapsedSeconds = 0;
    state.interviewEnded = false;
    state.resultData = null;
    initInterviewRoom();
    navigateTo('interview-room');
    startInterview();
}

/* ========================================
   INTERVIEW ROOM INIT
   ======================================== */
function initInterviewRoom() {
    document.getElementById('room-position-label').textContent = state.settings.position;
    document.getElementById('room-q-count').textContent = '0 / ' + state.totalQuestions;
    document.getElementById('room-progress-fill').style.width = '0%';
    document.getElementById('room-timer-text').textContent = '00:00';
    document.getElementById('question-text').textContent = 'ระบบกำลังเตรียมคำถามแรก...';
    document.getElementById('transcript-final').textContent = '';
    document.getElementById('transcript-interim').textContent = '';
    document.getElementById('transcript-placeholder').textContent = 'กดปุ่มไมโครโฟนเพื่อเริ่มตอบ...';
    document.getElementById('transcript-placeholder').style.display = '';
    document.getElementById('transcript-actions').style.display = 'none';
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-empty').style.display = '';
    document.getElementById('btn-mic').disabled = true;
    document.getElementById('btn-mic').classList.remove('recording');
    document.getElementById('mic-label').textContent = 'กดเพื่อพูด';
    document.getElementById('btn-repeat').disabled = true;
    document.getElementById('btn-stop-speech').disabled = true;
    setAIStatus('กำลังเตรียมคำถาม', '');
    setVoiceWave(false);
    setAvatarRings(false);
    switchMode('voice');
    document.getElementById('type-textarea').value = '';
}

/* ========================================
   AI STATUS & VISUALS
   ======================================== */
function setAIStatus(text, cls) {
    var el = document.getElementById('ai-status');
    el.textContent = text;
    el.className = 'ai-status';
    if (cls) el.classList.add(cls);
}

function setVoiceWave(active) {
    document.getElementById('ai-voice-wave').classList.toggle('active', active);
}

function setAvatarRings(active) {
    document.querySelectorAll('.ai-ring').forEach(function (r) {
        r.classList.toggle('active', active);
    });
}

function updateProgress() {
    var done = state.currentQuestionIndex;
    var total = state.totalQuestions;
    document.getElementById('room-q-count').textContent = done + ' / ' + total;
    var pct = total > 0 ? (done / total) * 100 : 0;
    document.getElementById('room-progress-fill').style.width = pct + '%';
}

/* ========================================
   TIMER
   ======================================== */
function startTimer() {
    state.startTime = Date.now();
    state.elapsedSeconds = 0;
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(function () {
        state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
        document.getElementById('room-timer-text').textContent = formatTime(state.elapsedSeconds);
    }, 1000);
}

function stopTimer() {
    clearInterval(state.timerInterval);
}

/* ========================================
   GEMINI API
   ======================================== */
function buildSystemPrompt() {
    var c = state.candidate;
    var s = state.settings;
    var topics = '';
    var pos = s.position;

    if (pos === 'IT Support' || pos === 'Help Desk') {
        topics = '- Hardware\n- Operating System\n- Software\n- Network เบื้องต้น\n- IP Address\n- DNS\n- DHCP\n- Printer\n- Troubleshooting\n- Remote Support\n- Ticket System\n- Customer Service\n- การสื่อสารกับผู้ใช้\n- การจัดลำดับความสำคัญของปัญหา';
    } else if (pos === 'Frontend Developer' || pos === 'Backend Developer' || pos === 'Full Stack Developer') {
        topics = '- Programming Fundamentals\n- HTML, CSS และ JavaScript\n- Framework\n- API\n- Database\n- Git\n- Debugging\n- Problem Solving\n- Software Development Process\n- Security Basics';
        if (pos === 'Frontend Developer') topics += '\n- Responsive Design\n- Browser Compatibility\n- Performance Optimization\n- UI/UX Basics';
        if (pos === 'Backend Developer') topics += '\n- Server Architecture\n- Authentication\n- Caching\n- Message Queue';
        if (pos === 'Full Stack Developer') topics += '\n- System Design\n- DevOps Basics\n- Testing';
    } else if (pos === 'Network Administrator') {
        topics = '- TCP/IP\n- OSI Model\n- Subnet\n- Router\n- Switch\n- VLAN\n- DHCP\n- DNS\n- Firewall\n- Network Troubleshooting';
    } else if (pos === 'Cyber Security Analyst') {
        topics = '- Security Fundamentals\n- CIA Triad\n- Phishing\n- Malware\n- Vulnerability\n- Log Analysis\n- Incident Response\n- OWASP\n- Access Control\n- Security Awareness';
    }

    return 'คุณคือ AI HR Interviewer มืออาชีพ พูดและตอบเป็นภาษาไทยธรรมชาติ สุภาพ เป็นกันเอง และเหมือนกำลังสัมภาษณ์งานจริง\n\n' +
        'ข้อมูลผู้สมัคร:\n' +
        '- ชื่อ: ' + c.name + '\n' +
        '- ชื่อเล่น: ' + c.nickname + '\n' +
        '- ระดับการศึกษา: ' + c.education + '\n' +
        '- สาขาวิชา: ' + c.major + '\n' +
        '- ประสบการณ์: ' + c.experience + '\n' +
        '- ตำแหน่งที่สมัคร: ' + s.position + '\n' +
        '- ระดับคำถาม: ' + s.difficulty + '\n' +
        '- ประเภทการสัมภาษณ์: ' + s.type + '\n\n' +
        'หัวข้อสำหรับการสัมภาษณ์:\n' + topics + '\n\n' +
        'กฎการสัมภาษณ์:\n' +
        '1. สัมภาษณ์ผู้สมัครตามตำแหน่งที่เลือก ทั้งหมด ' + s.totalQuestions + ' คำถาม\n' +
        '2. ถามครั้งละหนึ่งคำถามเท่านั้น\n' +
        '3. ไม่ถามหลายคำถามรวมกัน\n' +
        '4. ใช้ภาษาไทยที่ฟังเป็นธรรมชาติ\n' +
        '5. คำถามแต่ละข้อควรกระชับ\n' +
        '6. ไม่ตอบคำถามแทนผู้สมัคร\n' +
        '7. ไม่เฉลยก่อนผู้สมัครตอบ\n' +
        '8. หลีกเลี่ยงคำถามซ้ำ\n' +
        '9. ปรับคำถามตามคำตอบก่อนหน้า\n' +
        '10. ครอบคลุมทั้งความรู้ ทักษะการแก้ปัญหา การสื่อสาร และสถานการณ์จำลอง\n' +
        '11. ไม่ถามข้อมูลส่วนตัวที่ไม่เกี่ยวข้องกับงาน\n' +
        '12. ให้ Feedback สั้นๆ หลังตอบ แต่ไม่ต้องเปิดเผยคะแนนทั้งหมดจนกว่าจะจบ\n' +
        '13. เมื่อครบจำนวนคำถาม ให้สรุปผลอย่างยุติธรรม\n\n' +
        'สำคัญมาก: ตอบกลับเป็น JSON เท่านั้น โดยไม่มี Markdown code fence ไม่มี ```json ไม่มี ```\n\n' +
        'เมื่อยังไม่ครบคำถาม ตอบรูปแบบนี้:\n' +
        '{"status":"continue","feedback":"Feedback สั้นๆ","nextQuestion":"คำถามถัดไป","currentEvaluation":{"relevance":0,"technical":0,"communication":0,"problemSolving":0}}\n\n' +
        'เมื่อครบคำถามแล้ว ตอบรูปแบบนี้:\n' +
        '{"status":"completed","summary":"สรุปผล","scores":{"overall":0,"technical":0,"communication":0,"problemSolving":0,"confidence":0},"strengths":["จุดแข็ง1","จุดแข็ง2","จุดแข็ง3"],"improvements":["จุดพัฒนา1","จุดพัฒนา2","จุดพัฒนา3"],"recommendedAnswer":"ตัวอย่างแนวทางตอบ","recommendation":"คำแนะนำ"}\n\n' +
        'คะแนนทุกประเภทต้องเป็นตัวเลข 0-100';
}

async function callGeminiAPI(userMessage) {
    if (state.abortController) {
        state.abortController.abort();
    }
    state.abortController = new AbortController();

    const history = state.geminiContents.map(c => ({
        role: c.role,
        content: c.parts[0].text
    }));

    var response;
    let usingProxy = true;

    // 1. Try calling the local backend proxy first
    try {
        response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                systemPrompt: buildSystemPrompt(),
                history: history,
                message: userMessage
            }),
            signal: state.abortController.signal
        });
        if (!response.ok && response.status === 404) {
            // Not found on local server, fallback to direct browser call
            usingProxy = false;
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('REQUEST_ABORTED');
        }
        // Connection refused (meaning it's hosted statically e.g. on GitHub Pages)
        usingProxy = false;
    }

    // 2. Direct browser fallback (For GitHub Pages / Static Hosting)
    if (!usingProxy) {
        const alibabaKey = 'sk-ws-H.YEEMLP.F6tq.MEQCIFZwKx0DxxrIwbi8C2nS3DpOdDkSyjtrnAp4op_9abGlAiBe6VhLUWmuL-mm-94jMz243lnTx-wkksxUo8vLqd2r1A';
        const endpoint = 'https://ws-mdu7bwolkfs5bk1i.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions';

        const messages = [
            { role: 'system', content: buildSystemPrompt() }
        ];
        
        history.forEach(h => {
            messages.push({
                role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
                content: h.content
            });
        });

        messages.push({
            role: 'user',
            content: userMessage
        });

        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${alibabaKey}`
                },
                body: JSON.stringify({
                    model: 'qwen-plus',
                    messages: messages,
                    response_format: { type: 'json_object' }
                }),
                signal: state.abortController.signal
            });
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('REQUEST_ABORTED');
            }
            throw new Error('NETWORK_ERROR');
        }
    }

    if (response.status === 401 || response.status === 403) {
        throw new Error('API_KEY_INVALID');
    }
    if (response.status === 429) {
        throw new Error('RATE_LIMIT');
    }
    if (!response.ok) {
        throw new Error('API_ERROR_' + response.status);
    }

    var parsed;
    try {
        if (usingProxy) {
            parsed = await response.json();
        } else {
            // Direct call returns OpenAI format
            const json = await response.json();
            let text = json.choices[0].message.content.trim();
            text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
            parsed = JSON.parse(text);
        }
    } catch (e) {
        throw new Error('RESPONSE_PARSE_ERROR');
    }

    state.geminiContents.push(
        { role: 'user', parts: [{ text: userMessage }] },
        { role: 'model', parts: [{ text: JSON.stringify(parsed) }] }
    );

    return parsed;
}

function handleAPIError(err) {
    var msg = '';
    switch (err.message) {
        case 'REQUEST_ABORTED': return;
        case 'NETWORK_ERROR': msg = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ กรุณาตรวจสอบอินเทอร์เน็ต'; break;
        case 'API_KEY_INVALID': msg = 'API Key ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบในไฟล์ script.js'; break;
        case 'RATE_LIMIT': msg = 'เกินจำนวนคำขอ กรุณารอสักครู่แล้วลองอีกครั้ง'; break;
        case 'MODEL_NOT_FOUND': msg = 'Model ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'; break;
        case 'RESPONSE_PARSE_ERROR': case 'RESPONSE_NO_CONTENT': msg = 'ไม่สามารถอ่านข้อมูลจาก AI กรุณาลองใหม่'; break;
        case 'JSON_PARSE_ERROR': msg = 'รูปแบบข้อมูลไม่ถูกต้องจาก AI กรุณาลองใหม่'; break;
        default: msg = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ กรุณาลองใหม่';
    }
    setAIStatus('เกิดข้อผิดพลาด', 'status-error');
    setVoiceWave(false);
    setAvatarRings(false);
    showToast(msg, 'error');
    document.getElementById('btn-mic').disabled = true;
}

/* ========================================
   SPEECH SYNTHESIS (TTS)
   ======================================== */
function initVoices() {
    var voices = speechSynthesis.getVoices();
    state.thaiVoice = null;
    for (var i = 0; i < voices.length; i++) {
        if (voices[i].lang === 'th-TH' || voices[i].lang === 'th_TH') {
            state.thaiVoice = voices[i];
            break;
        }
    }
    if (!state.thaiVoice) {
        for (var j = 0; j < voices.length; j++) {
            if (voices[j].lang && voices[j].lang.indexOf('th') === 0) {
                state.thaiVoice = voices[j];
                break;
            }
        }
    }
}

if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = initVoices;
    initVoices();
}

function speakText(text, onEnd) {
    speechSynthesis.cancel();
    if (!text) { if (onEnd) onEnd(); return; }
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = CONFIG.LANGUAGE;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (state.thaiVoice) utterance.voice = state.thaiVoice;

    utterance.onstart = function () {
        state.isAISpeaking = true;
        setAIStatus('AI กำลังพูด', 'status-speaking');
        setVoiceWave(true);
        setAvatarRings(true);
        document.getElementById('btn-mic').disabled = true;
        document.getElementById('btn-stop-speech').disabled = false;
        document.getElementById('btn-repeat').disabled = true;
    };
    utterance.onend = function () {
        state.isAISpeaking = false;
        setAIStatus('พร้อมรับคำตอบ', 'status-ready');
        setVoiceWave(false);
        setAvatarRings(false);
        document.getElementById('btn-mic').disabled = false;
        document.getElementById('btn-stop-speech').disabled = true;
        document.getElementById('btn-repeat').disabled = false;
        if (onEnd) onEnd();
    };
    utterance.onerror = function () {
        state.isAISpeaking = false;
        setAIStatus('พร้อมรับคำตอบ', 'status-ready');
        setVoiceWave(false);
        setAvatarRings(false);
        document.getElementById('btn-mic').disabled = false;
        document.getElementById('btn-stop-speech').disabled = true;
        document.getElementById('btn-repeat').disabled = false;
        if (onEnd) onEnd();
    };
    speechSynthesis.speak(utterance);
}

function stopSpeech() {
    speechSynthesis.cancel();
}

function repeatQuestion() {
    if (state.currentQuestion) {
        speakText(state.currentQuestion);
    }
}

/* ========================================
   SPEECH RECOGNITION (STT)
   ======================================== */
function initRecognition() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('เบราว์เซอร์นี้ไม่รองรับการรับเสียง กรุณาใช้ Google Chrome หรือพิมพ์คำตอบแทน', 'warning');
        return false;
    }
    state.recognition = new SpeechRecognition();
    state.recognition.lang = CONFIG.LANGUAGE;
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.maxAlternatives = 1;

    state.recognition.onresult = function (event) {
        var interim = '';
        var final = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
            var transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                final += transcript;
            } else {
                interim += transcript;
            }
        }
        if (interim) {
            document.getElementById('transcript-interim').textContent = interim;
        }
        if (final) {
            state.finalTranscript = final;
            document.getElementById('transcript-final').textContent = final;
            document.getElementById('transcript-interim').textContent = '';
        }
    };

    state.recognition.onend = function () {
        state.isListening = false;
        document.getElementById('btn-mic').classList.remove('recording');
        document.getElementById('mic-label').textContent = 'กดเพื่อพูด';
        document.getElementById('transcript-area').classList.remove('active-listening');
        setAIStatus('พร้อมรับคำตอบ', 'status-ready');
        if (state.finalTranscript.trim()) {
            document.getElementById('transcript-placeholder').style.display = 'none';
            document.getElementById('transcript-actions').style.display = 'flex';
        }
    };

    state.recognition.onerror = function (event) {
        state.isListening = false;
        document.getElementById('btn-mic').classList.remove('recording');
        document.getElementById('mic-label').textContent = 'กดเพื่อพูด';
        document.getElementById('transcript-area').classList.remove('active-listening');
        setAIStatus('พร้อมรับคำตอบ', 'status-ready');
        if (event.error === 'not-allowed') {
            showToast('ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์', 'error');
        } else if (event.error === 'no-speech') {
            showToast('ไม่ได้ยินเสียง กรุณาลองอีกครั้ง', 'warning');
        } else if (event.error !== 'aborted') {
            showToast('เกิดข้อผิดพลาดในการรับเสียง: ' + event.error, 'error');
        }
    };

    return true;
}

function toggleMic() {
    if (state.isAISpeaking || state.isSending || state.interviewEnded) return;
    if (!state.recognition && !initRecognition()) return;

    if (state.isListening) {
        state.recognition.abort();
        return;
    }

    state.finalTranscript = '';
    document.getElementById('transcript-final').textContent = '';
    document.getElementById('transcript-interim').textContent = '';
    document.getElementById('transcript-placeholder').style.display = 'none';
    document.getElementById('transcript-actions').style.display = 'none';

    try {
        state.recognition.start();
        state.isListening = true;
        document.getElementById('btn-mic').classList.add('recording');
        document.getElementById('mic-label').textContent = 'กำลังฟัง...';
        document.getElementById('transcript-area').classList.add('active-listening');
        setAIStatus('กำลังฟัง', 'status-listening');
    } catch (e) {
        showToast('ไม่สามารถเริ่มรับเสียงได้ กรุณาลองอีกครั้ง', 'error');
    }
}

function retrySpeech() {
    state.finalTranscript = '';
    document.getElementById('transcript-final').textContent = '';
    document.getElementById('transcript-interim').textContent = '';
    document.getElementById('transcript-actions').style.display = 'none';
    document.getElementById('transcript-placeholder').style.display = '';
    document.getElementById('transcript-placeholder').textContent = 'กดปุ่มไมโครโฟนเพื่อเริ่มตอบ...';
    toggleMic();
}

/* ========================================
   MODE SWITCH
   ======================================== */
function switchMode(mode) {
    state.currentMode = mode;
    document.getElementById('voice-mode').style.display = mode === 'voice' ? '' : 'none';
    document.getElementById('type-mode').style.display = mode === 'type' ? '' : 'none';
    document.getElementById('btn-voice-mode').classList.toggle('active', mode === 'voice');
    document.getElementById('btn-type-mode').classList.toggle('active', mode === 'type');
    refreshIcons();
}

/* ========================================
   SEND ANSWER
   ======================================== */
async function sendAnswer() {
    var answer = state.finalTranscript.trim();
    if (!answer) {
        showToast('กรุณาตอบก่อนส่ง', 'warning');
        return;
    }
    if (state.isSending || state.interviewEnded) return;
    await processAnswer(answer);
}

async function sendTypedAnswer() {
    var answer = document.getElementById('type-textarea').value.trim();
    if (!answer) {
        showToast('กรุณาพิมพ์คำตอบก่อนส่ง', 'warning');
        return;
    }
    if (state.isSending || state.interviewEnded) return;
    await processAnswer(answer);
}

async function processAnswer(answer) {
    state.isSending = true;
    document.getElementById('btn-mic').disabled = true;
    document.getElementById('btn-send-answer').disabled = true;
    setAIStatus('กำลังวิเคราะห์...', '');

    state.conversation.push({
        question: state.currentQuestion,
        answer: answer,
        feedback: ''
    });
    addChatMessage(state.currentQuestion, answer, '');

    state.finalTranscript = '';
    document.getElementById('transcript-final').textContent = '';
    document.getElementById('transcript-interim').textContent = '';
    document.getElementById('transcript-actions').style.display = 'none';
    document.getElementById('transcript-placeholder').style.display = '';
    document.getElementById('transcript-placeholder').textContent = 'กดปุ่มไมโครโฟนเพื่อเริ่มตอบ...';
    document.getElementById('type-textarea').value = '';

    var questionNumInfo = 'นี่คือคำตอบข้อที่ ' + state.currentQuestionIndex + ' จาก ' + state.totalQuestions + ' คำถาม';

    try {
        var result = await callGeminiAPI(questionNumInfo + '\n\nคำตอบของผู้สมัคร: ' + answer);

        if (result.status === 'completed') {
            handleInterviewComplete(result, answer);
        } else if (result.status === 'continue') {
            handleNextQuestion(result, answer);
        } else {
            if (result.nextQuestion) {
                handleNextQuestion(result, answer);
            } else {
                handleInterviewComplete(result, answer);
            }
        }
    } catch (err) {
        handleAPIError(err);
    } finally {
        state.isSending = false;
        document.getElementById('btn-send-answer').disabled = false;
    }
}

function handleNextQuestion(result, answer) {
    if (result.feedback) {
        state.conversation[state.conversation.length - 1].feedback = result.feedback;
        updateLastChatFeedback(result.feedback);
    }
    if (result.currentEvaluation) {
        state.allEvaluations.push(result.currentEvaluation);
    }

    state.currentQuestionIndex++;
    updateProgress();

    state.currentQuestion = result.nextQuestion || 'คำถามถัดไป';
    setQuestionText(state.currentQuestion);
    speakText(state.currentQuestion);
}

function handleInterviewComplete(result, answer) {
    if (result.feedback) {
        state.conversation[state.conversation.length - 1].feedback = result.feedback;
        updateLastChatFeedback(result.feedback);
    }
    state.interviewEnded = true;
    stopTimer();
    speechSynthesis.cancel();

    var scores = result.scores || { overall: 0, technical: 0, communication: 0, problemSolving: 0, confidence: 0 };
    state.resultData = {
        candidate: state.candidate,
        settings: state.settings,
        scores: scores,
        strengths: result.strengths || [],
        improvements: result.improvements || [],
        summary: result.summary || '',
        recommendedAnswer: result.recommendedAnswer || '',
        recommendation: result.recommendation || '',
        conversation: state.conversation,
        date: new Date().toISOString(),
        duration: formatTime(state.elapsedSeconds),
        totalQuestions: state.currentQuestionIndex
    };

    setAIStatus('สัมภาษณ์เสร็จสิ้น', 'status-ready');
    showToast('สัมภาษณ์เสร็จสิ้น กำลังแสดงผล...', 'success');
    saveToHistory(state.resultData);

    setTimeout(function () {
        showResultPage(state.resultData);
    }, 1500);
}

/* ========================================
   INTERVIEW FLOW
   ======================================== */
async function startInterview() {
    startTimer();
    setAIStatus('กำลังเตรียมคำถาม', '');
    initRecognition();

    try {
        var result = await callGeminiAPI('เริ่มสัมภาษณ์ได้เลยครับ โปรดถามคำถามข้อแรก');

        if (result.status === 'completed') {
            handleInterviewComplete(result, '');
            return;
        }

        state.currentQuestion = result.nextQuestion || 'คำถามแรก';
        state.currentQuestionIndex = 1;
        updateProgress();
        setQuestionText(state.currentQuestion);
        speakText(state.currentQuestion);
    } catch (err) {
        handleAPIError(err);
    }
}

function setQuestionText(text) {
    var el = document.getElementById('question-text');
    el.textContent = text;
}

/* ========================================
   CHAT HISTORY
   ======================================== */
function addChatMessage(question, answer, feedback) {
    document.getElementById('chat-empty').style.display = 'none';
    var container = document.getElementById('chat-messages');
    var div = document.createElement('div');
    div.className = 'chat-msg';
    var qDiv = document.createElement('div');
    qDiv.className = 'chat-msg-q';
    qDiv.textContent = 'Q: ' + question;
    var aDiv = document.createElement('div');
    aDiv.className = 'chat-msg-a';
    aDiv.textContent = 'A: ' + answer;
    div.appendChild(qDiv);
    div.appendChild(aDiv);
    if (feedback) {
        var fDiv = document.createElement('div');
        fDiv.className = 'chat-msg-fb';
        fDiv.textContent = 'Feedback: ' + feedback;
        div.appendChild(fDiv);
    }
    container.appendChild(div);
    var body = document.getElementById('chat-history-body');
    body.scrollTop = body.scrollHeight;
}

function updateLastChatFeedback(feedback) {
    var msgs = document.querySelectorAll('.chat-msg');
    if (msgs.length > 0) {
        var last = msgs[msgs.length - 1];
        var existing = last.querySelector('.chat-msg-fb');
        if (existing) {
            existing.textContent = 'Feedback: ' + feedback;
        } else {
            var fDiv = document.createElement('div');
            fDiv.className = 'chat-msg-fb';
            fDiv.textContent = 'Feedback: ' + feedback;
            last.appendChild(fDiv);
        }
    }
}

function toggleChatHistory() {
    var body = document.getElementById('chat-history-body');
    var chevron = document.getElementById('chat-chevron');
    body.classList.toggle('open');
    chevron.classList.toggle('open');
}

/* ========================================
   END / RESTART INTERVIEW
   ======================================== */
function confirmEndInterview() {
    document.getElementById('confirm-title').textContent = 'ยืนยันการจบการสัมภาษณ์';
    document.getElementById('confirm-message').textContent = 'คุณต้องการจบการสัมภาษณ์หรือไม่? ผลที่ได้อาจไม่ครบถ้วน';
    document.getElementById('confirm-ok-btn').onclick = function () { closeModal('confirm-modal'); endInterview(); };
    openModal('confirm-modal');
}

function endInterview() {
    if (state.interviewEnded) return;
    state.interviewEnded = true;
    stopTimer();
    speechSynthesis.cancel();
    if (state.recognition && state.isListening) {
        try { state.recognition.abort(); } catch (e) { /* ignore */ }
    }
    if (state.abortController) {
        try { state.abortController.abort(); } catch (e) { /* ignore */ }
    }

    var scores = { overall: 0, technical: 0, communication: 0, problemSolving: 0, confidence: 0 };
    if (state.allEvaluations.length > 0) {
        var sums = { relevance: 0, technical: 0, communication: 0, problemSolving: 0 };
        state.allEvaluations.forEach(function (ev) {
            sums.relevance += (ev.relevance || 0);
            sums.technical += (ev.technical || 0);
            sums.communication += (ev.communication || 0);
            sums.problemSolving += (ev.problemSolving || 0);
        });
        var n = state.allEvaluations.length;
        scores.technical = Math.round(sums.technical / n);
        scores.communication = Math.round(sums.communication / n);
        scores.problemSolving = Math.round(sums.problemSolving / n);
        scores.confidence = Math.round((sums.relevance + sums.communication) / (2 * n));
        scores.overall = Math.round((scores.technical + scores.communication + scores.problemSolving + scores.confidence) / 4);
    }

    state.resultData = {
        candidate: state.candidate,
        settings: state.settings,
        scores: scores,
        strengths: ['สัมภาษณ์ไม่ครบ - ไม่สามารถประเมินได้ครบถ้วน'],
        improvements: ['ฝึกสัมภาษณ์ให้ครบทุกคำถามเพื่อผลลัพธ์ที่ดีขึ้น'],
        summary: 'สัมภาษณ์ไม่ครบจำนวนคำถามที่กำหนด คะแนนที่แสดงเป็นการประเมินจากคำตอบที่ได้',
        recommendedAnswer: '-',
        recommendation: 'แนะนำให้ฝึกสัมภาษณ์ครบทุกคำถามเพื่อให้ได้ผลการประเมินที่ครบถ้วนและแม่นยำยิ่งขึ้น',
        conversation: state.conversation,
        date: new Date().toISOString(),
        duration: formatTime(state.elapsedSeconds),
        totalQuestions: state.currentQuestionIndex
    };

    saveToHistory(state.resultData);
    showResultPage(state.resultData);
}

function restartInterview() {
    document.getElementById('confirm-title').textContent = 'เริ่มสัมภาษณ์ใหม่';
    document.getElementById('confirm-message').textContent = 'ข้อมูลการสัมภาษณ์ครั้งนี้จะหายไป ต้องการเริ่มใหม่หรือไม่?';
    document.getElementById('confirm-ok-btn').onclick = function () {
        closeModal('confirm-modal');
        stopTimer();
        speechSynthesis.cancel();
        if (state.recognition && state.isListening) {
            try { state.recognition.abort(); } catch (e) { /* ignore */ }
        }
        if (state.abortController) {
            try { state.abortController.abort(); } catch (e) { /* ignore */ }
        }
        state.interviewEnded = false;
        state.isSending = false;
        state.isAISpeaking = false;
        state.isListening = false;
        initInterviewRoom();
        startInterview();
    };
    openModal('confirm-modal');
}

/* ========================================
   RESULT PAGE
   ======================================== */
var radarChartInstance = null;

function showResultPage(data) {
    navigateTo('result');
    var s = data.scores;

    document.getElementById('result-subtitle').textContent = data.candidate.name + ' — ' + data.settings.position;
    document.getElementById('res-name').textContent = data.candidate.name;
    document.getElementById('res-position').textContent = data.settings.position;
    document.getElementById('res-date').textContent = formatDate(data.date);
    document.getElementById('res-duration').textContent = data.duration;
    document.getElementById('res-qcount').textContent = data.totalQuestions + ' คำถาม';

    animateCircularScore(s.overall);

    document.getElementById('num-technical').textContent = s.technical;
    document.getElementById('num-communication').textContent = s.communication;
    document.getElementById('num-problemsolving').textContent = s.problemSolving;
    document.getElementById('num-confidence').textContent = s.confidence;

    setTimeout(function () {
        document.getElementById('fill-technical').style.width = s.technical + '%';
        document.getElementById('fill-communication').style.width = s.communication + '%';
        document.getElementById('fill-problemsolving').style.width = s.problemSolving + '%';
        document.getElementById('fill-confidence').style.width = s.confidence + '%';
    }, 100);

    renderRadarChart(s);

    var strengthsList = document.getElementById('res-strengths');
    strengthsList.innerHTML = '';
    (data.strengths || []).forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item;
        strengthsList.appendChild(li);
    });

    var improvementsList = document.getElementById('res-improvements');
    improvementsList.innerHTML = '';
    (data.improvements || []).forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item;
        improvementsList.appendChild(li);
    });

    document.getElementById('res-recommendation').textContent = data.recommendation || '-';
    document.getElementById('res-recommended-answer').textContent = data.recommendedAnswer || '-';

    var convContainer = document.getElementById('res-conversation');
    convContainer.innerHTML = '';
    (data.conversation || []).forEach(function (item, idx) {
        var div = document.createElement('div');
        div.className = 'result-conversation-item';
        var q = document.createElement('div');
        q.className = 'res-conv-q';
        q.textContent = 'คำถามที่ ' + (idx + 1) + ': ' + item.question;
        var a = document.createElement('div');
        a.className = 'res-conv-a';
        a.textContent = 'คำตอบ: ' + item.answer;
        div.appendChild(q);
        div.appendChild(a);
        if (item.feedback) {
            var f = document.createElement('div');
            f.className = 'res-conv-fb';
            f.textContent = 'Feedback: ' + item.feedback;
            div.appendChild(f);
        }
        convContainer.appendChild(div);
    });

    refreshIcons();
}

function animateCircularScore(score) {
    score = Math.max(0, Math.min(100, score));
    var ring = document.getElementById('score-ring');
    var text = document.getElementById('score-text');
    var offset = CIRCUMFERENCE * (1 - score / 100);
    ring.style.strokeDashoffset = CIRCUMFERENCE;

    setTimeout(function () {
        ring.style.strokeDashoffset = offset;
    }, 100);

    var current = 0;
    var step = Math.ceil(score / 40);
    var interval = setInterval(function () {
        current += step;
        if (current >= score) {
            current = score;
            clearInterval(interval);
        }
        text.textContent = current;
    }, 30);
}

function renderRadarChart(scores) {
    var canvas = document.getElementById('radar-chart');
    if (radarChartInstance) {
        radarChartInstance.destroy();
    }
    radarChartInstance = new Chart(canvas, {
        type: 'radar',
        data: {
            labels: ['Technical', 'Communication', 'Problem Solving', 'Confidence'],
            datasets: [{
                label: 'คะแนน',
                data: [scores.technical, scores.communication, scores.problemSolving, scores.confidence],
                backgroundColor: 'rgba(217, 25, 32, 0.15)',
                borderColor: '#D71920',
                borderWidth: 2,
                pointBackgroundColor: '#D71920',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        font: { size: 10 },
                        color: '#9a9490',
                        backdropColor: 'transparent'
                    },
                    grid: { color: 'rgba(35,31,32,0.08)' },
                    angleLines: { color: 'rgba(35,31,32,0.08)' },
                    pointLabels: {
                        font: { size: 12, family: "'Noto Sans Thai', sans-serif", weight: '600' },
                        color: '#231F20'
                    }
                }
            },
            plugins: {
                legend: { display: false }
            },
            animation: {
                duration: 1200,
                easing: 'easeOutQuart'
            }
        }
    });
}

/* ========================================
   DOWNLOAD
   ======================================== */
function downloadJSON() {
    if (!state.resultData) return;
    var data = JSON.stringify(state.resultData, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'interview-result-' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลด JSON สำเร็จ', 'success');
}

function downloadText() {
    if (!state.resultData) return;
    var d = state.resultData;
    var s = d.scores;
    var lines = [];
    lines.push('========================================');
    lines.push('  รายงานผลการฝึกสัมภาษณ์งาน');
    lines.push('  AI HR Interview Assistant');
    lines.push('========================================');
    lines.push('');
    lines.push('ชื่อผู้สมัคร: ' + d.candidate.name);
    lines.push('ตำแหน่ง: ' + d.settings.position);
    lines.push('ระดับความยาก: ' + d.settings.difficulty);
    lines.push('ประเภทการสัมภาษณ์: ' + d.settings.type);
    lines.push('วันที่: ' + formatDate(d.date));
    lines.push('เวลาที่ใช้: ' + d.duration);
    lines.push('จำนวนคำถาม: ' + d.totalQuestions);
    lines.push('');
    lines.push('--- คะแนนรวม ---');
    lines.push(s.overall + ' / 100');
    lines.push('');
    lines.push('--- คะแนนแบบละเอียด ---');
    lines.push('Technical Skill: ' + s.technical);
    lines.push('Communication Skill: ' + s.communication);
    lines.push('Problem Solving: ' + s.problemSolving);
    lines.push('Confidence: ' + s.confidence);
    lines.push('');
    lines.push('--- จุดแข็ง ---');
    (d.strengths || []).forEach(function (item, i) { lines.push((i + 1) + '. ' + item); });
    lines.push('');
    lines.push('--- จุดที่ควรปรับปรุง ---');
    (d.improvements || []).forEach(function (item, i) { lines.push((i + 1) + '. ' + item); });
    lines.push('');
    lines.push('--- คำแนะนำ ---');
    lines.push(d.recommendation || '-');
    lines.push('');
    lines.push('--- ตัวอย่างแนวทางตอบ ---');
    lines.push(d.recommendedAnswer || '-');
    lines.push('');
    lines.push('--- ประวัติคำถามและคำตอบ ---');
    (d.conversation || []).forEach(function (item, i) {
        lines.push('');
        lines.push('คำถามที่ ' + (i + 1) + ': ' + item.question);
        lines.push('คำตอบ: ' + item.answer);
        if (item.feedback) lines.push('Feedback: ' + item.feedback);
    });
    lines.push('');
    lines.push('========================================');

    var text = lines.join('\n');
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'interview-report-' + Date.now() + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลดรายงานสำเร็จ', 'success');
}

/* ========================================
   LOCAL STORAGE - HISTORY
   ======================================== */
function getHistory() {
    try {
        var data = localStorage.getItem('aihr_interview_history');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveToHistory(result) {
    var history = getHistory();
    var entry = {
        id: Date.now(),
        date: result.date,
        candidateName: result.candidate.name,
        position: result.settings.position,
        difficulty: result.settings.difficulty,
        type: result.settings.type,
        totalQuestions: result.totalQuestions,
        overallScore: result.scores.overall,
        scores: result.scores,
        duration: result.duration,
        summary: result.summary,
        strengths: result.strengths,
        improvements: result.improvements,
        recommendedAnswer: result.recommendedAnswer,
        recommendation: result.recommendation,
        conversation: result.conversation
    };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }
    try {
        localStorage.setItem('aihr_interview_history', JSON.stringify(history));
    } catch (e) { /* storage full */ }
}

function openHistory() {
    renderHistory();
    openModal('history-modal');
}

function renderHistory() {
    var history = getHistory();
    var container = document.getElementById('history-list');
    var clearBtn = document.getElementById('btn-clear-history');
    container.innerHTML = '';

    if (history.length === 0) {
        container.innerHTML = '<div class="history-empty"><i data-lucide="inbox"></i><p>ยังไม่มีประวัติการฝึก</p></div>';
        clearBtn.style.display = 'none';
        refreshIcons();
        return;
    }

    clearBtn.style.display = '';
    history.forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML =
            '<div class="history-info">' +
                '<div class="history-date">' + escapeHTML(formatDate(item.date)) + '</div>' +
                '<div class="history-title">' + escapeHTML(item.candidateName) + ' — ' + escapeHTML(item.position) + '</div>' +
                '<div class="history-detail">' + escapeHTML(item.difficulty) + ' | ' + escapeHTML(item.type) + ' | ' + item.totalQuestions + ' คำถาม | ' + escapeHTML(item.duration) + '</div>' +
            '</div>' +
            '<div class="history-score">' + item.overallScore + '</div>';
        container.appendChild(div);
    });
    refreshIcons();
}

function clearHistory() {
    document.getElementById('confirm-title').textContent = 'ล้างประวัติทั้งหมด';
    document.getElementById('confirm-message').textContent = 'ประวัติการฝึกทั้งหมดจะถูกลบถาวร ต้องการดำเนินการหรือไม่?';
    document.getElementById('confirm-ok-btn').onclick = function () {
        closeModal('confirm-modal');
        try { localStorage.removeItem('aihr_interview_history'); } catch (e) { /* ignore */ }
        renderHistory();
        showToast('ล้างประวัติเรียบร้อย', 'success');
    };
    openModal('confirm-modal');
}

/* ========================================
   EVENT LISTENERS
   ======================================== */
document.getElementById('nav-toggle').addEventListener('click', function () {
    document.getElementById('nav-menu').classList.toggle('open');
});

document.addEventListener('click', function (e) {
    var navMenu = document.getElementById('nav-menu');
    var navToggle = document.getElementById('nav-toggle');
    if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
        navMenu.classList.remove('open');
    }
});

document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            overlay.classList.add('hidden');
        }
    });
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(function (m) {
            m.classList.add('hidden');
        });
    }
});

var chatHistoryHeader = document.querySelector('.chat-history-header');
if (chatHistoryHeader) {
    chatHistoryHeader.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleChatHistory();
        }
    });
}

/* ========================================
   INITIALIZATION
   ======================================== */
(async function init() {
    refreshIcons();
    await loadConfig();
    if (!checkAPIKey()) {
        /* แสดง modal เตือนเมื่อโหลดครั้งแรก */
    }
})();