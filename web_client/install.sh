#!/bin/bash

# --- 开始：安全和路径设置 ---
# 立即退出，如果任何命令失败
set -e

# 获取脚本所在的目录 (即工程根目录)
# 这使得脚本无论从哪里被调用，都能正确找到文件
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
# --- 结束：安全和路径设置 ---


# --- 定义文件路径 ---
# 源文件
APP_SCRIPT="$SCRIPT_DIR/server_applet.py"
TEMPLATE_FILE="$SCRIPT_DIR/vis-server.desktop.template"
# 假设你的 .desktop 文件引用的图标是 vis_icon.png
# (如果不是，请修改这里)
ICON_FILE="$SCRIPT_DIR/icon/vis_icon.png" 

# 目标文件
TARGET_DIR="$HOME/.local/share/applications"
TARGET_DESKTOP_FILE="$TARGET_DIR/vis-server.desktop"
# --- 结束：定义文件路径 ---


echo "正在安装 'vis-web-server'..."

# 1. 确保 Python 脚本有执行权限 (虽然我们用 python3 运行，但这是个好习惯)
echo "设置脚本权限..."
chmod +x "$APP_SCRIPT"

# 2. 确保目标目录存在
echo "创建目标目录 (如果需要)..."
mkdir -p "$TARGET_DIR"

# 3. 替换占位符并生成 .desktop 文件
echo "生成 .desktop 文件到 $TARGET_DESKTOP_FILE..."
# 我们使用 | 作为 sed 的分隔符，因为路径中包含 /
sed -e "s|__EXEC_PATH__|$APP_SCRIPT|" \
    -e "s|__ICON_PATH__|$ICON_FILE|" \
    "$TEMPLATE_FILE" > "$TARGET_DESKTOP_FILE"

# 4. 为 .desktop 文件设置执行权限
echo "设置 .desktop 文件权限..."
chmod +x "$TARGET_DESKTOP_FILE"

# 5. 标记 .desktop 文件为“可信任” (解决“用文本编辑器打开”的问题)
echo "标记为可信任..."
gio set "$TARGET_DESKTOP_FILE" "metadata::trusted" true

# 6. 刷新系统的应用程序数据库
echo "刷新应用程序数据库..."
update-desktop-database "$TARGET_DIR"

echo ""
echo "✅ 安装完成!"
echo "你现在可以从'活动'搜索栏中搜索 'vis-web-server' 来启动它。"