# Checklist

- [x] SQL 补全配置模块按 DatabaseType 分离，PostgreSQL 配置完整
- [x] 补全提供者从 connectionStore 获取 schema 元数据
- [x] 补全提供者在 FROM 子句后提示表名/视图名
- [x] 补全提供者在 SELECT 后提示列名、函数名、关键字
- [x] 补全提供者在 schema. 后提示该 schema 下的表名
- [x] 补全提供者始终提示 SQL 关键字和数据类型
- [x] 无连接时仅提供关键字和数据类型补全，不报错
- [x] 补全项类型图标正确（表=Class、列=Field、函数=Function、关键字=Keyword、Schema=Module、类型=Struct）
- [x] 补全项排序：列名 > 表名 > Schema > 函数 > 关键字 > 数据类型
- [x] SqlEditor 接收 connectionId/database/schema prop
- [x] QueryPanel 正确传递连接上下文给 SqlEditor
- [x] typecheck 0 错误
- [x] lint 0 错误/警告
