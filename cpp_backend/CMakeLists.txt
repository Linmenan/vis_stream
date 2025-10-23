# vis_stream/cpp_backend/CMakeLists.txt 
cmake_minimum_required(VERSION 3.15)
set(PROJECT_NAME vis_stream_core)

# --- 步骤 1: 定义 Protobuf 源文件和生成目标 ---
get_filename_component(PROTO_FILE "${CMAKE_SOURCE_DIR}/protocol/visualization.proto" ABSOLUTE)
get_filename_component(PROTO_PATH "${CMAKE_SOURCE_DIR}/protocol" ABSOLUTE)

set(PROTO_GENERATED_H "${CMAKE_CURRENT_BINARY_DIR}/visualization.pb.h")
set(PROTO_GENERATED_CC "${CMAKE_CURRENT_BINARY_DIR}/visualization.pb.cc")

add_custom_command(
    OUTPUT ${PROTO_GENERATED_H} ${PROTO_GENERATED_CC}
    COMMAND ${PROTOBUF_PROTOC_EXECUTABLE}
        --cpp_out=${CMAKE_CURRENT_BINARY_DIR}
        -I=${PROTO_PATH}
        ${PROTO_FILE}
    DEPENDS ${PROTO_FILE}
    COMMENT "Generating C++ from visualization.proto"
)

add_custom_target(GenerateProtoSources DEPENDS ${PROTO_GENERATED_H} ${PROTO_GENERATED_CC})

# --- 创建库目标 ---
# 收集源文件
file(GLOB_RECURSE SOURCE_FILES 
    src/*.cpp 
    src/*.cc 
    src/*.hpp 
    src/*.h
)

add_library(${PROJECT_NAME} STATIC 
    ${SOURCE_FILES}
    ${PROTO_GENERATED_CC}
)

add_dependencies(${PROJECT_NAME} GenerateProtoSources)

# --- 目标属性配置 ---
target_include_directories(${PROJECT_NAME} PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<BUILD_INTERFACE:${CMAKE_CURRENT_BINARY_DIR}>
    $<INSTALL_INTERFACE:include>
)

# 第三方库包含路径（不安装）
target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_SOURCE_DIR}/third_party/asio/asio/include
    ${CMAKE_SOURCE_DIR}/third_party/websocketpp
)

target_link_libraries(${PROJECT_NAME}
    PUBLIC
        Boost::system
        Threads::Threads
        protobuf::libprotobuf
)

# --- 安装配置 ---
# 安装目标库
install(
    TARGETS ${PROJECT_NAME}
    EXPORT ${PROJECT_NAME}_targets
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    INCLUDES DESTINATION include
)

# 安装头文件
install(
    DIRECTORY include/
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/${PROJECT_NAME}
)

install(
    FILES ${PROTO_GENERATED_H}
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}/${PROJECT_NAME}
)

# 安装协议文件（可选）
install(
    FILES ${PROTO_FILE}
    DESTINATION ${CMAKE_INSTALL_DATADIR}/${PROJECT_NAME}/protocol
)

# --- 导出目标 ---
install(
    EXPORT ${PROJECT_NAME}_targets
    FILE ${PROJECT_NAME}_targets.cmake
    NAMESPACE vis_stream::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}
)

# --- 创建包配置文件 ---
include(CMakePackageConfigHelpers)

# 修改：使用新的配置文件路径
configure_package_config_file(
    ${CMAKE_SOURCE_DIR}/cmake/config.cmake.in
    "${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config.cmake"
    INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}
)

install(
    FILES "${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config.cmake"
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}
)

# 版本文件
write_basic_package_version_file(
    "${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config-version.cmake"
    VERSION ${VisStream_VERSION}
    COMPATIBILITY AnyNewerVersion
)

install(
    FILES "${CMAKE_CURRENT_BINARY_DIR}/${PROJECT_NAME}-config-version.cmake"
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}
)