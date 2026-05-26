import React from "react";
import { Button } from "./common";

/** 页面类型 */
export type PageType = "home" | "init-blog" | "existing-blog";

export interface HomePageProps {
  onNavigate: (page: PageType) => void;
}

/**
 * 主页组件 - 显示功能入口
 * 需求 7.1: 在主界面显示两个主要功能入口按钮
 * 需求 7.2: 提供清晰的导航
 * 需求 7.3: 响应式设计，适应不同窗口大小
 */
export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-sm sm:max-w-md">
        {/* 标题区域 */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            s-writor
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            博客管理桌面应用程序
          </p>
        </div>

        {/* 功能入口按钮 */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-3 sm:space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4 text-center">
            请选择操作
          </h2>

          {/* 初始化博客按钮 */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => onNavigate("init-blog")}
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            初始化博客
          </Button>

          {/* 选择现有博客按钮 */}
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => onNavigate("existing-blog")}
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            选择现有博客
          </Button>
        </div>

        {/* 底部说明 */}
        <p className="text-center text-xs sm:text-sm text-gray-500 mt-4 sm:mt-6">
          使用 s-writor 管理您的s-blog项目
        </p>
      </div>
    </div>
  );
};

export default HomePage;
