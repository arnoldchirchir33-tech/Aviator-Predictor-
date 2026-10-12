let token = localStorage.getItem("aviator_token") || null;
let currentPhone = localStorage.getItem("aviator_phone") || null;
let remaining = 0;
let isFlying = false;
let canvas, ctx;

// ==================== AUTH UI ====================
function hideAllAuth() {
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("registerForm").style.display = "none";
    document.getElementById("verifyForm").style.display = "none";
    document.getElementById("forgotForm").style.display = "none";
    document.getElementById("resetForm").style.display = "none";
}

function showLogin() {
    hideAllAuth();
    document.getElementById("loginForm").style.display = "block";
}

function showRegister() {
    hideAllAuth();
    document.getElementById("registerForm").style.display = "block";
}

function showVerify() {
    hideAllAuth();
    document.getElementById("verifyForm").style.display = "block";
}

function showForgot() {
    hideAllAuth();
    document.getElementById("forgotForm").style.display = "block";
}

function showReset() {
    hideAllAuth();
    document.getElementById("resetForm").style.display = "block";
}

// ==================== AUTH ACTIONS ====================
async function doRegister() {
    const phone = document.getElementById("regPhone").value.trim();
    const password = document.getElementById("regPassword").value.trim();
    if (!phone || !password) return alert("Fill all fields");

    const res = await fetch("/api/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({phone, password})
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Registration failed");

    currentPhone = phone;
    localStorage.setItem("aviator_phone", phone);
    alert(data.message);
    showVerify();
}

async function doLogin() {
    const phone = document.getElementById("loginPhone").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    if (!phone || !password) return alert("Fill all fields");

    const res = await fetch("/api/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({phone, password})
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Login failed");

    currentPhone = phone;
    localStorage.setItem("aviator_phone", phone);

    if (data.need_verification) {
        showVerify();
    } else {
        token = data.token;
        localStorage.setItem("aviator_token", token);
        remaining = data.remaining;
        startGame();
    }
}

async function doVerify() {
    const code = document.getElementById("verifyCode").value.trim();
    if (!code || !currentPhone) return alert("Enter the code");

    const res = await fetch("/api/verify", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({phone: currentPhone, code})
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Wrong code");

    token = data.token;
    localStorage.setItem("aviator_token", token);
    remaining = data.remaining;
    startGame();
}

// ==================== FORGOT PASSWORD ====================
async function requestResetCode() {
    const phone = document.getElementById("forgotPhone").value.trim();
    if (!phone) return alert("Enter your phone number");

    const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({phone})
    });
    const data = await res.json();

    if (!res.ok) return alert(data.error || "Failed");

    currentPhone = phone;
    localStorage.setItem("aviator_phone", phone);
    alert("Reset code generated!\n\nPlease request the code from the admin on WhatsApp.");
    showReset();
}

async function doResetPassword() {
    const code = document.getElementById("resetCode").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();

    if (!code || !newPassword) return alert("Fill all fields");
    if (!currentPhone) return alert("Phone number missing. Start again.");

    const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            phone: currentPhone,
            code: code,
            new_password: newPassword
        })
    });
    const data = await res.json();

    if (!res.ok) return alert(data.error || "Failed to reset password");

    alert("Password changed successfully! You can now login.");
    showLogin();
}

// ==================== GAME ====================
function startGame() {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    startCountdown();
    loadHistory();
    createClouds();
    initCanvas();
}

function startCountdown() {
    const el = document.getElementById("timer");
    const tick = () => {
        if (remaining <= 0) {
            el.innerHTML = '<span style="color:#f87171">EXPIRED</span>';
            document.getElementById("playBtn").disabled = true;
            localStorage.removeItem("aviator_token");
            setTimeout(() => location.reload(), 2000);
            return;
        }
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        el.textContent = String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
        remaining--;
        setTimeout(tick, 1000);
    };
    tick();
}

function createClouds() {
    const sky = document.getElementById("sky");
    for (let i = 0; i < 9; i++) {
        const c = document.createElement("div");
        c.className = "cloud";
        c.style.width = (50 + Math.random() * 90) + "px";
        c.style.height = (18 + Math.random() * 22) + "px";
        c.style.left = Math.random() * 100 + "%";
        c.style.top = Math.random() * 55 + "%";
        c.style.opacity = 0.15 + Math.random() * 0.25;
        sky.appendChild(c);
    }
}

function renderHistory(list) {
    const strip = document.getElementById("historyStrip");
    strip.innerHTML = "";
    list.forEach(v => {
        const pill = document.createElement("div");
        pill.className = "hist-pill";
        if (v < 2) pill.classList.add("low");
        else if (v < 10) pill.classList.add("mid");
        else pill.classList.add("high");
        pill.textContent = v.toFixed(2) + "x";
        strip.appendChild(pill);
    });
}

async function loadHistory() {
    const res = await fetch("/api/history?token=" + token);
    if (res.ok) {
        const data = await res.json();
        renderHistory(data.history);
    }
}

function initCanvas() {
    canvas = document.getElementById("graphCanvas");
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
    const area = document.getElementById("gameArea");
    canvas.width = area.clientWidth;
    canvas.height = area.clientHeight;
}

function drawGraph(progress) {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const startX = 40;
    const startY = canvas.height - 60;
    const maxX = canvas.width * 0.75;
    const maxY = 80;

    ctx.beginPath();
    ctx.moveTo(startX, startY);

    const points = 40;
    for (let i = 0; i <= points * progress; i++) {
        const t = i / points;
        const x = startX + t * (maxX - startX);
        const y = startY - Math.pow(t, 1.35) * (startY - maxY);
        ctx.lineTo(x, y);
    }

    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.stroke();
}

async function startRound() {
    if (isFlying) return;
    isFlying = true;
    document.getElementById("playBtn").disabled = true;
    document.getElementById("status").textContent = "Flying...";
    document.getElementById("status").classList.remove("crash");
    document.getElementById("multiplier").style.color = "#22c55e";

    const res = await fetch("/api/predict?token=" + token);
    if (!res.ok) {
        alert("Session expired. Please login again.");
        location.reload();
        return;
    }
    const data = await res.json();
    const crashPoint = data.crash_point;
    renderHistory(data.history);

    const plane = document.getElementById("plane");
    const multEl = document.getElementById("multiplier");
    let current = 1.00;
    const start = performance.now();
    const duration = 7500 + Math.random() * 7000;

    plane.style.transition = "none";
    plane.style.left = "30px";
    plane.style.bottom = "50px";
    plane.style.transform = "rotate(0deg) scale(1)";
    plane.style.opacity = "1";

    function animate(now) {
        const progress = Math.min((now - start) / duration, 1);
        current = 1 + (crashPoint - 1) * Math.pow(progress, 1.35);
        if (current > crashPoint) current = crashPoint;

        multEl.textContent = current.toFixed(2) + "x";
        drawGraph(progress);

        const maxLeft = window.innerWidth > 500 ? 62 : 52;
        plane.style.left = (30 + progress * maxLeft) + "%";
        plane.style.bottom = (50 + progress * 75) + "px";
        plane.style.transform = "rotate(" + (-progress * 14) + "deg)";

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            multEl.textContent = crashPoint.toFixed(2) + "x";
            multEl.style.color = "#ef4444";
            document.getElementById("status").textContent = "FLEW AWAY @ " + crashPoint.toFixed(2) + "x";
            document.getElementById("status").classList.add("crash");

            plane.style.transition = "all 1.1s ease-in";
            plane.style.left = "130%";
            plane.style.bottom = "95%";
            plane.style.transform = "rotate(-28deg) scale(0.55)";
            plane.style.opacity = "0";

            setTimeout(() => {
                isFlying = false;
                document.getElementById("playBtn").disabled = false;
                document.getElementById("status").textContent = "Waiting for next round...";
                document.getElementById("status").classList.remove("crash");
                plane.style.transition = "none";
                plane.style.opacity = "1";
                plane.style.left = "30px";
                plane.style.bottom = "50px";
                plane.style.transform = "rotate(0deg)";
                multEl.style.color = "#22c55e";
                multEl.textContent = "1.00x";
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            }, 1600);
        }
    }
    requestAnimationFrame(animate);
}

// Auto login check
async function checkExistingSession() {
    if (!token) return;
    const res = await fetch("/api/check-session?token=" + token);
    if (res.ok) {
        const data = await res.json();
        remaining = data.remaining;
        startGame();
    } else {
        localStorage.removeItem("aviator_token");
        token = null;
    }
}

checkExistingSession();
