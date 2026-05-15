#!/bin/bash

# --- CONFIGURATION ---
APP_DIR="/opt/pingmon"
NODE_VERSION="20" # Node.js version

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== PingMon Installation Script for Linux/Proxmox ===${NC}"

# 1. Update System
echo -e "${GREEN}[1/6] Updating system packages...${NC}"
apt-get update && apt-get upgrade -y

# 2. Install Dependencies
echo -e "${GREEN}[2/6] Installing essential dependencies...${NC}"
apt-get install -y curl build-essential git wget iputils-ping

# 3. Install Node.js
echo -e "${GREEN}[3/6] Installing Node.js v${NODE_VERSION}...${NC}"
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# 4. Setup Application Directory
echo -e "${GREEN}[4/6] Setting up application directory at ${APP_DIR}...${NC}"
mkdir -p $APP_DIR
# Assuming files are transferred to this directory. 
# If cloning from git, uncomment below:
# git clone <your-repo-url> $APP_DIR

# 5. Install PM2 (Process Manager)
echo -e "${GREEN}[5/6] Installing PM2...${NC}"
npm install -g pm2

# 6. Install App Dependencies
echo -e "${GREEN}[6/6] Installing application dependencies...${NC}"
cd $APP_DIR
# Note: Since we use sql.js, we don't need build tools for better-sqlite3
npm install

# Setup Autostart
echo -e "${BLUE}=== Finalizing Setup ===${NC}"
pm2 start server.js --name "pingmon"
pm2 save
pm2 startup | tail -n 1 | bash

echo -e "${GREEN}PingMon has been installed and started!${NC}"
echo -e "Access it at: http://<PROXMOX_IP>:3000"
