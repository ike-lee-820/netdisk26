#!/bin/bash
# fix_worker.sh - 修复 worker.js 中 renderDetail 函数的模板字符串问题

FILE="worker.js"
BACKUP="worker.js.bak"

if [ ! -f "$FILE" ]; then
    echo "错误: 未找到 $FILE"
    exit 1
fi

# 备份原文件
cp "$FILE" "$BACKUP"
echo "已备份到 $BACKUP"

# 使用 Python 进行替换
python3 <<'PYEOF'
import re

with open('worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_func = """async function renderDetail() {
    const item = currentDetailItem;
    const card = document.getElementById('detailCard');
    let actionsHtml = '<button class="btn btn-primary" onclick="downloadDetailFile()">下载</button>' +
        '<button class="btn btn-secondary" onclick="shareDetailFile()">分享</button>' +
        '<button class="btn btn-secondary" onclick="getDetailDirectLink()">获取直链</button>' +
        '<button class="btn btn-secondary" onclick="renameDetailItem()">重命名</button>' +
        '<button class="btn btn-danger" onclick="deleteDetailItem()">删除</button>';
    const ext = (item.name.split('.').pop() || '').toLowerCase();
    if (['txt','md','json','js','ts','css','html','xml','log'].includes(ext)) {
        actionsHtml += '<button class="btn btn-secondary" onclick="editDetailText()">编辑</button>';
    }
    card.innerHTML = '<div class="detail-header">' +
        '<div class="file-icon ' + getIconClass(item) + '" style="width:48px;height:48px;font-size:24px;">' + getFileIcon(item) + '</div>' +
        '<div class="detail-title">' + item.name + '</div>' +
        '</div>' +
        '<div class="detail-meta">' +
        '<span>大小: ' + formatSize(item.size) + '</span> · ' +
        '<span>修改时间: ' + formatTime(item.updatedAt || item.createdAt) + '</span> · ' +
        '<span>类型: ' + (item.mimeType || '未知') + '</span>' +
        '</div>' +
        '<div class="detail-actions">' + actionsHtml + '</div>' +
        '<div class="preview-container" id="previewContainer"></div>';
    await loadPreview(item);
}"""

pattern = re.compile(r'async function renderDetail\(\) \{.*?\n\}', re.DOTALL)
content, count = pattern.subn(new_func, content)

if count == 0:
    print("未找到 renderDetail 函数，可能已修复或代码格式不同。")
else:
    with open('worker.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("修复完成！")
PYEOF

echo "脚本执行结束"
