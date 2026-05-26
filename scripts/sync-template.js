/**
 * 从 npm registry 拉取最新 create-s-blog 包，提取 template 目录到 src-tauri/resources/template
 * 用法: node scripts/sync-template.js
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DEST = join(import.meta.dirname, '..', 'src-tauri', 'resources', 'template');
const tmpDir = mkdtempSync(join(tmpdir(), 'sync-template-'));

try {
  console.log('📦 Downloading create-s-blog from npm...');
  execSync(`npm pack create-s-blog --pack-destination="${tmpDir}"`, { stdio: 'pipe' });

  // 找到 tgz 文件
  const tgz = execSync(`dir /b "${tmpDir}\\*.tgz"`, { encoding: 'utf-8' }).trim();
  const tgzPath = join(tmpDir, tgz);
  console.log(`   ${tgz}`);

  // 解压
  const extractDir = join(tmpDir, 'extracted');
  mkdirSync(extractDir);
  execSync(`tar -xzf "${tgzPath}" -C "${extractDir}"`, { stdio: 'pipe' });

  const sourceTemplate = join(extractDir, 'package', 'template');
  if (!existsSync(sourceTemplate)) {
    throw new Error('template/ not found in package');
  }

  // 清空目标并复制
  if (existsSync(DEST)) {
    rmSync(DEST, { recursive: true });
  }
  cpSync(sourceTemplate, DEST, { recursive: true });

  console.log(`✓ Template synced to src-tauri/resources/template/`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
