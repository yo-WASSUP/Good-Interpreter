#!/bin/bash

# Python Protobuf & gRPC 代码生成脚本
# 生成的 python_protogen 将放在当前目录的上一级目录中

set -e  # 出错时退出

# 1. 检查依赖
if ! python3 -c "import grpc_tools.protoc" &> /dev/null; then
    echo "错误: 未安装 grpcio-tools"
    echo "请运行: pip install grpcio-tools"
    exit 1
fi

# 2. 设置路径
script_dir="$(cd "$(dirname "$0")" && pwd)"  # 脚本所在目录的绝对路径
project_root="$(dirname "$script_dir")"       # 上一级目录（项目根目录）
output_dir="${project_root}/python_protogen"  # 输出到项目根目录

# 3. 创建输出目录
echo "将在项目根目录创建输出目录: $output_dir"
mkdir -p "$output_dir"

# 4. 生成 Python 代码
echo "生成 Python 代码到: $output_dir"
python3 -m grpc_tools.protoc \
  --proto_path="$script_dir" \
  --python_out="$output_dir" \
  --grpc_python_out="$output_dir" \
  "$script_dir/common/events.proto" \
  "$script_dir/common/rpcmeta.proto" \
  "$script_dir/products/understanding/base/au_base.proto" \
  "$script_dir/products/understanding/ast/ast_service.proto"

# 5. 修复导入路径
echo "修复导入路径..."
find "$output_dir" -name "*.py" -exec sed -i.bak \
  -e 's/^from common/from python_protogen.common/' \
  -e 's/^from products/from python_protogen.products/' {} \;

# 删除备份文件
find "$output_dir" -name "*.bak" -delete

# 6. 创建 __init__.py 文件
echo "创建包初始化文件..."
find "$output_dir" -type d -exec touch {}/__init__.py \;

echo "✅ Python protobuf 和 gRPC 代码生成完成"
echo "输出目录: $output_dir"