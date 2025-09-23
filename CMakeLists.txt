# vis_stream/CMakeLists.txt
cmake_minimum_required(VERSION 3.15)
project(VisStream)

find_package(Protobuf REQUIRED)

# 将第三方库的头文件目录加入包含路径
# 这样子项目就可以直接使用了
include_directories(
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/asio/asio/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party/websocketpp"
)

# 添加子目录，让CMake处理它们的构建
add_subdirectory(cpp_backend)