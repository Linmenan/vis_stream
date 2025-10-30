#!/usr/bin/env python3

# --- 配置 ---
SERVER_PATH = "/home/yanyu/yy_ws/vis_stream/web_client"
ICON_PATH_DISCONNECT = "/home/yanyu/yy_ws/vis_stream/web_client/icon/server_disconnect_icon.png"
ICON_PATH_CONNECT = "/home/yanyu/yy_ws/vis_stream/web_client/icon/server_connect_icon.png"
# --- 结束配置 ---

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('AppIndicator3', '0.1')
from gi.repository import Gtk, AppIndicator3, GLib
import subprocess
import os
import webbrowser

# --- 新增：防止多实例运行 ---
import fcntl  # 用于文件锁
import sys    # 用于退出进程
# --- 结束新增 ---

APPINDICATOR_ID = 'my-vis-server-applet'

# (ServerIndicator 类保持不变，这里省略以保持简洁)
# (你可以直接复制下面的代码，类定义已经在里面了)
class ServerIndicator:
    def __init__(self):
        self.indicator = AppIndicator3.Indicator.new(
            APPINDICATOR_ID,
            ICON_PATH_DISCONNECT,
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS)
        
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.menu = self.build_menu()
        self.indicator.set_menu(self.menu)
        
        self.server_process = None
        self.update_menu_state()

    def build_menu(self):
        menu = Gtk.Menu()
        
        self.item_start = Gtk.MenuItem(label='启动服务 (8000端口)')
        self.item_start.connect('activate', self.start_server)
        menu.append(self.item_start)

        self.item_stop = Gtk.MenuItem(label='关闭服务')
        self.item_stop.connect('activate', self.stop_server)
        menu.append(self.item_stop)

        self.item_open_browser = Gtk.MenuItem(label='访问服务 (http://127.0.0.1:8000)')
        self.item_open_browser.connect('activate', self.open_browser)
        menu.append(self.item_open_browser)

        menu.append(Gtk.SeparatorMenuItem())

        item_quit = Gtk.MenuItem(label='退出应用')
        item_quit.connect('activate', self.quit)
        menu.append(item_quit)

        menu.show_all()
        return menu

    def open_browser(self, _):
        print("正在打开浏览器访问 http://127.0.0.1:8000/")
        webbrowser.open('http://127.0.0.1:8000/')

    def start_server(self, _):
        if self.server_process is None:
            print(f"在 {SERVER_PATH} 启动服务...")
            try:
                self.server_process = subprocess.Popen(
                    ['python3', '-m', 'http.server', '8000'],
                    cwd=SERVER_PATH,
                    stdout=subprocess.DEVNULL, 
                    stderr=subprocess.DEVNULL
                )
                self.indicator.set_icon_full(ICON_PATH_CONNECT, '服务运行中')
            except Exception as e:
                print(f"启动失败: {e}")
        
        self.update_menu_state()

    def stop_server(self, _):
        if self.server_process:
            print("正在停止服务...")
            self.server_process.terminate() 
            self.server_process.wait()      
            self.server_process = None
            self.indicator.set_icon_full(ICON_PATH_DISCONNECT, '服务已停止')
        
        self.update_menu_state()

    def update_menu_state(self):
        is_running = self.server_process is not None
        self.item_start.set_sensitive(not is_running)
        self.item_stop.set_sensitive(is_running)
        self.item_open_browser.set_sensitive(is_running)

    def quit(self, _):
        print("正在退出应用...")
        self.stop_server(None) 
        Gtk.main_quit()
# (以上 ServerIndicator 类未做修改)


if __name__ == "__main__":
    # --- 新增：防止多实例运行 ---
    # 定义一个锁文件的路径
    lock_file_path = f"/tmp/{APPINDICATOR_ID}.lock"
    lock_file = None
    try:
        # 以 'w' 模式打开文件。如果文件不存在，会创建它。
        lock_file = open(lock_file_path, 'w')
        # 尝试获取一个独占的 (EX)、非阻塞的 (NB) 文件锁
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # 如果代码能执行到这里，说明成功获取了锁，我们是第一个实例。
    except (IOError, BlockingIOError):
        # 如果获取锁失败 (抛出异常)，说明有另一个实例在运行。
        print("另一实例已在运行。正在退出。")
        if lock_file:
            lock_file.close()
        sys.exit(1) # 立即退出当前脚本
    # --- 结束新增 ---

    # (以下是你的路径检查代码，保持不变)
    error_message = None
    if not os.path.isdir(SERVER_PATH):
        error_message = f"错误: 目录 '{SERVER_PATH}' 不存在。\n请编辑此脚本并设置正确的 SERVER_PATH。"
    elif not os.path.isfile(ICON_PATH_DISCONNECT):
        error_message = f"错误: 图标文件 '{ICON_PATH_DISCONNECT}' 不存在。\n请检查路径。"
    elif not os.path.isfile(ICON_PATH_CONNECT):
        error_message = f"错误: 图标文件 '{ICON_PATH_CONNECT}' 不存在。\n请检查路径。"

    if error_message:
        print(error_message)
        dialog = Gtk.MessageDialog(
            transient_for=None,
            flags=0,
            message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.OK,
            text="启动器配置错误"
        )
        dialog.format_secondary_text(error_message.replace("\n", " "))
        dialog.run()
        dialog.destroy()
        # --- 新增：如果出错，也需要释放锁并退出 ---
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
        sys.exit(1)
        # --- 结束新增 ---
    else:
        # --- 修改：将 Gtk 循环放入 try...finally 块中 ---
        try:
            # 所有文件都OK，启动Gtk主循环
            ServerIndicator()
            Gtk.main()
        finally:
            # 当 Gtk.main_quit() 被调用后，会执行这里
            print("释放文件锁并干净地退出。")
            fcntl.flock(lock_file, fcntl.LOCK_UN) # 释放锁
            lock_file.close()                   # 关闭文件
        # --- 结束修改 ---