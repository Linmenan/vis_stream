# vis_stream/cpp_backend/CMakeLists.txt 
cmake_minimum_required(VERSION 3.15)

# --- 步骤 1: 定义 Protobuf 源文件和生成目标 ---
get_filename_component(PROTO_FILE "${CMAKE_SOURCE_DIR}/protocol/visualization.proto" ABSOLUTE)
get_filename_component(PROTO_PATH "${CMAKE_SOURCE_DIR}/protocol" ABSOLUTE)

set(PROTO_GENERATED_H "${CMAKE_CURRENT_BINARY_DIR}/visualization.pb.h")
set(PROTO_GENERATED_CC "${CMAKE_CURRENT_BINARY_DIR}/visualization.pb.cc")
set(PROTO_GENERATED_FILES ${PROTO_GENERATED_H} ${PROTO_GENERATED_CC})

add_custom_command(
    OUTPUT ${PROTO_GENERATED_FILES}
    COMMAND ${PROTOBUF_PROTOC_EXECUTABLE}
        --cpp_out=${CMAKE_CURRENT_BINARY_DIR}
        -I=${PROTO_PATH}
        ${PROTO_FILE}
    DEPENDS ${PROTO_FILE}
    COMMENT "Generating C++ from visualization.proto"
)

add_custom_target(GenerateProtoSources DEPENDS ${PROTO_GENERATED_FILES})

# --- 步骤 2: 定义库的目标 ---
# 使用 add_library 而不是 add_executable
add_library(vis_stream_core STATIC 
    src/visualization_server.cpp
    ${PROTO_GENERATED_CC}
)


# --- 步骤 3: 为库添加依赖和属性 ---
add_dependencies(vis_stream_core GenerateProtoSources)


# 查找库所需的依赖包
find_package(Boost REQUIRED COMPONENTS system)
find_package(Threads REQUIRED)

# PUBLIC: 使用这个库的项目需要包含 include 目录以找到 vis_stream.h
# PRIVATE: 库自身编译需要包含这些目录
target_include_directories(vis_stream_core
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        ${CMAKE_CURRENT_BINARY_DIR}
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# PUBLIC: 使用这个库的项目也需要链接这些依赖
# INTERFACE: 使用这个库的项目需要这些设置，但库本身编译时不需要
target_link_libraries(vis_stream_core
    PRIVATE
        Boost::system
        Threads::Threads
        protobuf::libprotobuf
)