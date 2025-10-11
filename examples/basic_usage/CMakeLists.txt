# examples/basic_usage/CMakeLists.txt
cmake_minimum_required(VERSION 3.15)
project(ExampleBasicUsage)

# 创建可执行文件
add_executable(basic_geometries_demo basic_geometries_demo.cpp)
add_executable(window_management_demo window_management_demo.cpp)
add_executable(complex_animations_demo complex_animations_demo.cpp)
add_executable(object_management_demo object_management_demo.cpp)
# 链接我们的核心库！
target_link_libraries(basic_geometries_demo  PRIVATE vis_stream_core)
target_link_libraries(window_management_demo  PRIVATE vis_stream_core)
target_link_libraries(complex_animations_demo  PRIVATE vis_stream_core)
target_link_libraries(object_management_demo  PRIVATE vis_stream_core)

# --- 新增：安装示例程序（可选） ---
install(TARGETS 
  basic_geometries_demo 
  window_management_demo 
  complex_animations_demo 
  object_management_demo 
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)