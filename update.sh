#!/bin/bash

# --- CONFIGURATION ---
APP_DIR="/opt/pingmon"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== PingMon System Update ===${NC}"

cd $APP_DIR

# 1. Check if it's a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}[!] Folder ini bukan repository Git.${NC}"
    echo -e "${BLUE}[*] Menginisialisasi Git dan menghubungkan ke source...${NC}"
    # Note: Replace with actual repo URL if available, 
    # but since this is custom code, we assume the user has a repo.
    # If not, we advise manual copy.
    exit 1
fi

# 2. Pull latest code
echo -e "${GREEN}[1/3] Pulling latest code from Git...${NC}"
git pull

# 3. Install dependencies
echo -e "${GREEN}[2/3] Updating dependencies (npm install)...${NC}"
npm install

# 4. Restart Application
echo -e "${GREEN}[3/3] Restarting PingMon via PM2...${NC}"
pm2 restart pingmon

echo -e "${BLUE}=== Update Selesai! ===${NC}"
echo -e "Sekarang Anda sudah memiliki tombol 'Update' di menu Settings."
