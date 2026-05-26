import { useState } from 'react';
import { HomePage, PageType } from './components/HomePage';
import { InitBlogPage } from './components/InitBlog/InitBlogPage';
import { ExistingBlogPage } from './components/ExistingBlog';

/**
 * 应用根组件
 * 需求 7.2: 提供清晰的导航，允许用户在不同功能之间切换
 */
function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  // 用于从初始化页面跳转到现有博客页面时传递目录路径
  const [initialBlogDirectory, setInitialBlogDirectory] = useState<string | undefined>();

  const handleNavigate = (page: PageType) => {
    setInitialBlogDirectory(undefined); // 清除初始目录
    setCurrentPage(page);
  };

  const handleBackToHome = () => {
    setInitialBlogDirectory(undefined); // 清除初始目录
    setCurrentPage('home');
  };

  /**
   * 初始化完成后跳转到现有博客页面
   * @param projectPath 新创建的项目路径
   */
  const handleInitComplete = (projectPath: string) => {
    console.log('[App] handleInitComplete called with:', projectPath);
    setInitialBlogDirectory(projectPath);
    setCurrentPage('existing-blog');
  };

  console.log('[App] render - currentPage:', currentPage, 'initialBlogDirectory:', initialBlogDirectory);

  // 渲染当前页面
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} />;
      
      case 'init-blog':
        // 初始化博客页面 - 需求 4.1, 4.4, 4.6
        return (
          <InitBlogPage 
            onBackToHome={handleBackToHome} 
            onInitComplete={handleInitComplete}
          />
        );
      
      case 'existing-blog':
        // 选择现有博客页面 - 需求 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4
        // 使用 key 确保当 initialDirectory 变化时组件重新挂载
        console.log('[App] rendering ExistingBlogPage with initialDirectory:', initialBlogDirectory);
        return (
          <ExistingBlogPage 
            key={initialBlogDirectory || 'no-initial'}
            onBackToHome={handleBackToHome}
            initialDirectory={initialBlogDirectory}
          />
        );
      
      default:
        return <HomePage onNavigate={handleNavigate} />;
    }
  };

  return renderPage();
}

export default App;
