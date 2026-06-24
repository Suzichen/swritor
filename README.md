# s-writor

基于 Tauri 框架的桌面博客管理应用程序，用于管理和初始化 S-Blog 博客项目。

## 功能特性

- 🚀 **初始化博客** - 通过图形化界面创建新的 S-Blog 博客项目
- 📂 **管理现有博客** - 选择并查看现有博客项目的文件结构
- ⚡ **Rust 驱动** - 使用 [s-blog](https://github.com/Suzichen/s-blog) 系列 Rust crate（scaffold / engine），无需外部运行时
- 🌐 **在线模板** - 初始化时自动从 npm registry 拉取最新项目模板
- 🖥️ **跨平台支持** - 支持 Windows 和 macOS 平台

## 技术栈

- **桌面框架**: Tauri 2.x（Rust 后端 + WebView 前端）
- **前端**: React 18 + TypeScript + Vite
- **样式**: Tailwind CSS
- **初始化引擎**: s-blog-scaffold（Rust crate，项目脚手架生成）
- **构建引擎**（计划中）: s-blog-engine（Rust crate，博客构建和数据生成）

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

### 3. （可选）更新 Rust 依赖到最新版本

s-blog相关依赖 通过 git 依赖引入，Cargo.lock 会锁定 commit。如需拉取最新：

```bash
cd src-tauri
cargo update
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
│   ├── capabilities/       # 权限配置
│   ├── icons/              # 应用图标
│   ├── Cargo.toml          # Rust 依赖配置
│   └── tauri.conf.json     # Tauri 配置
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

## 架构说明

### 模板策略

初始化博客时，`s-blog-scaffold` crate 使用编译时内嵌的模板文件。使用最新s-blog模板需更新 scaffold 依赖：

```bash
cd src-tauri
cargo update
```

### s-blog crate 集成

通过 Cargo git 依赖引入 [s-blog](https://github.com/Suzichen/s-blog) 仓库中的 crate：

**当前已集成：**

- `s-blog-scaffold` — 博客项目脚手架生成（目录结构、配置文件模板渲染）
- `s-blog-engine` — 博客构建管线（frontmatter 解析、相册处理、SEO / Sitemap / RSS 生成）

开发时如需联调本地 s-blog 仓库，可在 `Cargo.toml` 末尾添加 `[patch]` 段：

```toml
[patch."https://github.com/Suzichen/s-blog.git"]
s-blog-scaffold = { path = "../s-blog/crates/s-blog-scaffold" }
s-blog-engine = { path = "../s-blog/crates/s-blog-engine" }
```

## TODO

- [x] 初始化博客项目（在线拉取模板）
- [x] 选择并浏览现有博客目录结构
- [x] 编辑配置（config.json / album.config.json 可视化编辑）
- [ ] 编写文章（Markdown 编辑器，frontmatter 表单）
- [ ] 管理相册（相册浏览、图片增删、封面设置）
- [x] 启动预览（调用 s-blog-engine serve 并在浏览器中查看效果）
- [x] 构建（一键 build，输出产物目录）
- [ ] 构建发布（一键构建并发布到对应平台）

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
