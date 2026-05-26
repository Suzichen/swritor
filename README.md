# s-writor

基于 Tauri 框架的桌面博客管理应用程序，用于管理和初始化 S-Blog 博客项目。

## 功能特性

- 🚀 **初始化博客** - 通过图形化界面创建新的 S-Blog 博客项目
- 📂 **管理现有博客** - 选择并查看现有博客项目的文件结构
- ⚡ **Rust 引擎** - 使用 [s-blog-engine](https://github.com/Suzichen/s-blog/blob/master/crates/s-blog-engine/INTEGRATION.md) 纯 Rust 实现，无需外部运行时
- 🌐 **在线模板** - 初始化时自动从 npm registry 拉取最新项目模板
- 🖥️ **跨平台支持** - 支持 Windows 和 macOS 平台

## 技术栈

- **桌面框架**: Tauri 2.x（Rust 后端 + WebView 前端）
- **前端**: React 18 + TypeScript + Vite
- **样式**: Tailwind CSS
- **初始化引擎**: s-blog-engine（Rust crate，处理博客构建和数据生成）

## 环境要求

### 开发环境

- Node.js 18+
- Rust 1.70+
- Tauri CLI 2.x

### 安装 Rust

```bash
# Windows (PowerShell)
winget install Rustlang.Rustup

# macOS
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 安装 Tauri CLI

```bash
npm install -g @tauri-apps/cli
```

## 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:Suzichen/s-blog-management.git
cd s-blog-management
```

### 2. 安装依赖

```bash
npm install
```

### 3. （可选）同步模板到本地

应用运行时会在线拉取最新模板。如果需要离线开发或提前缓存：

```bash
npm run sync-template
```

### 4. 开发模式运行

```bash
npm run tauri dev
```

### 5. 构建生产版本

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/` 目录下。

## 项目结构

```
s-writor/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   ├── App.tsx             # 应用根组件
│   ├── main.tsx            # 入口文件
│   └── styles.css          # 全局样式
├── src-tauri/              # Tauri 后端源码
│   ├── src/                # Rust 源码
│   │   ├── commands.rs     # Tauri 命令（初始化、目录操作等）
│   │   ├── template_fetcher.rs  # npm 模板下载模块
│   │   ├── error.rs        # 错误类型
│   │   ├── models.rs       # 数据模型
│   │   └── lib.rs          # 入口
│   ├── resources/          # 本地模板缓存（fallback，gitignored）
│   ├── capabilities/       # 权限配置
│   ├── icons/              # 应用图标
│   ├── Cargo.toml          # Rust 依赖配置
│   └── tauri.conf.json     # Tauri 配置
├── scripts/                # 工具脚本
│   └── sync-template.js    # 从 npm 同步模板到本地
├── package.json            # Node.js 依赖配置
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind CSS 配置
└── tsconfig.json           # TypeScript 配置
```

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（仅前端） |
| `npm run build` | 构建前端代码 |
| `npm run tauri dev` | 启动 Tauri 开发模式（完整应用） |
| `npm run tauri build` | 构建生产版本安装包 |
| `npm run sync-template` | 从 npm 同步最新项目模板到本地 |

## 架构说明

### 模板获取策略

初始化博客时，应用会：

1. **在线获取**（首选）：从 npm registry 下载最新 `create-s-blog` 包，提取模板文件
2. **离线回退**：如果网络不可用，使用本地 `src-tauri/resources/template/` 中的缓存模板

### s-blog-engine 集成

通过 Cargo git 依赖引入 `s-blog-engine` crate，提供：

- 博客文章 frontmatter 解析
- 相册数据生成与缩略图处理
- SEO 页面 / Sitemap / RSS 生成
- 完整构建管线

开发时可在 `Cargo.toml` 底部取消 `[patch]` 注释，指向本地 s-blog 仓库进行联调。

## TODO

- [x] 初始化博客项目（在线拉取模板）
- [x] 选择并浏览现有博客目录结构
- [ ] 编辑配置（config.json / album.config.json 可视化编辑）
- [ ] 编写文章（Markdown 编辑器，frontmatter 表单）
- [ ] 管理相册（相册浏览、图片增删、封面设置）
- [ ] 启动预览（调用 s-blog-engine serve 并在浏览器中查看效果）
- [ ] 构建发布（一键 build，输出产物目录）

## 使用说明

### 初始化新博客

1. 启动应用后，点击「初始化博客」按钮
2. 选择博客项目的创建目录
3. 填写博客配置信息（项目名称、描述、作者等）
4. 点击确认，等待模板下载和初始化完成
5. 初始化成功后自动跳转到项目浏览页面

### 管理现有博客

1. 点击「选择现有博客」按钮
2. 选择已有的博客项目目录
3. 查看项目文件结构和日志信息

## 许可证

MIT
