#!/bin/bash

set -e

TARGET_DIR="$HOME/.local/share/applications"
TARGET_DESKTOP_FILE="$TARGET_DIR/vis-server.desktop"

echo "正在卸载 'vis-web-server'..."

# 1. 删除 .desktop 文件
if [ -f "$TARGET_DESKTOP_FILE" ]; then
    echo "删除 $TARGET_DESKTOP_FILE..."
    rm "$TARGET_DESKTOP_FILE"
else
    echo "文件已删除，跳过。"
fi

# 2. 刷新系统的应用程序数据库
echo "刷新应用程序数据库..."
update-desktop-database "$TARGET_DIR"

echo ""
echo "✅ 卸载完成!"