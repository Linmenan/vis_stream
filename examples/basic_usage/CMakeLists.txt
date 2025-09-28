# examples/basic_usage/CMakeLists.txt
cmake_minimum_required(VERSION 3.15)
project(ExampleBasicUsage)

# 创建可执行文件
add_executable(example_3d_usage main_3d.cpp)
add_executable(example_2d_usage main_2d.cpp)

# 链接我们的核心库！
# CMake会自动处理依赖关系，将vis_stream_core库需要的所有头文件路径和链接库都传递过来。
target_link_libraries(example_3d_usage PRIVATE vis_stream_core)
target_link_libraries(example_2d_usage PRIVATE vis_stream_core)

# --- 新增：安装示例程序（可选） ---
install(TARGETS example_3d_usage example_2d_usage
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)