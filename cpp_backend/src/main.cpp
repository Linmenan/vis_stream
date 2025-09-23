// vis_stream/cpp_backend/src/main.cpp
#include <iostream>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include "test_message.pb.h"  // 包含生成的头文件
// 定义服务器类型
using Server = websocketpp::server<websocketpp::config::asio>;
using ConnectionHdl = websocketpp::connection_hdl;

// on_open 事件处理器：当一个新连接建立时调用
void on_open(Server* s, ConnectionHdl hdl) {
  std::cout << "Client connected!" << std::endl;

  // 创建Protobuf消息
  vis_stream::TestMessage msg;
  msg.set_content("Hello, Protobuf!");

  // 序列化为二进制字符串
  std::string binary_payload;
  if (!msg.SerializeToString(&binary_payload)) {
    std::cerr << "Failed to serialize message!" << std::endl;
    return;
  }

  // 发送二进制消息
  s->send(hdl, binary_payload, websocketpp::frame::opcode::binary);
}

int main() {
  Server server;
  try {
    // 关闭日志，保持控制台干净
    server.clear_access_channels(websocketpp::log::alevel::all);
    server.clear_error_channels(websocketpp::log::elevel::all);

    // 初始化 Asio
    server.init_asio();

    // 注册事件处理器
    server.set_open_handler(bind(&on_open, &server, std::placeholders::_1));

    // 监听 9002 端口
    uint16_t port = 9002;
    server.listen(port);
    std::cout << "Server started on port " << port << std::endl;

    // 开始接受连接
    server.start_accept();

    // 启动服务器的I/O服务循环
    server.run();
  } catch (websocketpp::exception const& e) {
    std::cerr << "Error: " << e.what() << std::endl;
  } catch (...) {
    std::cerr << "Other exception" << std::endl;
  }
  return 0;
}