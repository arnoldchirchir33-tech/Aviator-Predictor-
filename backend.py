from flask import Flask, request, jsonify, send_from_directory, session
import random
import secrets
import time
import json
import os
from collections import deque
from functools import wraps

app = Flask(__name__, static_folder="frontend")
app.secret_key = "super-secret-key-change-this-in-production"

# ====================== CONFIG ======================
WHATSAPP_GROUP = "https://chat.whatsapp.com/HMX0WBi2bEVAeVA4iwsXeX?s=cl&p=a&mlu=4&ilr=4"
SESSION_DURATION = 60 * 60          # 1 hour
ADMIN_USERNAME = "arnold6001"
ADMIN_PASSWORD = "kenya@254"
USERS_FILE = "users.json"
# ====================================================

history = deque(maxlen=40)
users = {}
active_sessions = {}

def load_users():
    global users
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, "r") as f:
            users = json.load(f)
    else:
        users = {}

def save_users():
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

load_users()

def generate_code():
    return str(random.randint(100000, 999999))

def create_session(phone):
    token = secrets.token_urlsafe(24)
    active_sessions[token] = {
        "phone": phone,
        "expires": time.time() + SESSION_DURATION
    }
    return token

def is_session_valid(token):
    if not token or token not in active_sessions:
        return False
    if time.time() > active_sessions[token]["expires"]:
        del active_sessions[token]
        return False
    return True

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("admin"):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated

# ---------- Serve Frontend ----------
@app.route("/")
def index():
    return send_from_directory("frontend", "index.html")

@app.route("/admin")
def admin_page():
    return send_from_directory("frontend", "admin.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("frontend", path)

# ==================== USER AUTH ====================

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json or {}
    phone = data.get("phone", "").strip()
    password = data.get("password", "").strip()

    if not phone or not password:
        return jsonify({"error": "Phone and password required"}), 400
    if len(password) < 4:
        return jsonify({"error": "Password too short"}), 400
    if phone in users:
        return jsonify({"error": "Phone already registered"}), 400

    users[phone] = {
        "password": password,
        "verified": False,
        "access_until": 0,
        "code": None,
        "reset_code": None
    }
    save_users()

    return jsonify({
        "success": True,
        "message": "Registered successfully. Now request verification code on WhatsApp.",
        "whatsapp": WHATSAPP_GROUP
    })

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    phone = data.get("phone", "").strip()
    password = data.get("password", "").strip()

    user = users.get(phone)
    if not user or user["password"] != password:
        return jsonify({"error": "Invalid phone or password"}), 401

    if user.get("access_until", 0) > time.time():
        token = create_session(phone)
        remaining = int(user["access_until"] - time.time())
        return jsonify({
            "success": True,
            "token": token,
            "remaining": remaining,
            "need_verification": False
        })

    return jsonify({
        "success": True,
        "need_verification": True,
        "whatsapp": WHATSAPP_GROUP
    })

@app.route("/api/verify", methods=["POST"])
def verify():
    data = request.json or {}
    phone = data.get("phone", "").strip()
    code = data.get("code", "").strip()

    user = users.get(phone)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.get("code") != code:
        return jsonify({"error": "Wrong verification code"}), 400

    user["verified"] = True
    user["access_until"] = time.time() + SESSION_DURATION
    user["code"] = None
    save_users()

    token = create_session(phone)
    return jsonify({
        "success": True,
        "token": token,
        "remaining": SESSION_DURATION
    })

@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    data = request.json or {}
    phone = data.get("phone", "").strip()

    if phone not in users:
        return jsonify({"error": "Phone number not registered"}), 404

    code = generate_code()
    users[phone]["reset_code"] = code
    users[phone]["reset_code_time"] = time.time()
    save_users()

    return jsonify({
        "success": True,
        "message": "Reset code generated. Please request it from the admin via WhatsApp."
    })

@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.json or {}
    phone = data.get("phone", "").strip()
    code = data.get("code", "").strip()
    new_password = data.get("new_password", "").strip()

    user = users.get(phone)
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.get("reset_code") != code:
        return jsonify({"error": "Invalid reset code"}), 400

    if time.time() - user.get("reset_code_time", 0) > 15 * 60:
        return jsonify({"error": "Reset code has expired"}), 400

    if len(new_password) < 4:
        return jsonify({"error": "Password too short"}), 400

    user["password"] = new_password
    user["reset_code"] = None
    user["reset_code_time"] = None
    save_users()

    return jsonify({
        "success": True,
        "message": "Password changed successfully. You can now login."
    })

@app.route("/api/check-session")
def check_session():
    token = request.args.get("token")
    if not is_session_valid(token):
        return jsonify({"valid": False}), 403

    remaining = int(active_sessions[token]["expires"] - time.time())
    return jsonify({"valid": True, "remaining": remaining})

# ==================== GAME ====================

@app.route("/api/history")
def api_history():
    token = request.args.get("token")
    if not is_session_valid(token):
        return jsonify({"error": "session expired"}), 403
    return jsonify({"history": list(history)})

@app.route("/api/predict")
def api_predict():
    token = request.args.get("token")
    if not is_session_valid(token):
        return jsonify({"error": "session expired"}), 403

    if random.random() < 0.03:
        crash = 1.00
    else:
        crash = max(1.01, min(0.97 / random.random(), 200.0))

    history.appendleft(round(crash, 2))
    return jsonify({
        "crash_point": round(crash, 2),
        "history": list(history)
    })

# ==================== ADMIN PANEL ====================

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.json or {}
    if data.get("username") == ADMIN_USERNAME and data.get("password") == ADMIN_PASSWORD:
        session["admin"] = True
        return jsonify({"success": True})
    return jsonify({"error": "Wrong credentials"}), 401

@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin", None)
    return jsonify({"success": True})

@app.route("/api/admin/users")
@admin_required
def admin_users():
    result = []
    for phone, u in users.items():
        result.append({
            "phone": phone,
            "verified": u.get("verified", False),
            "access_until": u.get("access_until", 0),
            "code": u.get("code"),
            "reset_code": u.get("reset_code")
        })
    return jsonify({"users": result})

@app.route("/api/admin/generate-code", methods=["POST"])
@admin_required
def admin_generate_code():
    data = request.json or {}
    phone = data.get("phone", "").strip()

    if phone not in users:
        return jsonify({"error": "Phone not registered"}), 404

    code = generate_code()
    users[phone]["code"] = code
    save_users()

    return jsonify({
        "success": True,
        "phone": phone,
        "code": code
    })

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  Aviator Predictor with Auth + Admin is running")
    print("="*60)
    print("User App     → http://127.0.0.1:5000")
    print("Admin Panel  → http://127.0.0.1:5000/admin")
    print("Admin Login  → username: arnold6001")
    print("             → password: kenya@254")
    print("="*60 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
