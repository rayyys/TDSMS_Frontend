import path from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import postcssPxToRem from 'postcss-pxtorem'

export default defineConfig(() => {
  return {
    plugins: [
      vue(),
      // 自动导入 vue / vue-router 的 API（ref、reactive、useRouter 等），无需手动 import
      AutoImport({
        imports: ['vue', 'vue-router'],
        resolvers: [ElementPlusResolver()],
        dts: 'src/auto-imports.d.ts',
      }),
      // 自动按需导入 Element Plus 组件，模板里直接用 <el-button> 等
      Components({
        resolvers: [ElementPlusResolver()],
        dts: 'src/components.d.ts',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src'),
      },
    },
    server: {
      port: 8085,
      host: '0.0.0.0',
      open: true,
      proxy: {
        // 开发环境代理：将 /tdsms 转发到后端，解决浏览器 CORS 限制
        // 前端8006 后端8007，ip不变
        '/tdsms': {
          //服务器
          // target: 'http://60.205.199.162:8007',

          //本地
          target: 'http://192.168.3.72:8000',
          changeOrigin: true,
        },
      },
    },
    css: {
      postcss: {
        plugins: [
          // px → rem 自动转换，配合 src/utils/rem.js 做屏幕自适应
          postcssPxToRem({
            rootValue: 16,
            propList: ['*'],
            mediaQuery: false,
            minPixelValue: 0, // 小于 2px 的边框等不转换，避免缩放后边框模糊或消失
          }),
        ],
      },
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
        },
      },
    },
  }
})
