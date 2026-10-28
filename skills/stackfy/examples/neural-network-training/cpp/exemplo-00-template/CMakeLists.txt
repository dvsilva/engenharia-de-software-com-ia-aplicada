cmake_minimum_required(VERSION 3.18 FATAL_ERROR)
project(exemplo-00 VERSION 0.0.1 LANGUAGES CXX)

find_package(Torch 2.14 REQUIRED)

add_executable(index index.cpp)
target_link_libraries(index "${TORCH_LIBRARIES}")
set_property(TARGET index PROPERTY CXX_STANDARD 20)
