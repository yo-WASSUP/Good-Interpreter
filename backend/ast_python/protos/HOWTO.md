# Python gRPC 和 Protobuf 代码生成指南

## 准备工作

### 1. 安装依赖工具

```bash
# 安装 protoc 编译器 (选择适合您系统的版本)
# Linux
wget https://github.com/protocolbuffers/protobuf/releases/download/v21.12/protoc-21.12-linux-x86_64.zip
unzip protoc-21.12-linux-x86_64.zip -d $HOME/.local
export PATH="$PATH:$HOME/.local/bin"

# macOS (使用 Homebrew)
brew install protobuf

# 安装 Python 依赖
pip3 install grpcio grpcio-tools protobuf
```

### 2. 准备项目结构

确保您的项目包含以下目录结构：
```
my_project/
├── protos/
│   ├── common/
│   │   ├── events.proto
│   │   └── rpcmeta.proto
│   └── products/
│       └── understanding/
│           ├── base/
│           │   └── au_base.proto
│           └── ast/
│               └── ast_service.proto
└── build_python.sh  # 本脚本
```

## 生成代码

运行构建脚本：
```bash
# 添加执行权限
chmod +x build_python.sh

# 执行脚本
./build_python.sh
```

生成的文件将位于 `python_protogen` 目录：
```
python_protogen/
├── common/
│   ├── events_pb2.py
│   ├── events_pb2_grpc.py
│   ├── rpcmeta_pb2.py
│   └── rpcmeta_pb2_grpc.py
└── products/
    └── understanding/
        ├── base/
        │   ├── au_base_pb2.py
        │   └── au_base_pb2_grpc.py
        └── ast/
            ├── ast_service_pb2.py
            └── ast_service_pb2_grpc.py
```

## 在 Python 项目中使用

### 1. 添加生成代码到项目
将 `python_protogen` 目录复制到您的 Python 项目中
