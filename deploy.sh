#!/bin/bash
# deploy.sh — pull latest from GitHub, build, and restart Homebridge
set -e

PLUGIN_SRC="/home/familypi/persistent/homebridge-ha-sync"
PLUGIN_DST="/home/familypi/persistent/homebridge/volumes/homebridge/node_modules/@juanmonaco/homebridge-ha-sync"
HB_HOST="familypi@172.21.73.60"

echo "Pulling latest from GitHub..."
ssh "$HB_HOST" "cd $PLUGIN_SRC && git pull"

echo "Building and deploying..."
ssh "$HB_HOST" "sudo docker run --rm \
  -v $PLUGIN_SRC:/plugin \
  -v $PLUGIN_DST:/dest \
  node:24-alpine sh -c '
    cd /plugin && npm ci --omit=dev 2>&1 | tail -1 && npm run build 2>&1 | tail -1 &&
    cp -r dist/* /dest/dist/ &&
    cp package.json config.schema.json /dest/ &&
    echo Build complete
  '"

echo "Restarting Homebridge..."
ssh "$HB_HOST" "sudo docker restart homebridge"

echo "Done. Tailing logs..."
sleep 10
ssh "$HB_HOST" "sudo docker logs homebridge --tail 20 | grep -E '\[ha-sync\]|HomebridgeHaSync'"
