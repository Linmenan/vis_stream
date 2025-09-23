# vis_stream/cpp_backend/CMakeLists.txt 
cmake_minimum_required(VERSION 3.15)

# --- 步骤 1: 定义 Protobuf 源文件和生成目标 ---
get_filename_component(PROTO_FILE "${CMAKE_SOURCE_DIR}/protocol/test_message.proto" ABSOLUTE)
get_filename_component(PROTO_PATH "${CMAKE_SOURCE_DIR}/protocol" ABSOLUTE)

set(PROTO_GENERATED_H "${CMAKE_CURRENT_BINARY_DIR}/test_message.pb.h")
set(PROTO_GENERATED_CC "${CMAKE_CURRENT_BINARY_DIR}/test_message.pb.cc")
set(PROTO_GENERATED_FILES ${PROTO_GENERATED_H} ${PROTO_GENERATED_CC})

add_custom_command(
    OUTPUT ${PROTO_GENERATED_FILES}
    COMMAND ${PROTOBUF_PROTOC_EXECUTABLE}
        --cpp_out=${CMAKE_CURRENT_BINARY_DIR}
        -I=${PROTO_PATH}
        ${PROTO_FILE}
    DEPENDS ${PROTO_FILE}
    COMMENT "Generating C++ from test_message.proto"
)

add_custom_target(GenerateProtoSources DEPENDS ${PROTO_GENERATED_FILES})


# --- 步骤 2: 创建可执行目标 ---
# 将 add_executable 提前，这是关键的修正点！
# 此时，我们已经定义了 PROTO_GENERATED_CC 变量，可以将其作为源文件加入。
add_executable(vis_stream_server
    src/main.cpp
    ${PROTO_GENERATED_CC}
)


# --- 步骤 3: 为已存在的目标添加属性和依赖 ---
# 现在 vis_stream_server 目标已经存在，下面的命令可以正常执行。

# 确保在编译 vis_stream_server 之前，先执行生成 proto 文件的目标。
add_dependencies(vis_stream_server GenerateProtoSources)

# 为 vis_stream_server 添加包含目录，以便 #include "test_message.pb.h" 可以被找到。
target_include_directories(vis_stream_server
    PRIVATE
    ${CMAKE_CURRENT_BINARY_DIR}
)

# 查找并链接 vis_stream_server 需要的库。
find_package(Boost REQUIRED COMPONENTS system)
find_package(Threads REQUIRED)

target_link_libraries(vis_stream_server
    PRIVATE
        Boost::system
        Threads::Threads
        protobuf::libprotobuf
)