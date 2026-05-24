#!/bin/bash
# ============================================
# Shivangi Auto Clinic — Oracle Cloud Setup
# Run this on Oracle Ubuntu VM as: bash oracle-setup.sh
# ============================================

set -e
echo ""
echo "===== Shivangi WhatsApp Bot — Oracle Setup ====="
echo ""

# Step 1: System update
echo "[1/7] System update kar raha hai..."
sudo apt-get update -y && sudo apt-get upgrade -y

# Step 2: Node.js 20 install
echo "[2/7] Node.js 20 install kar raha hai..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Step 3: PM2 install
echo "[3/7] PM2 install kar raha hai..."
sudo npm install -g pm2

# Step 4: Git clone
echo "[4/7] GitHub se code clone kar raha hai..."
cd ~
if [ -d "shivangi-saas-bot" ]; then
  echo "Folder already exists, pulling latest..."
  cd shivangi-saas-bot
  git pull
else
  git clone https://github.com/sandipdubey773-glitch/shivangi-saas-bot.git
  cd shivangi-saas-bot
fi

# Step 5: Environment file banana
echo "[5/7] .env file bana raha hai..."
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
cat > backend/.env << EOF
ADMIN_TOKEN=ShivangiSaaS@2026
PORT=3000
BASE_URL=http://${PUBLIC_IP}:3000
RENDER_EXTERNAL_URL=http://${PUBLIC_IP}:3000
EOF
echo ".env ready. Server IP: ${PUBLIC_IP}"

# Step 6: Dependencies install + frontend build
echo "[6/7] Dependencies install aur frontend build kar raha hai..."
cd ~/shivangi-saas-bot/frontend
npm install
npm run build
cp -r dist/. ../backend/public/
echo "Frontend build complete."

cd ~/shivangi-saas-bot/backend
npm install

# Step 7: PM2 se start karo
echo "[7/7] PM2 se bot start kar raha hai..."
pm2 delete shivangi-bot 2>/dev/null || true
pm2 start index.js --name shivangi-bot
pm2 save
pm2 startup systemd -u $USER --hp $HOME | tail -1 | sudo bash || true

echo ""
echo "============================================"
echo "  SETUP COMPLETE!"
echo "  Bot chal raha hai: http://${PUBLIC_IP}:3000"
echo "  Admin panel: http://${PUBLIC_IP}:3000/app"
echo "  QR scan: http://${PUBLIC_IP}:3000/qr"
echo "  Status: pm2 status"
echo "  Logs: pm2 logs shivangi-bot"
echo "============================================"
echo ""
echo "IMPORTANT: Oracle firewall mein port 3000 open karo!"
echo "Oracle Console → Networking → VCN → Security Lists → Add Ingress Rule"
echo "Source: 0.0.0.0/0 | Port: 3000 | Protocol: TCP"
echo ""
