import path from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import postcssPxToRem from 'postcss-pxtorem'
import { viteMockServe } from 'vite-plugin-mock'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 是否启用本地 mock（无后端时开发联调用），由 VITE_USE_MOCK 环境变量控制
  // 后端接口就绪后，把 .env.development 里的 VITE_USE_MOCK 改为 false 即可关闭
  const useMock = env.VITE_USE_MOCK === 'true'

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
      // 本地 mock：拦截 /ivsms 开头的请求返回模拟数据，便于无后端时开发联调
      // 插件以 enforce: 'pre' 注册，先于代理中间件执行，因此无需改动下方 proxy
      viteMockServe({
        mockPath: 'mock',
        enable: useMock,
        logger: true,
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
        // 开发环境代理：将 /ivsms 转发到后端，解决浏览器 CORS 限制
        // mock 开启时会优先被拦截，mock 关闭后走此代理请求真实后端
        '/ivsms': {
          //服务器
          target: 'http://60.205.199.162:8005',

          //tsh
          // target: 'http://192.168.3.72:8000',
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
