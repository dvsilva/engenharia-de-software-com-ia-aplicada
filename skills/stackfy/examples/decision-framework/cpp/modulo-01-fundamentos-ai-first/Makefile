CXXFLAGS ?= -std=c++20 -O2 -Wall -Wextra -pedantic

build/decision_framework_tool: decision_framework_tool.cpp
	@mkdir -p build
	@$(CXX) $(CXXFLAGS) -o $@ $<
